import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { flowOutDir } from "../config.mjs";
import { run } from "../media/encode.mjs";
import { pathInside } from "../security/paths.mjs";

// Local render, viraloop serverRender.js recipe: memoized bundle, ensureBrowser (Remotion manages
// its own Chromium), explicit concurrency + offthread cache, jpegQuality 95 for crisp UI text.
const ENTRY = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "remotion", "index.jsx");
const bundleCache = new Map();

// Remotion's AAC can retain an encoder delay. Mux the timeline's PCM track
// directly so the voice and its word timestamps share the same starting point.
export async function syncRenderedAudio({ videoPath, audioPath, durationSec }) {
	const synced = path.join(path.dirname(videoPath), `.audio-synced-${path.basename(videoPath)}`);
	await run([
		"-y",
		"-i",
		videoPath,
		"-i",
		audioPath,
		"-map",
		"0:v:0",
		"-map",
		"1:a:0",
		"-c:v",
		"copy",
		"-c:a",
		"aac",
		"-b:a",
		"192k",
		"-af",
		"apad",
		"-t",
		String(durationSec),
		"-movflags",
		"+faststart",
		synced,
	]);
	fs.renameSync(synced, videoPath);
}

async function getBundle(publicDir) {
	if (!bundleCache.has(publicDir)) {
		const promise = (async () => {
			const { bundle } = await import("@remotion/bundler");
			return bundle({ entryPoint: ENTRY, publicDir });
		})().catch((e) => {
			bundleCache.delete(publicDir);
			throw e;
		});
		bundleCache.set(publicDir, promise);
	}
	return bundleCache.get(publicDir);
}

export async function renderFlow(flow, config, { mode = "proof" } = {}) {
	const outDir = flowOutDir(config, flow.id);
	const composeDir = path.join(outDir, "compose");
	const timelinePath = path.join(composeDir, "timeline.json");
	if (!fs.existsSync(timelinePath)) throw new Error(`no timeline for ${flow.id}: run compose first`);
	const timeline = JSON.parse(fs.readFileSync(timelinePath));
	pathInside(composeDir, timeline.assets.mezzanine);
	const audioPath = pathInside(composeDir, timeline.assets.audio);
	if (timeline.brand?.logo) pathInside(composeDir, timeline.brand.logo);

	const { renderMedia, selectComposition, ensureBrowser } = await import("@remotion/renderer");
	await ensureBrowser();
	const serveUrl = await getBundle(composeDir);
	const inputProps = { timeline };
	const composition = await selectComposition({ serveUrl, id: "Tutorial", inputProps });

	const renderDir = path.join(outDir, "render");
	fs.mkdirSync(renderDir, { recursive: true });
	const proof = mode === "proof";
	const outPath = path.join(renderDir, proof ? "proof.mp4" : "final-4k.mp4");
	const concurrency = Math.max(
		2,
		Number(process.env.RENDER_CONCURRENCY) || Math.min(8, os.cpus().length - 2),
	);

	console.log(
		`rendering ${flow.id} (${mode}, ${composition.durationInFrames} frames, concurrency ${concurrency})...`,
	);
	const t0 = Date.now();
	await renderMedia({
		composition,
		serveUrl,
		codec: "h264",
		outputLocation: outPath,
		inputProps,
		concurrency,
		jpegQuality: proof ? 80 : 95,
		scale: proof ? 0.5 : 1,
		offthreadVideoCacheSizeInBytes: 512 * 1024 * 1024,
		crf: proof ? 22 : 16,
		onProgress: ({ progress }) => {
			if (Math.round(progress * 100) % 20 === 0) process.stdout.write(`\r${Math.round(progress * 100)}%   `);
		},
	});
	await syncRenderedAudio({
		videoPath: outPath,
		audioPath,
		durationSec: composition.durationInFrames / composition.fps,
	});
	process.stdout.write("\r");
	console.log(
		`rendered in ${((Date.now() - t0) / 1000).toFixed(0)}s -> ${outPath} (${(fs.statSync(outPath).size / 1e6).toFixed(1)}MB)`,
	);

	if (!proof) {
		const hd = path.join(renderDir, "final-1080p.mp4");
		await run([
			"-y",
			"-i",
			outPath,
			"-vf",
			"scale=1920:1080:flags=lanczos",
			"-c:v",
			"libx264",
			"-preset",
			"slow",
			"-crf",
			"18",
			"-c:a",
			"copy",
			"-movflags",
			"+faststart",
			hd,
		]);
		console.log(`downscaled -> ${hd}`);
	}
	return outPath;
}
