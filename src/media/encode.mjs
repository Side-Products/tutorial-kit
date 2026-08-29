// Vendored ffmpeg wrapper (pattern from faceless longform/encode.js): bundled binary, execFile,
// SIGKILL on timeout. probeDuration decodes to null and reads the last time= line, so we need no
// ffprobe binary at all.
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);
export const FFMPEG_PATH = process.env.TUTORIAL_FFMPEG_PATH || ffmpegInstaller.path;

export async function run(args, { timeoutMs = 20 * 60 * 1000 } = {}) {
	await execFileP(FFMPEG_PATH, ["-hide_banner", "-loglevel", "error", ...args], {
		timeout: timeoutMs,
		killSignal: "SIGKILL",
		maxBuffer: 64 * 1024 * 1024,
	});
}

export async function probeDuration(file) {
	const res = await execFileP(FFMPEG_PATH, ["-hide_banner", "-i", file, "-f", "null", "-"], {
		timeout: 5 * 60 * 1000,
		killSignal: "SIGKILL",
		maxBuffer: 64 * 1024 * 1024,
	}).catch((e) => e);
	const m = [...String(res.stderr || "").matchAll(/time=(\d+):(\d+):([\d.]+)/g)].pop();
	if (!m) throw new Error(`probeDuration: no time= in ffmpeg output for ${file}`);
	return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}
