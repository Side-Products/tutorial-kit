import path from "node:path";
import sharp from "sharp";

// Highlight ring on the acted-on element: SVG composite over the step screenshot
// (faceless longform/plate.js pattern), downscaled for docs.
export async function annotateShot({ shotPath, bbox, dsf, outPath, accent = "#8B5CF6", width = 1600 }) {
	// Two passes: sharp runs resize BEFORE composite in one pipeline, which would shrink the base
	// under the full-res overlay and fail the dimension check.
	const img = sharp(shotPath);
	const meta = await img.metadata();
	let buffer;
	if (bbox) {
		const pad = 10 * dsf;
		const x = Math.max(0, bbox.x * dsf - pad);
		const y = Math.max(0, bbox.y * dsf - pad);
		const w = Math.min(meta.width - x, bbox.width * dsf + pad * 2);
		const h = Math.min(meta.height - y, bbox.height * dsf + pad * 2);
		const svg = `<svg width="${meta.width}" height="${meta.height}" xmlns="http://www.w3.org/2000/svg">
			<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${12 * dsf}" fill="none" stroke="${accent}" stroke-width="${5 * dsf}"/>
			<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${12 * dsf}" fill="${accent}" fill-opacity="0.10"/>
		</svg>`;
		buffer = await img.composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).png().toBuffer();
	} else {
		buffer = await img.png().toBuffer();
	}
	await sharp(buffer).resize(width).jpeg({ quality: 88 }).toFile(outPath);
	return path.basename(outPath);
}
