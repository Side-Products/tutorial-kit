// M0d: full capture spike at the winning 4K config + click alignment + mezzanine.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import sharp from "sharp";
import { FFMPEG_PATH, concatFileLine } from "../src/media/encode.mjs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, "spike", "out4k");
const FRAMES = path.join(OUT, "frames");
const BASE = "https://www.faceless.so";

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(FRAMES, { recursive: true });

const frames = [];
let writeChain = Promise.resolve();
let frameIndex = 0;

const browser = await chromium.launch({
	headless: true,
	args: ["--window-size=1920,1080", "--force-device-scale-factor=2", "--hide-scrollbars"],
});
const context = await browser.newContext({ viewport: null });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);

cdp.on("Page.screencastFrame", (params) => {
	const i = frameIndex++;
	const file = path.join(FRAMES, `f${String(i).padStart(6, "0")}.jpg`);
	frames.push({ i, file, t: params.metadata.timestamp });
	cdp.send("Page.screencastFrameAck", { sessionId: params.sessionId }).catch(() => {});
	const buf = Buffer.from(params.data, "base64");
	writeChain = writeChain.then(() => fs.promises.writeFile(file, buf));
});

// everyNthFrame 2: compositor runs 60fps under animation, output is 30fps anyway.
await cdp.send("Page.startScreencast", {
	format: "jpeg",
	quality: 90,
	maxWidth: 3840,
	maxHeight: 2160,
	everyNthFrame: 2,
});

const marks = [];
const mark = (label) => marks.push({ label, t: Date.now() / 1000 });

mark("goto-home");
await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.addStyleTag({ content: "* { cursor: none !important }" }).catch(() => {});
await page.waitForTimeout(2500);

mark("scroll");
for (let k = 0; k < 20; k++) {
	await page.mouse.wheel(0, 120);
	await page.waitForTimeout(45);
}
await page.waitForTimeout(900);
mark("scroll-end");

mark("goto-pricing");
await page.goto(`${BASE}/pricing`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.addStyleTag({ content: "* { cursor: none !important }" }).catch(() => {});
await page.waitForTimeout(2500);

// Click alignment: click something guaranteed to change pixels. Use the first visible CTA.
const target = page
	.locator("a:visible, button:visible")
	.filter({ hasText: /get started|start|pricing|sign|try/i })
	.first();
let clicked = false;
if (await target.count()) {
	const box = await target.boundingBox().catch(() => null);
	if (box) {
		await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 18 });
		await page.waitForTimeout(600);
		mark("CLICK");
		await page.mouse.down();
		await page.mouse.up();
		clicked = true;
		await page.waitForTimeout(2000);
	}
}
if (!clicked) {
	mark("CLICK");
	await page.mouse.wheel(0, 600); // fallback damage
	await page.waitForTimeout(1500);
}
mark("end");

await cdp.send("Page.stopScreencast").catch(() => {});
await writeChain;
await browser.close();

fs.writeFileSync(path.join(OUT, "frames.json"), JSON.stringify(frames));
fs.writeFileSync(path.join(OUT, "marks.json"), JSON.stringify(marks, null, 2));

const first = await sharp(frames[0].file).metadata();
const total = frames[frames.length - 1].t - frames[0].t;
const scrollA = marks.find((m) => m.label === "scroll").t;
const scrollB = marks.find((m) => m.label === "scroll-end").t;
const scrollFps = frames.filter((f) => f.t >= scrollA && f.t <= scrollB).length / (scrollB - scrollA);
const bytes = frames.reduce((s, f) => s + fs.statSync(f.file).size, 0);

let alignMs = null;
const clickT = marks.find((m) => m.label === "CLICK").t;
const around = frames.filter((f) => f.t > clickT - 0.8 && f.t < clickT + 1.5);
let prevRaw = null;
for (const f of around) {
	const raw = await sharp(f.file).resize(320, 180, { fit: "fill" }).greyscale().raw().toBuffer();
	if (prevRaw) {
		let diff = 0;
		for (let p = 0; p < raw.length; p += 7) diff += Math.abs(raw[p] - prevRaw[p]);
		const mean = diff / (raw.length / 7);
		if (f.t >= clickT && mean > 2.5 && alignMs === null) alignMs = Math.round((f.t - clickT) * 1000);
	}
	prevRaw = raw;
}

console.log("=== M0d 4K CAPTURE ===");
console.log(
	`frames: ${frames.length} over ${total.toFixed(1)}s (avg ${(frames.length / total).toFixed(1)} fps)`,
);
console.log(`frame size: ${first.width}x${first.height}`);
console.log(`scroll fps: ${scrollFps.toFixed(1)} (gate >= 15)`);
console.log(`click-to-frame latency: ${alignMs === null ? "no diff spike found" : alignMs + "ms"}`);
console.log(
	`disk: ${(bytes / 1e6).toFixed(0)}MB, ${(bytes / frames.length / 1024).toFixed(0)}KB/frame, ${(bytes / 1e6 / total).toFixed(1)}MB/s`,
);

const concat = ["ffconcat version 1.0"];
for (let i = 0; i < frames.length; i++) {
	const d = i < frames.length - 1 ? Math.max(frames[i + 1].t - frames[i].t, 1 / 120) : 1 / 30;
	concat.push(concatFileLine(frames[i].file));
	concat.push(`duration ${d.toFixed(6)}`);
}
concat.push(concatFileLine(frames[frames.length - 1].file));
fs.writeFileSync(path.join(OUT, "frames.ffconcat"), concat.join("\n"));

const t0 = Date.now();
await execFileP(
	FFMPEG_PATH,
	[
		"-hide_banner",
		"-loglevel",
		"error",
		"-y",
		"-f",
		"concat",
		"-safe",
		"0",
		"-i",
		path.join(OUT, "frames.ffconcat"),
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
		path.join(OUT, "mezzanine.mp4"),
	],
	{ timeout: 600000, maxBuffer: 1024 * 1024 * 64 },
);
console.log(
	`mezzanine: ${(fs.statSync(path.join(OUT, "mezzanine.mp4")).size / 1e6).toFixed(0)}MB in ${((Date.now() - t0) / 1000).toFixed(0)}s`,
);
