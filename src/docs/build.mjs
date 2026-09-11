import fs from "node:fs";
import path from "node:path";
import { flowOutDir } from "../config.mjs";
import { parseScriptMd } from "../script/generate.mjs";
import { annotateShot } from "./annotate.mjs";
import { assertIdentifier, pathInside } from "../security/paths.mjs";
import { publicUrl } from "../security/urls.mjs";
import { escapeHtml, markdownText, inlineCode } from "./escape.mjs";

const FPS = 30;

function tc(frames) {
	const s = frames / FPS;
	const mm = Math.floor(s / 60);
	const ss = (s % 60).toFixed(3).padStart(6, "0");
	return `00:${String(mm).padStart(2, "0")}:${ss}`;
}

function chapterTs(frames) {
	const s = Math.floor(frames / FPS);
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function paginate(words) {
	const pages = [];
	let page = null;
	for (const w of words) {
		const prev = page?.words[page.words.length - 1];
		const gap = prev ? w.startFrame - prev.endFrame : 0;
		if (!page || page.words.length >= 5 || gap > 24) {
			page = { start: w.startFrame, end: w.endFrame, words: [] };
			pages.push(page);
		}
		page.words.push(w);
		page.end = w.endFrame;
	}
	return pages;
}

function actionLine(a) {
	switch (a.kind) {
		case "goto":
			return `Go to ${inlineCode(new URL(a.url).pathname)}`;
		case "click":
			return `Click **${markdownText(a.elementText || a.selector)}**`;
		case "fill":
			return `Enter ${a.redact ? "your value" : inlineCode(a.value)} in **${markdownText(a.elementText || a.selector)}**`;
		case "press":
			return `Press ${inlineCode(a.value)}`;
		case "hover":
			return `Hover over **${markdownText(a.elementText || a.selector)}**`;
		case "select":
			return `Select **${markdownText(a.value)}**`;
		case "scroll":
			return a.value ? `Scroll to ${markdownText(a.value)}` : "Scroll down";
		case "waitLong":
			return `Wait for ${markdownText(a.value)}`;
		default:
			return null;
	}
}

export async function buildDocs(flow, config) {
	const outDir = flowOutDir(config, flow.id);
	const capDir = path.join(outDir, "capture");
	const events = JSON.parse(fs.readFileSync(path.join(capDir, "events.json")));
	const timeline = JSON.parse(fs.readFileSync(path.join(outDir, "compose", "timeline.json")));
	const { blocks } = parseScriptMd(path.join(outDir, "script", "script.md"));
	const narrationOf = (id) => blocks.find((b) => b.blockId === id)?.text || "";
	const docsDir = path.join(outDir, "docs");
	const shotsOut = path.join(docsDir, "shots");
	fs.mkdirSync(shotsOut, { recursive: true });
	const dsf = events.meta.viewport.dsf;
	const accent = config.brand?.colors?.accent || "#8B5CF6";
	const canonical = (url) => {
		try {
			const u = new URL(url);
			u.host = events.meta.canonicalHost;
			return publicUrl(u.href);
		} catch {
			return publicUrl(url);
		}
	};

	// guide.md
	const md = [`# ${markdownText(events.meta.title)}`, "", markdownText(narrationOf("intro")), ""];
	const jsonSteps = [];
	for (const [i, s] of events.steps.entries()) {
		assertIdentifier(s.stepId, "recorded step id");
		const tStep = timeline.steps.find((x) => x.stepId === s.stepId);
		const firstTarget = s.actions.find((a) => (a.kind === "click" || a.kind === "fill") && a.bbox);
		// Every step shows its RESULT (the after shot). If the recorder re-verified the clicked
		// element there (bboxAfter: sidebar links persist across navigation, tabs stay in place),
		// draw the box on it. If the element is gone from the destination (grid cards), fall back
		// to the click-moment frame, whose scroll matches the recorded bbox exactly.
		const navigated = canonical(s.urlAfter) !== canonical(s.urlBefore);
		// Also fall back to the click frame when the click opened a modal: the after-shot shows
		// the dialog, and the clicked button behind it is dimmed.
		const useClickFrame = firstTarget && ((navigated && !s.bboxAfter) || s.dialogAfter);
		const shotName = `${s.stepId}.jpg`;
		await annotateShot({
			shotPath: pathInside(capDir, useClickFrame ? firstTarget?.shotAtClick || s.shotBefore : s.shotAfter),
			bbox: useClickFrame ? firstTarget?.bbox || null : s.bboxAfter || null,
			dsf,
			accent,
			outPath: pathInside(shotsOut, shotName),
		});
		const lines = s.actions.map(actionLine).filter(Boolean);
		md.push(`## ${i + 1}. ${markdownText(tStep?.title || s.stepId)}`, "");
		if (lines.length) md.push(...lines.map((l) => `- ${l}`), "");
		const narration = narrationOf(`step:${s.stepId}`);
		if (narration) md.push(markdownText(narration), "");
		md.push(`![${markdownText(tStep?.title || s.stepId)}](shots/${shotName})`, "");
		if (s.urlAfter !== s.urlBefore && !s.urlBefore.startsWith("about:")) {
			md.push(`You end up on ${inlineCode(new URL(canonical(s.urlAfter)).pathname)}.`, "");
		}
		jsonSteps.push({
			index: i + 1,
			id: s.stepId,
			title: tStep?.title || s.stepId,
			narration,
			actions: s.actions
				.filter((a) => a.kind !== "pause")
				.map((a) => ({
					kind: a.kind,
					selector: a.selector || null,
					elementText: a.elementText || null,
					value: a.redact ? "<redacted>" : (a.value ?? null),
					url: a.url ? canonical(a.url) : null,
				})),
			screenshot: `docs/shots/${shotName}`,
			expectedUrl: canonical(s.urlAfter),
		});
	}
	const outroText = narrationOf("outro");
	if (outroText) md.push(`## Wrap up`, "", markdownText(outroText), "");
	fs.writeFileSync(path.join(docsDir, "guide.md"), md.join("\n"));

	// tutorial.json (agent-executable)
	const tutorial = {
		schema: "tutorial/v1",
		id: flow.id,
		title: events.meta.title,
		goal: events.meta.goal,
		baseUrl: canonical(events.meta.baseUrl),
		generatedAt: new Date().toISOString(),
		sourceFlowHash: events.meta.flowHash,
		durationSec: Number((timeline.meta.durationInFrames / FPS).toFixed(1)),
		video: {
			file: fs.existsSync(path.join(outDir, "render", "final-1080p.mp4"))
				? "render/final-1080p.mp4"
				: "render/proof.mp4",
			width: 1920,
			height: 1080,
			chapters: timeline.chapters.map((c) => ({
				title: c.title,
				startSec: Number((c.startFrame / FPS).toFixed(1)),
			})),
		},
		captionsFile: "docs/captions.vtt",
		steps: jsonSteps,
	};
	fs.writeFileSync(path.join(docsDir, "tutorial.json"), JSON.stringify(tutorial, null, 1));

	// captions.vtt
	const allWords = [
		...(timeline.intro.words || []),
		...timeline.steps.flatMap((s) => s.words || []),
		...(timeline.outro.words || []),
	];
	const vtt = ["WEBVTT", ""];
	for (const p of paginate(allWords)) {
		vtt.push(`${tc(p.start)} --> ${tc(p.end + 6)}`);
		vtt.push(p.words.map((w) => escapeHtml(w.text).replace(/[\r\n]/g, " ")).join(" "));
		vtt.push("");
	}
	fs.writeFileSync(path.join(docsDir, "captions.vtt"), vtt.join("\n"));

	// chapters.txt (YouTube format)
	fs.writeFileSync(
		path.join(docsDir, "chapters.txt"),
		timeline.chapters.map((c) => `${chapterTs(c.startFrame)} ${c.title}`).join("\n") + "\n",
	);

	// publish-snippets.md
	const snippets = `# Publish snippets for ${flow.id}

## Video library entry

\`\`\`js
${JSON.stringify({ title: events.meta.title, tags: [], url: "<uploaded video URL>" }, null, 2)}
\`\`\`

## Written guide (docs site + llms.txt)

1. Copy \`docs/guide.md\` to the product repo (e.g. \`docs/tutorials/${flow.id}.md\`).
2. Copy the screenshot directory alongside it and check the image links.
3. Add the guide to your site's navigation and, if used, its llms.txt index.

## Agent artifact

\`docs/tutorial.json\` is machine-readable (schema tutorial/v1): goal, ordered steps with selectors
and URLs, expected outcomes, video chapters. Serve it next to the guide for AI agents.
Review all artifacts for private data before publishing. Query parameters and URL fragments
are omitted; add any required non-sensitive routing information after review.
`;
	fs.writeFileSync(path.join(docsDir, "publish-snippets.md"), snippets);
	console.log(`docs: ${docsDir} (guide.md, tutorial.json, captions.vtt, chapters.txt, publish-snippets.md)`);
	return docsDir;
}
