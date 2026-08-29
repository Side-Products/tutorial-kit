// M0b: find a capture path that yields 2x (3840x2160) frames.
import { chromium } from "playwright";
import sharp from "sharp";

const URL = "https://www.faceless.so/pricing";

async function screencastDims(page, context, label) {
	const cdp = await context.newCDPSession(page);
	let dims = null;
	let count = 0;
	cdp.on("Page.screencastFrame", async (params) => {
		count++;
		cdp.send("Page.screencastFrameAck", { sessionId: params.sessionId }).catch(() => {});
		if (!dims) {
			const meta = await sharp(Buffer.from(params.data, "base64")).metadata();
			dims = `${meta.width}x${meta.height}`;
		}
	});
	await cdp.send("Page.startScreencast", { format: "jpeg", quality: 90, maxWidth: 3840, maxHeight: 2160, everyNthFrame: 1 });
	// generate damage
	await page.mouse.wheel(0, 200);
	await page.waitForTimeout(400);
	await page.mouse.wheel(0, -200);
	await page.waitForTimeout(600);
	await cdp.send("Page.stopScreencast").catch(() => {});
	console.log(`${label}: screencast=${dims || "NO FRAMES"} (${count} frames)`);
	return dims;
}

async function variantA() {
	// headless + --force-device-scale-factor + window-size, no playwright viewport emulation
	const browser = await chromium.launch({
		headless: true,
		args: ["--window-size=3840,2160", "--force-device-scale-factor=2", "--hide-scrollbars"],
	});
	const context = await browser.newContext({ viewport: null });
	const page = await context.newPage();
	await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
	await page.waitForTimeout(2000);
	const vp = await page.evaluate(() => `${innerWidth}x${innerHeight} dpr=${devicePixelRatio}`);
	console.log(`A: css viewport ${vp}`);
	await screencastDims(page, context, "A (force-dsf args, headless)");
	await browser.close();
}

async function variantB() {
	// headed on retina mac, viewport 1920x1080 DSF 2
	const browser = await chromium.launch({ headless: false, args: ["--hide-scrollbars"] });
	const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
	const page = await context.newPage();
	await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
	await page.waitForTimeout(2000);
	await screencastDims(page, context, "B (headed, viewport DSF2)");
	await browser.close();
}

async function variantC() {
	// screenshots at DSF2 (hybrid fallback stills) + full chromium (not headless shell) screencast
	const browser = await chromium.launch({ headless: true, channel: "chromium" });
	const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
	const page = await context.newPage();
	await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
	await page.waitForTimeout(2000);
	const shot = await page.screenshot({ type: "png" });
	const meta = await sharp(shot).metadata();
	console.log(`C: page.screenshot dims=${meta.width}x${meta.height} (want 3840x2160)`);
	await screencastDims(page, context, "C (new headless chromium, viewport DSF2)");
	await browser.close();
}

for (const [name, fn] of [["A", variantA], ["B", variantB], ["C", variantC]]) {
	try {
		await fn();
	} catch (e) {
		console.log(`${name} failed: ${e.message.split("\n")[0]}`);
	}
}
