import fs from "node:fs";
import path from "node:path";
import { chat, scriptModel } from "../llm/client.mjs";
import { codegenFlow } from "../flow/actions.mjs";
import { launchCapture, newCaptureContext, calibrateWindow } from "../capture/launch.mjs";
import { ensureAuth, storageStatePath } from "../capture/auth.mjs";

// Scout mode: turn a plain-English request into a draft flow file by looking at the live app.
export async function snapshotPage(page, maxChars = 9000) {
	try {
		const snap = await page.locator("body").ariaSnapshot();
		if (snap) return snap.slice(0, maxChars);
	} catch {}
	// Fallback: enumerate interactive elements by hand.
	const items = await page.$$eval("a, button, input, select, textarea, [role=button], [role=tab]", (els) =>
		els.slice(0, 220).map((el) => {
			const role = el.getAttribute("role") || el.tagName.toLowerCase();
			const name = (el.innerText || el.getAttribute("aria-label") || el.getAttribute("placeholder") || "").trim().slice(0, 60);
			return name ? `${role}: "${name}"` : null;
		}).filter(Boolean)
	);
	return items.join("\n").slice(0, maxChars);
}

const ACTION_SCHEMA = `Actions (JSON): {kind, ...}
- {"kind":"goto","path":"/some/path"}
- {"kind":"click","target":{"role":"button","name":"Buy credits"}} (or {"text":"..."} or {"css":"..."})
- {"kind":"fill","target":{...},"value":"text to type"}
- {"kind":"hover","target":{...}}
- {"kind":"scroll","px":900,"label":"plans"}
- {"kind":"waitFor","target":{...}}
- {"kind":"pause","seconds":1.5}
Prefer role+name targets taken VERBATIM from the page snapshot. Use css only as a last resort.`;

export async function planCommand(phrase, config, { yes = false, headed = false } = {}) {
	const { loadFlows } = await import("../flow/loader.mjs");
	const { resolveFlowRef } = await import("../flow/loader.mjs");
	const flows = await loadFlows(config);
	const existing = await resolveFlowRef(flows, phrase, config);
	if (existing) {
		console.log(`matched existing flow "${existing.id}" (${existing.title})`);
		console.log(`run: tutorial-kit build ${existing.id}`);
		return existing;
	}
	if (!config.sitemap?.length) {
		throw new Error("no matching flow, and config.sitemap is empty: add [{path, purpose}] entries so the scout knows where to look");
	}
	const model = scriptModel(config);
	console.log(`scouting for: "${phrase}"`);
	const routePick = await chat({
		system: `Pick up to 3 routes (most relevant first) that a product tutorial for the user's request would visit. Return {"routes": ["/path", ...]}.`,
		user: JSON.stringify({ request: phrase, product: config.brand?.name, sitemap: config.sitemap }),
		model,
		json: true,
	});
	const routes = (routePick.routes || []).slice(0, 3);
	if (!routes.length) throw new Error("scout could not pick candidate routes");
	console.log(`visiting: ${routes.join(", ")}`);

	const browser = await launchCapture({ viewport: config.viewport, headed, channel: config.browserChannel });
	const pages = [];
	try {
		const statePath = storageStatePath(config);
		const context = await newCaptureContext(browser, {
			storageState: config.auth && fs.existsSync(statePath) ? statePath : undefined,
		});
		const page = await context.newPage();
		await calibrateWindow(page, config.viewport);
		if (config.auth) await ensureAuth(context, page, config);
		for (const r of routes) {
			await page.goto(config.baseUrl + r, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
			await page.waitForTimeout(2200);
			pages.push({ route: r, snapshot: await snapshotPage(page) });
		}
	} finally {
		await browser.close().catch(() => {});
	}

	const spec = await chat({
		system: `You design a short product tutorial flow (a screen recording driven by automation).
${ACTION_SCHEMA}
Rules: 3 to 7 steps, each step = one idea with 1-3 actions plus a "say" hint (one sentence of narration intent).
First step usually a goto. Add a {"kind":"pause"} after moments the viewer should absorb. Never invent UI:
only reference elements visible in the snapshots. Keep ids kebab-case.
Return JSON {"id","title","goal","steps":[{"id","say","actions":[...]}]}.`,
		user: JSON.stringify({ request: phrase, product: config.brand?.name, pages }),
		model,
		json: true,
	});
	if (!spec?.id || !Array.isArray(spec.steps) || !spec.steps.length) throw new Error("scout drafted an invalid flow spec");
	spec.auth = !!config.auth;
	const file = path.join(config.flowsDirAbs, `${spec.id.replace(/[^a-z0-9-]/gi, "-")}.tutorial.mjs`);
	fs.mkdirSync(config.flowsDirAbs, { recursive: true });
	fs.writeFileSync(file, codegenFlow(spec));
	console.log(`drafted ${file}:\n`);
	console.log(fs.readFileSync(file, "utf8"));
	if (yes) {
		const fresh = (await loadFlows(config)).find((f) => f.id === spec.id);
		const { recordFlow } = await import("../capture/record.mjs");
		await recordFlow(fresh, config, {});
		console.log(`recorded. Next: tutorial-kit build ${spec.id}`);
	} else {
		console.log(`review/edit the file, then: tutorial-kit build ${spec.id}`);
	}
	return spec;
}

// Self-heal for declarative flows: one LLM repair attempt per failing action, then the flow file is
// rewritten so the fix sticks.
export function buildSelfHeal(flow, config) {
	if (!process.env.OPENAI_API_KEY) return null;
	return {
		selfHeal: async ({ t, action, error }) => {
			try {
				console.log(`self-heal: ${action.kind} failed (${error.message.split("\n")[0]}), asking for a repair...`);
				const snapshot = await snapshotPage(t.page);
				const out = await chat({
					system: `A tutorial automation action failed. Propose a replacement action targeting an element that IS in the snapshot.\n${ACTION_SCHEMA}\nReturn JSON {"action": {...}} or {"action": null} if impossible.`,
					user: JSON.stringify({ failed: action, error: error.message.split("\n")[0], url: t.page.url(), snapshot }),
					model: scriptModel(config),
					json: true,
				});
				return out.action || null;
			} catch {
				return null;
			}
		},
		onHealed: (step, i, healed) => {
			console.log(`self-heal: step ${step.id} action ${i} repaired -> ${JSON.stringify(healed.target || healed)}`);
			try {
				fs.writeFileSync(flow.file, codegenFlow(flow));
				console.log(`self-heal: rewrote ${flow.file}`);
			} catch (e) {
				console.warn(`self-heal: could not rewrite flow file: ${e.message}`);
			}
		},
	};
}
