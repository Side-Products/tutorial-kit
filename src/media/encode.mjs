// Use a maintained system FFmpeg, execute without a shell, and kill stalled encodes.
// probeDuration decodes to null, so a separate ffprobe executable is not required.
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);
export const FFMPEG_PATH = process.env.TUTORIAL_FFMPEG_PATH || "ffmpeg";

export function concatFileLine(file) {
	if (typeof file !== "string" || /[\x00-\x1f\x7f]/.test(file))
		throw new Error("FFmpeg paths must not contain control characters");
	return `file '${file.replaceAll("'", "'\\''")}'`;
}

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
