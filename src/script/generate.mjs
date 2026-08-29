import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { chat, scriptModel } from "../llm/client.mjs";
import { normalizeCopy, copyViolations } from "./sanitize.mjs";
import { flowOutDir } from "../config.mjs";

const WORDS_PER_SEC = 2.6;

function describeAction(a) {
	switch (a.kind) {
		case "goto": return `open ${new URL(a.url).pathname}`;
		case "click": return `click "${a.elementText || a.selector}"`;
		case "fill": return `type ${a.redact ? "(hidden value)" : `"${a.value}"`} into "${a.elementText || a.selector}"`;
		case "press": return `press ${a.value}`;
		case "hover": return `hover over "${a.elementText || a.selector}"`;
		case "select": return `choose "${a.value}"`;
		case "scroll": return `scroll ${a.value || "the page"}`;
		case "waitLong": return `wait for ${a.value} (shown sped up)`;
		case "pause": return null;
		default: return a.value || a.kind;
	}
}

export function eventsDigest(events) {
	const skeleton = events.steps.map((s) => ({
		id: s.stepId,
		say: s.sayHint,
		url: s.urlAfter,
		actions: s.actions.map((a) => [a.kind, a.elementText || "", a.redact ? "" : a.value || ""]),
	}));
	return crypto.createHash("sha256")
		.update(JSON.stringify({ title: events.meta.title, goal: events.meta.goal, skeleton }))
		.digest("hex").slice(0, 16);
}

function buildPrompt(events, config) {
	const brand = config.brand?.name || "the product";
	const steps = events.steps.map((s) => {
		const secs = Math.max(2.5, (s.tEnd - s.tStart) * 0.8);
		const budget = Math.max(8, Math.round(secs * WORDS_PER_SEC));
		const acts = s.actions.map(describeAction).filter(Boolean);
		return { id: s.stepId, hint: s.sayHint, page: new URL(s.urlAfter).pathname, actions: acts, wordBudget: budget };
	});
	const system = `You write voiceover narration for short product tutorial videos. Rules:
- Second person, present tense. Imperative for actions ("Pick a niche", "Hit Generate").
- Plain, concrete words. Say what the viewer sees and why it matters. One thought per step.
- No hype, no adjectives like "powerful" or "amazing", no greetings, no "in this video".
- NEVER use an em dash or en dash anywhere. Use commas or periods.
- Do not read UI labels robotically; fold them in naturally.
- Respect each step's wordBudget (a few words under is better than over).
- Intro: one or two sentences framing the outcome (max 24 words). Outro: one sentence wrap plus where to go next (max 22 words).
Return JSON: {"intro": "...", "steps": [{"id": "...", "narration": "..."}], "outro": "..."}`;
	const user = JSON.stringify({
		product: brand,
		tutorialTitle: events.meta.title,
		goal: events.meta.goal,
		steps,
	});
	return { system, user };
}

export async function generateScript(flow, config) {
	const outDir = flowOutDir(config, flow.id);
	const capPath = path.join(outDir, "capture", "events.json");
	if (!fs.existsSync(capPath)) throw new Error(`no capture for ${flow.id}: run record first`);
	const events = JSON.parse(fs.readFileSync(capPath));
	const digest = eventsDigest(events);
	const model = scriptModel(config);
	const scriptDir = path.join(outDir, "script");
	fs.mkdirSync(scriptDir, { recursive: true });

	const { system, user } = buildPrompt(events, config);
	let result = null;
	let feedback = "";
	for (let attempt = 0; attempt < 2; attempt++) {
		const out = await chat({ system, user: user + feedback, model, json: true });
		const blocks = [out.intro, ...(out.steps || []).map((s) => s.narration), out.outro].map(normalizeCopy);
		const bad = blocks.flatMap((b) => copyViolations(b));
		const missing = events.steps.filter((s) => !(out.steps || []).find((x) => x.id === s.stepId));
		if (!bad.length && !missing.length) {
			result = out;
			break;
		}
		feedback = `\n\nYour previous attempt had problems. Banned phrasing matched: ${bad.join("; ") || "none"}. Missing step ids: ${missing.map((s) => s.stepId).join(", ") || "none"}. Rewrite and fix.`;
	}
	if (!result) throw new Error("script generation failed copy rules twice; adjust prompt or write script.md by hand");

	const lines = [
		"---",
		`flowId: ${flow.id}`,
		`eventsDigest: ${digest}`,
		`model: ${model}`,
		`generatedAt: ${new Date().toISOString()}`,
		"---",
		"",
		`# ${events.meta.title}`,
		"",
		"## intro",
		"",
		normalizeCopy(result.intro),
		"",
	];
	for (const s of events.steps) {
		const block = (result.steps || []).find((x) => x.id === s.stepId);
		lines.push(`## step:${s.stepId}`, "", normalizeCopy(block.narration), "");
	}
	lines.push("## outro", "", normalizeCopy(result.outro), "");
	const scriptPath = path.join(scriptDir, "script.md");
	fs.writeFileSync(scriptPath, lines.join("\n"));
	console.log(`script: ${scriptPath}`);
	return scriptPath;
}

export function parseScriptMd(scriptPath) {
	const raw = fs.readFileSync(scriptPath, "utf8");
	const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/);
	const frontmatter = {};
	if (fmMatch) {
		for (const line of fmMatch[1].split("\n")) {
			const m = line.match(/^(\w+):\s*(.*)$/);
			if (m) frontmatter[m[1]] = m[2];
		}
	}
	const blocks = [];
	const re = /^## (intro|outro|step:[\w-]+)\s*$/gm;
	const matches = [...raw.matchAll(re)];
	for (let i = 0; i < matches.length; i++) {
		const start = matches[i].index + matches[i][0].length;
		const end = i + 1 < matches.length ? matches[i + 1].index : raw.length;
		const text = normalizeCopy(raw.slice(start, end).trim());
		if (text) blocks.push({ blockId: matches[i][1], text });
	}
	return { frontmatter, blocks };
}
