// The flow driver: wraps Playwright with humanized motion + a ground-truth event log.
// Every primary action moves the mouse along an eased path (real :hover states fire), measures
// the target bbox AFTER scrolling (bboxes go stale on scroll), and logs everything the
// composition and docs stages need: selector, element text, bbox, pointer waypoints, urls, times.

const easeInOutCubic = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);

export class Driver {
	constructor({ page, baseUrl, viewport, onEvent, pacing = 1 }) {
		this.page = page;
		this.baseUrl = baseUrl.replace(/\/$/, "");
		this.viewport = viewport;
		this.onEvent = onEvent || (() => {});
		this.pacing = pacing;
		this.cursor = { x: viewport.width / 2, y: viewport.height * 0.4 };
	}

	now() {
		return Date.now() / 1000;
	}

	loc(sel) {
		return typeof sel === "string" ? this.page.locator(sel).first() : sel;
	}

	selStr(sel) {
		if (typeof sel === "string") return sel;
		// Playwright locators stringify as: locator('...').first() etc.
		return String(sel).replace(/^locator\(/, "").replace(/\)$/, "");
	}

	async settle(ms) {
		await this.page.waitForTimeout(Math.round(ms * this.pacing));
	}

	async scrollY() {
		return this.page.evaluate(() => window.scrollY).catch(() => 0);
	}

	// One continuous eased glide (rAF-driven inside the page). Wheel ticks read as machine input:
	// constant velocity, discrete jumps. This animates window scroll with ease-in-out at 60fps of
	// compositor damage, which is also what the screencast samples.
	async animateScroll(toY, { duration } = {}) {
		const fromY = await this.scrollY();
		const dist = Math.abs(toY - fromY);
		if (dist < 3) return;
		const durMs = duration ?? Math.round(Math.min(2500, Math.max(750, dist * 1.05 + 450)));
		await this.page.evaluate(
			async ({ toY, durMs }) => {
				const startY = window.scrollY;
				const delta = toY - startY;
				const ease = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
				await new Promise((done) => {
					const t0 = performance.now();
					const tick = (now) => {
						const u = Math.min(1, (now - t0) / durMs);
						window.scrollTo(0, startY + delta * ease(u));
						if (u < 1) requestAnimationFrame(tick);
						else done();
					};
					requestAnimationFrame(tick);
				});
			},
			{ toY, durMs }
		);
	}

	// Smoothly bring an element into the viewport's comfortable band by easing whichever scroll
	// container actually owns it (window or a nested overflow ancestor). One eased animation the
	// screencast can see, so the reveal reads as a human scrolling rather than a jump cut. Returns
	// true if it scrolled something.
	async animateScrollToElement(locator) {
		const handle = await locator.elementHandle();
		if (!handle) return false;
		const scrolled = await this.page.evaluate(
			async ({ el, bandCenter }) => {
				const scrollableAncestor = (node) => {
					for (let p = node.parentElement; p; p = p.parentElement) {
						const s = getComputedStyle(p);
						if (/(auto|scroll|overlay)/.test(s.overflowY) && p.scrollHeight > p.clientHeight + 2) return p;
					}
					return null;
				};
				const ease = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
				const animate = (getY, setY, delta, durMs) =>
					new Promise((done) => {
						const startY = getY();
						const t0 = performance.now();
						const tick = (now) => {
							const u = Math.min(1, (now - t0) / durMs);
							setY(startY + delta * ease(u));
							if (u < 1) requestAnimationFrame(tick);
							else done();
						};
						requestAnimationFrame(tick);
					});
				const container = scrollableAncestor(el);
				const r = el.getBoundingClientRect();
				if (container) {
					const cr = container.getBoundingClientRect();
					const want = cr.top + cr.height * bandCenter; // viewport-y we want the element center at
					const delta = r.top + r.height / 2 - want;
					if (Math.abs(delta) < 4) return false;
					const durMs = Math.min(2200, Math.max(650, Math.abs(delta) * 1.0 + 400));
					await animate(() => container.scrollTop, (y) => (container.scrollTop = y), delta, durMs);
					return true;
				}
				const want = window.innerHeight * bandCenter;
				const delta = r.top + r.height / 2 - want;
				if (Math.abs(delta) < 4) return false;
				const durMs = Math.min(2200, Math.max(650, Math.abs(delta) * 1.0 + 400));
				await animate(() => window.scrollY, (y) => window.scrollTo(0, y), delta, durMs);
				return true;
			},
			{ el: handle, bandCenter: 0.42 }
		);
		await handle.dispose();
		await this.page.waitForTimeout(140);
		return scrolled;
	}

	// Glide until the element sits in the comfortable middle band of the viewport.
	async scrollIntoView(locator) {
		await locator.waitFor({ state: "visible", timeout: 15000 });
		const inBand = (box) => {
			const cy = box.y + box.height / 2;
			return cy >= this.viewport.height * 0.2 && cy <= this.viewport.height * 0.8;
		};
		for (let i = 0; i < 3; i++) {
			const box = await locator.boundingBox();
			if (box && inBand(box)) return box;
			// Ease whichever container owns the element. Handles both window-scroll pages and the
			// nested-container dashboards where window scroll is a no-op.
			const moved = await this.animateScrollToElement(locator);
			if (!moved) break;
		}
		return locator.boundingBox();
	}

