import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startDemoServer } from "../../examples/basic/server.mjs";
import demoFlow from "../../examples/basic/flows/hello-world.tutorial.mjs";
import { checkFlows } from "../../src/check/run.mjs";
import { recordFlow } from "../../src/capture/record.mjs";
import { composeFlow } from "../../src/compose/run.mjs";
import { renderFlow } from "../../src/render/render.mjs";
import { buildDocs } from "../../src/docs/build.mjs";
import { run, probeDuration } from "../../src/media/encode.mjs";
import sharp from "sharp";

test(
	"local workflow checks, records, composes, renders and produces consistent guides",
	{ timeout: 240000 },
	async (t) => {
		const retained = process.env.TUTORIAL_TEST_OUTPUT;
		// A quote in the directory exercises FFmpeg concat escaping with real media.
		const root = retained
			? path.resolve(retained)
			: fs.mkdtempSync(path.join(os.tmpdir(), "tutorial-kit's-pipeline-"));
		fs.mkdirSync(root, { recursive: true });
		if (!retained) t.after(() => fs.rmSync(root, { recursive: true, force: true }));
		const server = await startDemoServer(0);
		t.after(() => new Promise((resolve) => server.close(resolve)));
		const config = {
			root,
			baseUrl: `http://127.0.0.1:${server.address().port}`,
			canonicalHost: "demo.example.com",
			outDirAbs: path.join(root, "out"),
			viewport: { width: 960, height: 540, dsf: 1 },
			browserChannel: null,
			auth: null,
			selfHeal: false,
			allowLeakage: true,
			brand: { name: "Tutorials Kit", colors: { bg: "#141020", accent: "#A78BFA", text: "#FFFFFF" } },
		};
		const flow = { ...structuredClone(demoFlow), declarative: true, hash: "synthetic-fixture" };
		flow.steps[0].actions[0].path = "/?token=synthetic-url-value#private-fragment";
		const checks = await checkFlows([flow], config);
		assert.ok(
			checks.every((check) => check.ok),
			JSON.stringify(checks),
		);
		const { events, frames, outDir } = await recordFlow(flow, config);
		assert.equal(events.steps.length, 2);
		assert.ok(frames.length > 1);
		assert.ok(!JSON.stringify(events).includes("synthetic-url-value"));
		assert.ok(!JSON.stringify(events).includes("private-fragment"));
		assert.equal(events.steps[1].actions.filter((action) => action.kind === "click").length, 1);
		const first = await sharp(path.join(outDir, "capture", "frames", frames[0].file)).metadata();
		assert.equal(first.width, config.viewport.width);
		assert.equal(first.height, config.viewport.height);

		// Synthetic narration avoids paid APIs while exercising the real media pipeline.
		const scriptDir = path.join(outDir, "script");
		const blocksDir = path.join(outDir, "voice", "blocks");
		fs.mkdirSync(scriptDir, { recursive: true });
		fs.mkdirSync(blocksDir, { recursive: true });
		const ids = ["intro", ...flow.steps.map((step) => `step:${step.id}`), "outro"];
		fs.writeFileSync(
			path.join(scriptDir, "script.md"),
			ids.map((id) => `## ${id}\n\nA sample tutorial.\n`).join("\n"),
		);
		const blocks = [];
		for (const blockId of ids) {
			const audioFile = `blocks/${blockId.replace(":", "-")}.mp3`;
			await run([
				"-y",
				"-f",
				"lavfi",
				"-i",
				"sine=frequency=440:duration=0.8",
				"-q:a",
				"7",
				path.join(outDir, "voice", audioFile),
			]);
			blocks.push({
				blockId,
				text: "A sample tutorial.",
				audioFile,
				durationSec: await probeDuration(path.join(outDir, "voice", audioFile)),
				words: [
					{ word: "A", start: 0, end: 0.2 },
					{ word: "sample", start: 0.2, end: 0.5 },
					{ word: "tutorial.", start: 0.5, end: 0.8 },
				],
			});
		}
		fs.writeFileSync(path.join(outDir, "voice", "words.json"), JSON.stringify({ blocks }));
		const { timeline } = await composeFlow(flow, config);
		assert.equal(timeline.steps.length, flow.steps.length);
		assert.ok(timeline.meta.durationInFrames > 0);
		const video = await renderFlow(flow, config);
		assert.ok(fs.statSync(video).size > 1000);
		assert.ok(
			Math.abs((await probeDuration(video)) - timeline.meta.durationInFrames / timeline.meta.fps) < 0.2,
		);
		await buildDocs(flow, config);
		const tutorial = JSON.parse(fs.readFileSync(path.join(outDir, "docs", "tutorial.json")));
		assert.equal(tutorial.steps.length, 2);
		assert.equal(tutorial.video.file, "render/proof.mp4");
		assert.ok(tutorial.steps.every((step) => fs.existsSync(path.join(outDir, step.screenshot))));
		assert.ok(!JSON.stringify(tutorial).includes("synthetic-url-value"));
		assert.match(fs.readFileSync(path.join(outDir, "docs", "guide.md"), "utf8"), /Create sample project/);
		assert.match(fs.readFileSync(path.join(outDir, "docs", "captions.vtt"), "utf8"), /^WEBVTT/);
	},
);
