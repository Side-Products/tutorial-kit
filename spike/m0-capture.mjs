// M0 spike: prove CDP screencast capture quality at 1920x1080 CSS / DSF 2.
// Usage: node spike/m0-capture.mjs [baseUrl]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import sharp from "sharp";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, "spike", "out");
const FRAMES = path.join(OUT, "frames");
const BASE = process.argv[2] || "https://www.faceless.so";

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(FRAMES, { recursive: true });

const frames = []; // {i, file, t}
let writeChain = Promise.resolve();
let frameIndex = 0;

async function main() {
	const browser = await chromium.launch({ headless: true });
	const context = await browser.newContext({
		viewport: { width: 1920, height: 1080 },
		deviceScaleFactor: 2,
	});
	const page = await context.newPage();
	const cdp = await context.newCDPSession(page);

	cdp.on("Page.screencastFrame", (params) => {
		const i = frameIndex++;
		const file = path.join(FRAMES, `f${String(i).padStart(6, "0")}.jpg`);
		frames.push({ i, file, t: params.metadata.timestamp });
		// Ack immediately so Chrome keeps sending; write off the event loop tick.
		cdp.send("Page.screencastFrameAck", { sessionId: params.sessionId }).catch(() => {});
		const buf = Buffer.from(params.data, "base64");
		writeChain = writeChain.then(() => fs.promises.writeFile(file, buf));
	});

	await cdp.send("Page.startScreencast", {
		format: "jpeg",
		quality: 90,
		maxWidth: 3840,
		maxHeight: 2160,
		everyNthFrame: 1,
	});

	const marks = [];
	const mark = (label) => marks.push({ label, t: Date.now() / 1000 });

	// --- Scenario (~35s) ---
	mark("goto-home");
	await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
	await page.addStyleTag({ content: "* { cursor: none !important }" }).catch(() => {});
	await page.waitForTimeout(3000);

	mark("scroll-down");
	for (let k = 0; k < 30; k++) {
		await page.mouse.wheel(0, 120);
		await page.waitForTimeout(40);
	}
	await page.waitForTimeout(1000);

	mark("scroll-up");
	for (let k = 0; k < 10; k++) {
		await page.mouse.wheel(0, -120);
		await page.waitForTimeout(40);
	}
	await page.waitForTimeout(800);

	mark("goto-pricing");
	await page.goto(`${BASE}/pricing`, { waitUntil: "domcontentloaded", timeout: 60000 });
	await page.addStyleTag({ content: "* { cursor: none !important }" }).catch(() => {});
	await page.waitForTimeout(2500);

	// Find a visible toggle/button to click for the alignment test.
	const candidates = [
		page.getByRole("button", { name: /yearly|annual/i }).first(),
		page.getByRole("button", { name: /monthly/i }).first(),
		page.getByRole("tab", { name: /yearly|annual|monthly/i }).first(),
		page.getByRole("button", { name: /get started|start/i }).first(),
	];
	let target = null;
	for (const c of candidates) {
		if (await c.isVisible().catch(() => false)) {
			target = c;
			break;
		}
	}
	if (target) {
		const box = await target.boundingBox();
		if (box) {
			mark("hover-target");
			await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 20 });
			await page.waitForTimeout(700);
			mark("CLICK");
			await page.mouse.down();
			await page.mouse.up();
			await page.waitForTimeout(1500);
		}
	} else {
		mark("no-target-found");
		await page.waitForTimeout(1500);
	}

	mark("end");
	await cdp.send("Page.stopScreencast").catch(() => {});
	await writeChain;
	await browser.close();

	// --- Stats ---
	fs.writeFileSync(path.join(OUT, "frames.json"), JSON.stringify(frames));
	fs.writeFileSync(path.join(OUT, "marks.json"), JSON.stringify(marks, null, 2));

	const first = await sharp(frames[0].file).metadata();
	const durations = [];
	for (let i = 1; i < frames.length; i++) durations.push(frames[i].t - frames[i - 1].t);
	const total = frames[frames.length - 1].t - frames[0].t;

	// fps per 1s bucket
	const buckets = new Map();
	for (const f of frames) {
		const b = Math.floor(f.t - frames[0].t);
		buckets.set(b, (buckets.get(b) || 0) + 1);
	}
	const bucketArr = [...buckets.entries()].sort((a, b) => a[0] - b[0]);
	const maxFps = Math.max(...bucketArr.map(([, n]) => n));

	// fps during the scroll segment
	const scrollMark = marks.find((m) => m.label === "scroll-down");
	const scrollEnd = marks.find((m) => m.label === "scroll-up");
	const scrollFrames = frames.filter((f) => f.t >= scrollMark.t && f.t <= scrollEnd.t);
	const scrollFps = scrollFrames.length / (scrollEnd.t - scrollMark.t);

	// click alignment: first frame with big pixel delta after CLICK mark
	let alignMs = null;
	const clickMark = marks.find((m) => m.label === "CLICK");
	if (clickMark) {
		const around = frames.filter((f) => f.t > clickMark.t - 1 && f.t < clickMark.t + 1.5);
		let prevRaw = null;
		for (const f of around) {
			const raw = await sharp(f.file).resize(320, 180, { fit: "fill" }).greyscale().raw().toBuffer();
			if (prevRaw) {
				let diff = 0;
				for (let p = 0; p < raw.length; p += 7) diff += Math.abs(raw[p] - prevRaw[p]);
				const mean = diff / (raw.length / 7);
				if (f.t >= clickMark.t && mean > 2.5 && alignMs === null) {
					alignMs = Math.round((f.t - clickMark.t) * 1000);
				}
			}
			prevRaw = raw;
		}
	}

	const bytes = frames.reduce((s, f) => s + fs.statSync(f.file).size, 0);

	console.log("=== M0 CAPTURE STATS ===");
	console.log(`frames: ${frames.length} over ${total.toFixed(1)}s (avg ${(frames.length / total).toFixed(1)} fps)`);
	console.log(`frame size: ${first.width}x${first.height} (want 3840x2160)`);
	console.log(`max fps (1s bucket): ${maxFps}`);
	console.log(`scroll-segment fps: ${scrollFps.toFixed(1)} (gate: >= 15)`);
	console.log(`click-to-frame visual latency: ${alignMs === null ? "n/a (no click)" : alignMs + "ms"}`);
	console.log(`disk: ${(bytes / 1e6).toFixed(0)}MB (${(bytes / frames.length / 1024).toFixed(0)}KB/frame avg)`);

	// --- Mezzanine assembly ---
	const concat = ["ffconcat version 1.0"];
	for (let i = 0; i < frames.length; i++) {
		const d = i < frames.length - 1 ? Math.max(frames[i + 1].t - frames[i].t, 1 / 120) : 1 / 30;
		concat.push(`file '${frames[i].file}'`);
		concat.push(`duration ${d.toFixed(6)}`);
	}
	concat.push(`file '${frames[frames.length - 1].file}'`); // concat demuxer quirk
	const concatPath = path.join(OUT, "frames.ffconcat");
	fs.writeFileSync(concatPath, concat.join("\n"));

	const mezz = path.join(OUT, "mezzanine.mp4");
	const t0 = Date.now();
	await execFileP(
		ffmpegInstaller.path,
		["-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", concatPath,
			"-vf", "fps=30,format=yuv420p", "-c:v", "libx264", "-preset", "faster", "-crf", "12",
			"-x264-params", "keyint=30", mezz],
		{ timeout: 600000, maxBuffer: 1024 * 1024 * 64 }
	);
	const mezzMB = (fs.statSync(mezz).size / 1e6).toFixed(0);
	console.log(`mezzanine: ${mezz} (${mezzMB}MB, encoded in ${((Date.now() - t0) / 1000).toFixed(0)}s)`);

	// --- Crispness inspection crops (1:1 pixels of a text-heavy region) ---
	const mid = frames[Math.floor(frames.length * 0.15)]; // early frame: hero text
	await sharp(mid.file).extract({ left: 640, top: 400, width: 1200, height: 675 }).png()
		.toFile(path.join(OUT, "crop-text-1to1.png"));
	await sharp(mid.file).resize(1200).png().toFile(path.join(OUT, "overview.png"));
	console.log(`inspect: ${path.join(OUT, "crop-text-1to1.png")} and overview.png`);
}

main().catch((e) => {
	console.error("SPIKE FAILED:", e);
	process.exit(1);
});