	// Eased pointer path with a slight deterministic arc; logs waypoints for the synthetic cursor.
	async movePointer(tx, ty) {
		const from = { ...this.cursor };
		const dist = Math.hypot(tx - from.x, ty - from.y);
		if (dist < 3) return [];
		const durMs = Math.min(520, Math.max(300, dist * 0.4 + 200));
		const steps = Math.max(8, Math.min(14, Math.round(durMs / 45)));
		const mx = (from.x + tx) / 2;
		const my = (from.y + ty) / 2;
		const nx = -(ty - from.y) / dist;
		const ny = (tx - from.x) / dist;
		const side = (Math.round(tx + ty) & 1) === 0 ? 1 : -1;
		const arc = Math.min(56, dist * 0.12) * side;
		const cx = mx + nx * arc;
		const cy = my + ny * arc;
		const pts = [];
		for (let i = 1; i <= steps; i++) {
			const u = easeInOutCubic(i / steps);
			const x = (1 - u) ** 2 * from.x + 2 * (1 - u) * u * cx + u * u * tx;
			const y = (1 - u) ** 2 * from.y + 2 * (1 - u) * u * cy + u * u * ty;
			await this.page.mouse.move(x, y);
			pts.push({ x: Math.round(x), y: Math.round(y), t: this.now() });
			await this.page.waitForTimeout(Math.round(durMs / steps));
		}
		this.cursor = { x: tx, y: ty };
		return pts;
	}

	async elementText(locator) {
		const t = await locator.innerText().catch(() => null);
		if (t && t.trim()) return t.trim().replace(/\s+/g, " ").slice(0, 80);
		const aria = await locator.getAttribute("aria-label").catch(() => null);
		if (aria) return aria.slice(0, 80);
		const ph = await locator.getAttribute("placeholder").catch(() => null);
		return (ph || "").slice(0, 80);
	}

	absUrl(url) {
		return /^https?:/i.test(url) ? url : this.baseUrl + (url.startsWith("/") ? url : `/${url}`);
	}

	async goto(url, { settle = 350, media = true } = {}) {
		const tStart = this.now();
		const target = this.absUrl(url);
		await this.page.goto(target, { waitUntil: "domcontentloaded", timeout: 60000 });
		await this.settle(settle);
		// Log the goto BEFORE the stability wait: the load then sits between actions, where the
		// solver's idle compression cuts it to a brief transition instead of keeping the skeletons
		// and popping thumbnails on tape 1:1.
		this.onEvent({ kind: "goto", url: target, tStart, tEnd: this.now() });
		if (media) await this.waitForStable({ timeout: 8000 });
	}

	// Wait until the page has stopped loading in ways the camera can see: skeleton placeholders
	// cleared and every visible image/video actually painted. Resolves fast when there is nothing
	// pending. Logs nothing, so whatever time it takes lands in a compressed inter-action gap.
	async waitForStable({ timeout = 8000 } = {}) {
		await this.page
			.waitForFunction(
				() => {
					const visible = (el) => {
						const r = el.getBoundingClientRect();
						return r.width > 24 && r.height > 24 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
					};
					// Loading skeletons: aria-busy is the standard marker; the pulse class and the
					// app's data-* hook cover the rest.
					const skeletons = [...document.querySelectorAll('[aria-busy="true"], .animate-pulse, [data-home-skeleton], [data-skeleton]')];
					if (skeletons.some(visible)) return false;
					const imgs = [...document.querySelectorAll("img")].filter(visible);
					if (imgs.some((i) => i.getAttribute("src") && !(i.complete && i.naturalWidth > 0))) return false;
					const vids = [...document.querySelectorAll("video")].filter(visible);
					if (vids.some((v) => !((v.readyState >= 2 && v.currentTime > 0.05) || v.error))) return false;
					return true;
				},
				undefined,
				{ timeout }
			)
			.catch(() => {});
	}

	async click(sel, { settleAfter = 450 } = {}) {
		const tStart = this.now();
		const locator = this.loc(sel);
		const fromY = await this.scrollY();
		await this.scrollIntoView(locator);
		await this.settle(150);
		const bbox = await locator.boundingBox();
		if (!bbox) throw new Error(`click: target has no bbox: ${this.selStr(sel)}`);
		const text = await this.elementText(locator);
		const pointer = await this.movePointer(bbox.x + bbox.width / 2, bbox.y + bbox.height / 2);
		await this.settle(100);
		const tClick = this.now();
		await this.page.mouse.down();
		await this.page.waitForTimeout(70);
		await this.page.mouse.up();
		await this.settle(settleAfter);
		this.onEvent({
			kind: "click", selector: this.selStr(sel), elementText: text, bbox, pointer, tClick,
			url: this.page.url(), scroll: { fromY, toY: await this.scrollY() }, tStart, tEnd: this.now(),
		});
	}

