import fs from "node:fs";
import path from "node:path";
import { flowOutDir } from "../config.mjs";
import { solveTimeline, frameOutDurations } from "../timeline/solve.mjs";
import { writeMezzanine } from "../media/assemble.mjs";
import { buildNarrationTrack, mixAudio } from "../media/audio.mjs";

const LEAK_RE = /localhost|127\.0\.0\.1|\.test\b|0\.0\.0\.0|:3000|e2e@/i;

function leakScan(events) {
	const hits = [];
	for (const s of events.steps) {
		for (const field of [s.urlBefore, s.urlAfter]) {
			if (LEAK_RE.test(field || "")) hits.push(`${s.stepId}: url ${field}`);
		}
		for (const a of s.actions) {
			for (const field of [a.url, a.elementText, a.redact ? "" : a.value]) {
				if (LEAK_RE.test(field || "")) hits.push(`${s.stepId}/${a.kind}: ${field}`);
			}
		}
	}
	return hits;
}

export async function composeFlow(flow, config) {
	const outDir = flowOutDir(config, flow.id);
	const capDir = path.join(outDir, "capture");
	const events = JSON.parse(fs.readFileSync(path.join(capDir, "events.json")));
	const framesMeta = JSON.parse(fs.readFileSync(path.join(capDir, "frames.json")));
	const wordsPath = path.join(outDir, "voice", "words.json");
	if (!fs.existsSync(wordsPath)) throw new Error(`no voice for ${flow.id}: run voice first`);
	const words = JSON.parse(fs.readFileSync(wordsPath));

	const leaks = leakScan(events);
	if (leaks.length && !config.allowLeakage) {
		throw new Error(`leakage scan failed (set allowLeakage: true to override):\n  ${leaks.join("\n  ")}`);
	}

	const composeDir = path.join(outDir, "compose");
	fs.mkdirSync(composeDir, { recursive: true });

	const frames = framesMeta.frames;
	const { timeline, map, audioPlacements } = solveTimeline({ events, frames, words, config, flow });

	console.log("assembling mezzanine...");
	const durations = frameOutDurations(frames, map);
	await writeMezzanine({
		framesDir: path.join(capDir, "frames"),
		frames,
		durations,
		outPath: path.join(composeDir, "mezzanine.mp4"),
	});

	console.log("building audio...");
	const narrationWav = await buildNarrationTrack({
		voiceDir: path.join(outDir, "voice"),
		blocks: words.blocks,
		placements: audioPlacements,
		totalSec: timeline.meta.durationInFrames / timeline.meta.fps,
		workDir: path.join(composeDir, "audio-work"),
		outPath: path.join(composeDir, "narration.wav"),
	});
	const musicTrack = config.music?.track ? path.resolve(config.root, config.music.track) : null;
	await mixAudio({
		narrationWav,
		music: musicTrack ? { ...config.music, track: musicTrack } : null,
		outPath: path.join(composeDir, "mixed.wav"),
	});

	if (config.brand?.logo) {
		const logoSrc = path.resolve(config.root, config.brand.logo);
		const logoName = `logo${path.extname(logoSrc)}`;
		fs.copyFileSync(logoSrc, path.join(composeDir, logoName));
		timeline.brand = { ...timeline.brand, logo: logoName };
	}

	fs.writeFileSync(path.join(composeDir, "timeline.json"), JSON.stringify(timeline, null, 1));
	const secs = (timeline.meta.durationInFrames / timeline.meta.fps).toFixed(1);
	console.log(`compose: ${flow.id} timeline ${secs}s, ${timeline.steps.length} steps -> ${composeDir}`);
	return { composeDir, timeline };
}
