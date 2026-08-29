import { chromium } from "playwright";

// The M0-proven capture config: NO Playwright viewport emulation. The window defines the CSS
// viewport and --force-device-scale-factor makes the compositor surface 2x, which is what
// Page.startScreencast captures. Playwright's own deviceScaleFactor emulation does NOT scale
// the screencast surface (measured: frames come back in CSS pixels).
export async function launchCapture({ viewport, headed = false, channel = "chrome" }) {
	const args = [
		`--window-size=${viewport.width},${viewport.height}`,
		`--force-device-scale-factor=${viewport.dsf}`,
		"--hide-scrollbars",
		"--autoplay-policy=no-user-gesture-required",
	];
	// Prefer installed Chrome: Playwright's bundled Chromium has no H.264/AAC, so any MP4 on the
	// page (hero mocks, preview reels) renders as a black box in the capture.
	if (channel) {
		try {
			return await chromium.launch({ headless: !headed, channel, args });
		} catch (e) {
			console.warn(`chrome channel launch failed (${e.message.split("\n")[0]}); using bundled Chromium: page MP4s may render black`);
		}
	}
	return chromium.launch({ headless: !headed, args });
}

export async function newCaptureContext(browser, { storageState } = {}) {
	return browser.newContext({
		viewport: null,
		storageState: storageState || undefined,
	});
}

// Real Chrome's headless window reserves some chrome height, shrinking the CSS viewport below the
// requested window size. Measure and correct via window bounds (never viewport emulation, which
// would break device-pixel screencast).
export async function calibrateWindow(page, viewport) {
	for (let i = 0; i < 3; i++) {
		const size = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
		if (size.w === viewport.width && size.h === viewport.height) return;
		const cdp = await page.context().newCDPSession(page);
		try {
			const { windowId } = await cdp.send("Browser.getWindowForTarget");
			const { bounds } = await cdp.send("Browser.getWindowBounds", { windowId });
			await cdp.send("Browser.setWindowBounds", {
				windowId,
				bounds: {
					width: bounds.width + (viewport.width - size.w),
					height: bounds.height + (viewport.height - size.h),
				},
			});
		} finally {
			await cdp.detach().catch(() => {});
		}
		await page.waitForTimeout(180);
	}
	const finalSize = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
	if (finalSize.w !== viewport.width || finalSize.h !== viewport.height) {
		console.warn(`viewport calibration ended at ${finalSize.w}x${finalSize.h} (wanted ${viewport.width}x${viewport.height})`);
	}
}

// Hide the OS cursor on every document; the composition renders its own synthetic cursor.
export const CURSOR_HIDE_INIT = `(() => {
	const inject = () => {
		try {
			const s = document.createElement("style");
			s.setAttribute("data-tutorial-kit", "cursor-hide");
			s.textContent = "*, *::before, *::after { cursor: none !important }";
			(document.head || document.documentElement).appendChild(s);
		} catch {}
	};
	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", inject);
	else inject();
})();`;