	async fill(sel, value, { redact = false, settleAfter = 400 } = {}) {
		const tStart = this.now();
		const locator = this.loc(sel);
		const fromY = await this.scrollY();
		await this.scrollIntoView(locator);
		await this.settle(250);
		const bbox = await locator.boundingBox();
		if (!bbox) throw new Error(`fill: target has no bbox: ${this.selStr(sel)}`);
		const text = await this.elementText(locator);
		const pointer = await this.movePointer(bbox.x + bbox.width / 2, bbox.y + bbox.height / 2);
		const tClick = this.now();
		await this.page.mouse.down();
		await this.page.waitForTimeout(60);
		await this.page.mouse.up();
		await this.settle(220);
		const delay = Math.min(48, Math.max(14, Math.round(2600 / Math.max(value.length, 1))));
		await locator.pressSequentially(value, { delay });
		await this.settle(settleAfter);
		this.onEvent({
			kind: "fill", selector: this.selStr(sel), elementText: text, bbox, pointer, tClick,
			value: redact ? "•".repeat(8) : value, redact,
			url: this.page.url(), scroll: { fromY, toY: await this.scrollY() }, tStart, tEnd: this.now(),
		});
	}

	async press(key, { settleAfter = 500 } = {}) {
		const tStart = this.now();
		await this.page.keyboard.press(key);
		await this.settle(settleAfter);
		this.onEvent({ kind: "press", value: key, url: this.page.url(), tStart, tEnd: this.now() });
	}

	async hover(sel, { holdMs = 900 } = {}) {
		const tStart = this.now();
		const locator = this.loc(sel);
		await this.scrollIntoView(locator);
		await this.settle(200);
		const bbox = await locator.boundingBox();
		if (!bbox) throw new Error(`hover: target has no bbox: ${this.selStr(sel)}`);
		const text = await this.elementText(locator);
		const pointer = await this.movePointer(bbox.x + bbox.width / 2, bbox.y + bbox.height / 2);
		await this.settle(holdMs);
		this.onEvent({
			kind: "hover", selector: this.selStr(sel), elementText: text, bbox, pointer,
			url: this.page.url(), tStart, tEnd: this.now(),
		});
	}

	async select(sel, value, { settleAfter = 500 } = {}) {
		const tStart = this.now();
		const locator = this.loc(sel);
		await this.scrollIntoView(locator);
		const bbox = await locator.boundingBox();
		const pointer = bbox ? await this.movePointer(bbox.x + bbox.width / 2, bbox.y + bbox.height / 2) : [];
		await locator.selectOption(value);
		await this.settle(settleAfter);
		this.onEvent({
			kind: "select", selector: this.selStr(sel), bbox, pointer, value: String(value),
			url: this.page.url(), tStart, tEnd: this.now(),
		});
	}

	// Standalone narrative scroll (e.g. "scroll through the plans").
	async scrollBy(px, { label = "", duration } = {}) {
		const tStart = this.now();
		const fromY = await this.scrollY();
		const maxY = await this.page.evaluate(() => Math.max(0, document.documentElement.scrollHeight - innerHeight));
		const toY = Math.max(0, Math.min(maxY, fromY + px));
		await this.animateScroll(toY, { duration });
		await this.settle(450);
		this.onEvent({
			kind: "scroll", value: label, scroll: { fromY, toY: await this.scrollY() },
			url: this.page.url(), tStart, tEnd: this.now(),
		});
	}

	async waitFor(sel, { timeout = 20000 } = {}) {
		const tStart = this.now();
		const locator = this.loc(sel);
		await locator.waitFor({ state: "visible", timeout });
		const bbox = await locator.boundingBox().catch(() => null);
		this.onEvent({ kind: "waitFor", selector: this.selStr(sel), bbox, url: this.page.url(), tStart, tEnd: this.now() });
	}

	// A long in-product wait (render progress etc). The solver timelapses this window.
	async waitLong(sel, { label = "waiting", timeout = 300000 } = {}) {
		const tStart = this.now();
		if (sel) await this.loc(sel).waitFor({ state: "visible", timeout });
		this.onEvent({ kind: "waitLong", selector: sel ? this.selStr(sel) : null, value: label, url: this.page.url(), tStart, tEnd: this.now() });
	}

	// Deliberate hold the solver must NOT compress (let the viewer read the screen).
	async pause(seconds = 1.5) {
		// Let any lazy content settle FIRST, outside the pause window, so this deliberate 1:1 hold
		// shows a fully loaded page rather than skeletons or thumbnails popping in mid-hold.
		await this.waitForStable({ timeout: 6000 });
		const tStart = this.now();
		await this.page.waitForTimeout(Math.round(seconds * 1000));
		this.onEvent({ kind: "pause", url: this.page.url(), tStart, tEnd: this.now() });
	}

	// Escape hatch: run raw Playwright, still logged as a window.
	async custom(label, fn) {
		const tStart = this.now();
		await fn(this.page);
		this.onEvent({ kind: "custom", value: label, url: this.page.url(), tStart, tEnd: this.now() });
	}
}
