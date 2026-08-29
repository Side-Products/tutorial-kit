import fs from "node:fs";
import path from "node:path";
import { launchCapture, newCaptureContext, calibrateWindow, CURSOR_HIDE_INIT } from "./launch.mjs";
import { Screencast } from "./screencast.mjs";
import { Driver } from "./driver.mjs";
import { ensureAuth, storageStatePath } from "./auth.mjs";
import { flowOutDir } from "../config.mjs";
import { makeRun } from "../flow/actions.mjs";

export async function recordFlow(flow, config, { headed = false } = {}) {
	let healCtx = null;
	if (flow.declarative) {
		const { buildSelfHeal } = await import("../plan/scout.mjs");
		healCtx = buildSelfHeal(flow, config);
	}
	const outDir = flowOutDir(config, flow.id);
	const capDir = path.join(outDir, "capture");
	const framesDir = path.join(capDir, "frames");
	const shotsDir = path.join(capDir, "shots");
	fs.rmSync(capDir, { recursive: true, force: true });
	fs.mkdirSync(framesDir, { recursive: true });
	fs.mkdirSync(shotsDir, { recursive: true });

	const browser = await launchCapture({ viewport: config.viewport, headed, channel: config.browserChannel });
	const statePath = storageStatePath(config);
	const context = await newCaptureContext(browser, {
		storageState: config.auth && fs.existsSync(statePath) ? statePath : undefined,
	});
	await context.addInitScript(CURSOR_HIDE_INIT);
	const page = await context.newPage();
		await calibrateWindow(page, config.viewport);

	const steps = [];
	let current = null;
	const driver = new Driver({
		page,
		baseUrl: config.baseUrl,
		viewport: config.viewport,
		onEvent: (a) => current?.actions.push(a),
	});

	try {
		if (config.auth && flow.auth !== false) {
			const res = await ensureAuth(context, page, config);
			console.log(`auth: ${res.via || "none"}`);
		}
		if (flow.setup) {
			console.log("setup...");
			await flow.setup({ config, page });
		}

		const screencast = new Screencast({ context, page, framesDir });
		await screencast.start();
		const tRecordStart = Date.now() / 1000;

		for (let i = 0; i < flow.steps.length; i++) {
			const step = flow.steps[i];
			const stepId = step.id || `s${i + 1}`;
			console.log(`step ${i + 1}/${flow.steps.length}: ${stepId}`);
			const shotBefore = `shots/${stepId}-before.png`;
			await page.screenshot({ path: path.join(capDir, shotBefore), type: "png" }).catch(() => {});
			const prettify = (id) => id.replace(/[-_]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());
			const rec = {
				stepId,
				index: i,
				title: step.title || prettify(stepId),
				sayHint: step.say || "",
				urlBefore: page.url(),
				tStart: Date.now() / 1000,
				actions: [],
			};
			current = rec;
			await (step.run || makeRun(step, healCtx))(driver);
			current = null;
			rec.tEnd = Date.now() / 1000;
			rec.urlAfter = page.url();
			const shotAfter = `shots/${stepId}-after.png`;
			await page.screenshot({ path: path.join(capDir, shotAfter), type: "png" }).catch(() => {});
			rec.shotBefore = shotBefore;
			rec.shotAfter = shotAfter;
			steps.push(rec);
		}

		// Give the tail a beat of screen time before the recording stops.
		await page.waitForTimeout(1200);
		const frames = await screencast.stop();
		const tRecordEnd = Date.now() / 1000;

		if (flow.teardown) {
			console.log("teardown...");
			await flow.teardown({ config, page });
		}

		const events = {
			meta: {
				flowId: flow.id,
				title: flow.title,
				goal: flow.goal || "",
				baseUrl: config.baseUrl,
				canonicalHost: config.canonicalHost,
				viewport: config.viewport,
				recordedAt: new Date().toISOString(),
				flowHash: flow.hash,
				tRecordStart,
				tRecordEnd,
				clock: "epoch-seconds",
			},
			steps,
		};
		fs.writeFileSync(path.join(capDir, "events.json"), JSON.stringify(events, null, 1));
		fs.writeFileSync(
			path.join(capDir, "frames.json"),
			JSON.stringify({ dir: "frames", viewport: config.viewport, frames })
		);

		const bytes = frames.reduce((s, f) => s + fs.statSync(path.join(framesDir, f.file)).size, 0);
		const dur = frames.length ? frames[frames.length - 1].t - frames[0].t : 0;
		console.log(
			`recorded ${flow.id}: ${steps.length} steps, ${frames.length} frames over ${dur.toFixed(1)}s, ${(bytes / 1e6).toFixed(0)}MB`
		);
		return { outDir, events, frames };
	} finally {
		await browser.close().catch(() => {});
	}
}
