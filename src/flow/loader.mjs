import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import { validateFlow } from "./validate.mjs";

export async function loadFlows(config) {
	const dir = config.flowsDirAbs;
	if (!fs.existsSync(dir)) return [];
	const files = fs
		.readdirSync(dir)
		.filter((f) => f.endsWith(".tutorial.mjs"))
		.sort();
	const flows = [];
	for (const f of files) {
		const file = path.join(dir, f);
		const mod = await import(pathToFileURL(file).href + `?v=${fs.statSync(file).mtimeMs}`);
		const flow = mod.default;
		validateFlow(flow, { baseUrl: config.baseUrl });
		if (flows.some((existing) => existing.id === flow.id)) throw new Error(`duplicate flow id: ${flow.id}`);
		flow.declarative = flow.steps.some((s) => !s.run && s.actions);
		flow.file = file;
		flow.hash = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex").slice(0, 16);
		flows.push(flow);
	}
	return flows;
}

export function pickFlows(flows, ids) {
	if (!ids.length) return flows;
	const out = [];
	for (const id of ids) {
		const f = flows.find((x) => x.id === id);
		if (!f)
			throw new Error(`unknown flow "${id}". Available: ${flows.map((x) => x.id).join(", ") || "(none)"}`);
		out.push(f);
	}
	return out;
}

// English-friendly resolution: exact id -> fuzzy title/id match -> LLM matcher.
export async function resolveFlowRef(flows, phrase, config) {
	const norm = (s) =>
		String(s)
			.toLowerCase()
			.replace(/[^a-z0-9 ]+/g, " ")
			.replace(/\s+/g, " ")
			.trim();
	const p = norm(phrase);
	if (!p) return null;
	const exact = flows.find((x) => x.id === phrase);
	if (exact) return exact;
	const fuzzy = flows.find((x) => {
		const id = norm(x.id);
		const title = norm(x.title);
		return (
			id === p || title === p || id.includes(p) || p.includes(id) || title.includes(p) || p.includes(title)
		);
	});
	if (fuzzy) return fuzzy;
	if (!flows.length || !process.env.OPENAI_API_KEY) return null;
	const { chat, scriptModel } = await import("../llm/client.mjs");
	const out = await chat({
		system: `Match the user's request to ONE of the listed tutorial flows, or null if none fits. Return {"id": "<flow id or null>"}.`,
		user: JSON.stringify({
			request: phrase,
			flows: flows.map((x) => ({ id: x.id, title: x.title, goal: x.goal })),
		}),
		model: scriptModel(config),
		json: true,
	}).catch(() => ({ id: null }));
	return flows.find((x) => x.id === out.id) || null;
}

// CLI selection: exact ids when all match; otherwise treat the whole arg list as one English phrase.
export async function resolveSelection(flows, ids, config) {
	if (!ids.length) return flows;
	if (ids.every((id) => flows.some((x) => x.id === id))) return pickFlows(flows, ids);
	const phrase = ids.join(" ");
	const match = await resolveFlowRef(flows, phrase, config);
	if (!match) {
		throw new Error(
			`no flow matches "${phrase}". Available: ${flows.map((x) => x.id).join(", ") || "(none)"}. Try: tutorial-kit plan "${phrase}"`,
		);
	}
	console.log(`"${phrase}" -> flow ${match.id}`);
	return [match];
}
