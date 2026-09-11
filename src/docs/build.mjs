import fs from "node:fs";
import path from "node:path";
import { flowOutDir } from "../config.mjs";
import { parseScriptMd } from "../script/generate.mjs";
import { annotateShot } from "./annotate.mjs";

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
		case "goto": return `Go to \`${new URL(a.url).pathname}\``;
		case "click": return `Click **${a.elementText || a.selector}**`;
		case "fill": return `Enter ${a.redact ? "your value" : `\`${a.value}\``} in **${a.elementText || a.selector}**`;
		case "press": return `Press \`${a.value}\``;
		case "hover": return `Hover over **${a.elementText || a.selector}**`;
		case "select": return `Select **${a.value}**`;
		case "scroll": return a.value ? `Scroll to ${a.value}` : "Scroll down";
		case "waitLong": return `Wait for ${a.value}`;
		default: return null;
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
			return u.href;
		} catch {
			return url;
		}
	};

	// guide.md
	const md = [`# ${events.meta.title}`, "", narrationOf("intro"), ""];
	const jsonSteps = [];
	for (const [i, s] of events.steps.entries()) {
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
			shotPath: path.join(capDir, useClickFrame ? firstTarget?.shotAtClick || s.shotBefore : s.shotAfter),
			bbox: useClickFrame ? firstTarget?.bbox || null : s.bboxAfter || null,
			dsf,
			accent,
			outPath: path.join(shotsOut, shotName),
		});
		const lines = s.actions.map(actionLine).filter(Boolean);
		md.push(`## ${i + 1}. ${tStep?.title || s.stepId}`, "");
		if (lines.length) md.push(...lines.map((l) => `- ${l}`), "");
		const narration = narrationOf(`step:${s.stepId}`);
		if (narration) md.push(narration, "");
		md.push(`![${tStep?.title || s.stepId}](shots/${shotName})`, "");
		if (s.urlAfter !== s.urlBefore && !s.urlBefore.startsWith("about:")) {
			md.push(`You end up on \`${new URL(canonical(s.urlAfter)).pathname}\`.`, "");
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
					value: a.redact ? "<redacted>" : a.value ?? null,
					url: a.url ? canonical(a.url) : null,
				})),
			screenshot: `docs/shots/${shotName}`,
			expectedUrl: canonical(s.urlAfter),
		});
	}
	const outroText = narrationOf("outro");
	if (outroText) md.push(`## Wrap up`, "", outroText, "");
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
			file: "render/final-1080p.mp4",
			width: timeline.meta.width,
			height: timeline.meta.height,
			chapters: timeline.chapters.map((c) => ({ title: c.title, startSec: Number((c.startFrame / FPS).toFixed(1)) })),
		},
		captionsFile: "docs/captions.vtt",
		steps: jsonSteps,
	};
	fs.writeFileSync(path.join(docsDir, "tutorial.json"), JSON.stringify(tutorial, null, 1));

	// captions.vtt
	const allWords = [...(timeline.intro.words || []), ...timeline.steps.flatMap((s) => s.words || []), ...(timeline.outro.words || [])];
	const vtt = ["WEBVTT", ""];
	for (const p of paginate(allWords)) {
		vtt.push(`${tc(p.start)} --> ${tc(p.end + 6)}`);
		vtt.push(p.words.map((w) => w.text).join(" "));
		vtt.push("");
	}
	fs.writeFileSync(path.join(docsDir, "captions.vtt"), vtt.join("\n"));

	// chapters.txt (YouTube format)
	fs.writeFileSync(
		path.join(docsDir, "chapters.txt"),
		timeline.chapters.map((c) => `${chapterTs(c.startFrame)} ${c.title}`).join("\n") + "\n"
	);

	// publish-snippets.md
	const snippets = `# Publish snippets for ${flow.id}

## faceless /tutorials page (src/components/Project/Tutorials.jsx, TUTORIALS array)

\`\`\`js
{ title: "${events.meta.title}", tags: [], url: "<uploaded video url>" },
\`\`\`

## Written guide (docs site + llms.txt)

1. Copy \`docs/guide.md\` to the product repo (e.g. \`docs/tutorials/${flow.id}.md\`).
2. Register it in \`src/lib/devDocs.js\` (a TUTORIALS list mirroring DEV_GUIDES).
3. Run \`npm run generate:agents\` and commit the regenerated llms.txt artifacts.

## Agent artifact

\`docs/tutorial.json\` is machine-readable (schema tutorial/v1): goal, ordered steps with selectors
and urls, expected outcomes, video chapters. Serve it next to the guide for AI agents.
`;
	fs.writeFileSync(path.join(docsDir, "publish-snippets.md"), snippets);
	console.log(`docs: ${docsDir} (guide.md, tutorial.json, captions.vtt, chapters.txt, publish-snippets.md)`);
	return docsDir;
}
