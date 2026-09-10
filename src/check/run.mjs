import { launchCapture, newCaptureContext, calibrateWindow, CURSOR_HIDE_INIT } from "../capture/launch.mjs";
import { Driver } from "../capture/driver.mjs";
import { ensureAuth, storageStatePath } from "../capture/auth.mjs";
import { makeRun, lintFlow } from "../flow/actions.mjs";
import fs from "node:fs";

// UI-drift detector: run every flow headless with NO recording. A failing step means the product
// changed under the tutorial (or broke). Wire this into nightly CI; nonzero exit on any failure.
export async function checkFlows(flows, config) {
	const results = [];
	for (const flow of flows) {
		for (const w of lintFlow(flow)) console.warn(`warn ${w}`);
	}
	const browser = await launchCapture({ viewport: config.viewport, headed: false, channel: config.browserChannel });
	try {
		for (const flow of flows) {
			const statePath = storageStatePath(config);
			const context = await newCaptureContext(browser, {
				storageState: config.auth && fs.existsSync(statePath) ? statePath : undefined,
			});
			await context.addInitScript(CURSOR_HIDE_INIT);
			const page = await context.newPage();
		await calibrateWindow(page, config.viewport);
			const driver = new Driver({ page, baseUrl: config.baseUrl, viewport: config.viewport, onEvent: () => {}, pacing: 0.35 });
			const t0 = Date.now();
			let failure = null;
			try {
				if (config.auth && flow.auth !== false) await ensureAuth(context, page, config);
				if (flow.setup) await flow.setup({ config, page });
				for (let i = 0; i < flow.steps.length; i++) {
					const step = flow.steps[i];
					try {
						await (step.run || makeRun(step, null))(driver);
					} catch (e) {
						failure = { step: step.id || `s${i + 1}`, error: e.message.split("\n")[0] };
						break;
					}
				}
				if (flow.teardown) await flow.teardown({ config, page }).catch(() => {});
			} catch (e) {
				failure = { step: "(setup/auth)", error: e.message.split("\n")[0] };
			}
			const secs = ((Date.now() - t0) / 1000).toFixed(1);
			results.push({ flow: flow.id, ok: !failure, secs, failure });
			console.log(failure ? `FAIL ${flow.id} at ${failure.step}: ${failure.error}` : `ok   ${flow.id} (${secs}s)`);
			await context.close().catch(() => {});
		}
	} finally {
		await browser.close().catch(() => {});
	}
	return results;
}
