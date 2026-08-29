// M0c: window-size 1920x1080 + force-device-scale-factor 2, no viewport emulation.
import { chromium } from "playwright";
import sharp from "sharp";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OUT = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), "spike", "out");
const URL = "https://www.faceless.so/pricing";

const browser = await chromium.launch({
	headless: true,
	args: ["--window-size=1920,1080", "--force-device-scale-factor=2", "--hide-scrollbars"],
});
const context = await browser.newContext({ viewport: null });
const page = await context.newPage();
await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(2500);
console.log("css viewport:", await page.evaluate(() => `${innerWidth}x${innerHeight} dpr=${devicePixelRatio}`));

const cdp = await context.newCDPSession(page);
let saved = null;
let count = 0;
cdp.on("Page.screencastFrame", (params) => {
	count++;
	cdp.send("Page.screencastFrameAck", { sessionId: params.sessionId }).catch(() => {});
	if (!saved) saved = Buffer.from(params.data, "base64");
});
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 90, maxWidth: 3840, maxHeight: 2160, everyNthFrame: 1 });
await page.mouse.wheel(0, 300);
await page.waitForTimeout(500);
await page.mouse.wheel(0, -300);
await page.waitForTimeout(800);
await cdp.send("Page.stopScreencast").catch(() => {});

const meta = await sharp(saved).metadata();
console.log(`screencast: ${meta.width}x${meta.height} (${count} frames)`);
await sharp(saved).extract({ left: 1200, top: 300, width: 1200, height: 675 }).png().toFile(path.join(OUT, "m0c-crop-1to1.png"));
await sharp(saved).resize(1200).png().toFile(path.join(OUT, "m0c-overview.png"));
console.log("crops written");
await browser.close();
