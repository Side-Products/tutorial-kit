// M0 render: bundle + local render of the 4K mezzanine at 1.6x zoom.
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";

const execFileP = promisify(execFile);
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, "spike", "out4k");

const { bundle } = await import("@remotion/bundler");
const { renderMedia, selectComposition, ensureBrowser } = await import("@remotion/renderer");

console.log("ensuring browser...");
await ensureBrowser();

console.log("bundling...");
const serveUrl = await bundle({
	entryPoint: path.join(ROOT, "spike", "remotion", "index.jsx"),
	publicDir: OUT,
});

const inputProps = { src: "mezzanine.mp4" };
const composition = await selectComposition({ serveUrl, id: "SpikeZoom", inputProps });

console.log("rendering 60 frames @ 4K...");
const t0 = Date.now();
const outPath = path.join(OUT, "spike-render.mp4");
await renderMedia({
	composition,
	serveUrl,
	codec: "h264",
	outputLocation: outPath,
	inputProps,
	concurrency: 2,
	jpegQuality: 95,
	offthreadVideoCacheSizeInBytes: 512 * 1024 * 1024,
});
console.log(`rendered in ${((Date.now() - t0) / 1000).toFixed(0)}s -> ${outPath} (${(fs.statSync(outPath).size / 1e6).toFixed(1)}MB)`);

// Extract a frame and crop for crispness inspection.
await execFileP(ffmpegInstaller.path, ["-hide_banner", "-loglevel", "error", "-y", "-ss", "1", "-i", outPath, "-frames:v", "1", path.join(OUT, "render-frame.png")]);
const sharp = (await import("sharp")).default;
await sharp(path.join(OUT, "render-frame.png")).extract({ left: 1000, top: 400, width: 1200, height: 675 }).png().toFile(path.join(OUT, "render-crop-1to1.png"));
console.log("wrote render-crop-1to1.png");
