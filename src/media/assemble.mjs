import fs from "node:fs";
import path from "node:path";
import { run } from "./encode.mjs";

// Frames + per-frame output durations (retime already applied) -> 30fps CFR mezzanine.
// ffconcat quirk: the final file entry must be repeated or its duration is ignored.
export async function writeMezzanine({ framesDir, frames, durations, outPath }) {
	const lines = ["ffconcat version 1.0"];
	for (let i = 0; i < frames.length; i++) {
		lines.push(`file '${path.join(framesDir, frames[i].file)}'`);
		lines.push(`duration ${durations[i].toFixed(6)}`);
	}
	lines.push(`file '${path.join(framesDir, frames[frames.length - 1].file)}'`);
	const concatPath = outPath.replace(/\.mp4$/, ".ffconcat");
	fs.writeFileSync(concatPath, lines.join("\n"));
	await run([
		"-y", "-f", "concat", "-safe", "0", "-i", concatPath,
		"-vf", "fps=30,format=yuv420p",
		"-c:v", "libx264", "-preset", "faster", "-crf", "12", "-x264-params", "keyint=30",
		outPath,
	]);
	return outPath;
}
