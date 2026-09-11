import fs from "node:fs";
import path from "node:path";
import { run, concatFileLine } from "./encode.mjs";
import { pathInside } from "../security/paths.mjs";

// Frames + per-frame output durations (retime already applied) -> 30fps CFR mezzanine.
// ffconcat quirk: the final file entry must be repeated or its duration is ignored.
export async function writeMezzanine({ framesDir, frames, durations, outPath }) {
	if (!frames.length || durations.length !== frames.length)
		throw new Error("mezzanine needs frames and a duration per frame");
	const lines = ["ffconcat version 1.0"];
	for (let i = 0; i < frames.length; i++) {
		if (!Number.isFinite(durations[i]) || durations[i] <= 0)
			throw new Error("frame duration must be positive and finite");
		lines.push(concatFileLine(pathInside(framesDir, frames[i].file)));
		lines.push(`duration ${durations[i].toFixed(6)}`);
	}
	lines.push(concatFileLine(pathInside(framesDir, frames[frames.length - 1].file)));
	const concatPath = outPath.replace(/\.mp4$/, ".ffconcat");
	fs.writeFileSync(concatPath, lines.join("\n"));
	await run([
		"-y",
		"-f",
		"concat",
		"-safe",
		"0",
		"-protocol_whitelist",
		"file",
		"-i",
		concatPath,
		"-vf",
		"fps=30,format=yuv420p",
		"-c:v",
		"libx264",
		"-preset",
		"faster",
		"-crf",
		"12",
		"-x264-params",
		"keyint=30",
		outPath,
	]);
	return outPath;
}
