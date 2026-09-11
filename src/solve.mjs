// The timeline solver: all math lives here, the Remotion comp stays dumb.
// Capture time (epoch seconds) -> mezzanine time (retimed) -> composition frames.

const FPS = 30;
const IDLE_MAX = 0.9; // gaps longer than this get compressed...
const IDLE_OUT = 0.45; // ...to this (gentler than a hard jump cut)
const LAPSE_OUT = 2.5; // waitLong windows become this long (fast forward)

export function buildRetimeMap(events, frames) {
	const t0 = frames[0].t;
	const tEnd = frames[frames.length - 1].t;
	const windows = [];
	for (const s of events.steps) {
		for (const a of s.actions) {
			const kind = a.kind === "waitLong" ? "timelapse" : "activity";
			windows.push({ start: Math.max(a.tStart, t0), end: Math.min(a.tEnd, tEnd), kind });
		}
	}
	windows.sort((x, y) => x.start - y.start);

	const segs = [];
	const pushGap = (from, to) => {
		const d = to - from;
		if (d <= 0) return;
		segs.push({ srcStart: from, srcEnd: to, outDur: d > IDLE_MAX ? IDLE_OUT : d });
	};
	let cur = t0;
	for (const w of windows) {
		if (w.start > cur) pushGap(cur, w.start);
		const s = Math.max(w.start, cur);
		const e = Math.max(w.end, s);
		if (e > s) {
			segs.push({ srcStart: s, srcEnd: e, outDur: w.kind === "timelapse" ? Math.min(e - s, LAPSE_OUT) : e - s });
		}
		cur = Math.max(cur, e);
	}
	if (tEnd > cur) pushGap(cur, tEnd);

	let acc = 0;
	for (const s of segs) {
		s.outStart = acc;
		acc += s.outDur;
	}
	const map = (t) => {
		if (t <= t0) return 0;
		for (const s of segs) {
			if (t <= s.srcEnd) {
				if (t < s.srcStart) return s.outStart;
				const span = s.srcEnd - s.srcStart || 1e-9;
				return s.outStart + ((t - s.srcStart) / span) * s.outDur;
			}
		}
		return acc;
	};
	return { map, totalOut: acc, segs };
}

export function frameOutDurations(frames, map) {
	const out = [];
	for (let i = 0; i < frames.length; i++) {
		if (i < frames.length - 1) {
			out.push(Math.max(0.0004, map(frames[i + 1].t) - map(frames[i].t)));
		} else {
			out.push(1 / FPS);
		}
	}
	return out;
}

// One zoom cluster per step: consecutive click/fill bboxes within reach of each other,
// preferring the last (usually the decisive) cluster. Skips huge targets.
function planZoom(step, map, stepSrcStart, stepFrames, viewport) {
	const pts = step.actions.filter((a) => (a.kind === "click" || a.kind === "fill" || a.kind === "select") && a.bbox);
	if (!pts.length) return { zoom: [], cluster: null };
	const clusters = [];
	let cluster = null;
	for (const a of pts) {
		const cx = a.bbox.x + a.bbox.width / 2;
		const cy = a.bbox.y + a.bbox.height / 2;
		if (cluster && Math.hypot(cx - cluster.cx, cy - cluster.cy) < 420) {
			cluster.actions.push(a);
			cluster.minX = Math.min(cluster.minX, a.bbox.x);
			cluster.minY = Math.min(cluster.minY, a.bbox.y);
			cluster.maxX = Math.max(cluster.maxX, a.bbox.x + a.bbox.width);
			cluster.maxY = Math.max(cluster.maxY, a.bbox.y + a.bbox.height);
			cluster.cx = (cluster.minX + cluster.maxX) / 2;
			cluster.cy = (cluster.minY + cluster.maxY) / 2;
		} else {
			cluster = {
				actions: [a],
				minX: a.bbox.x, minY: a.bbox.y,
				maxX: a.bbox.x + a.bbox.width, maxY: a.bbox.y + a.bbox.height,
				cx: a.bbox.x + a.bbox.width / 2, cy: a.bbox.y + a.bbox.height / 2,
			};
			clusters.push(cluster);
		}
	}
	const best = clusters.reduce((a, b) => (b.actions.length >= a.actions.length ? b : a));
	const w = best.maxX - best.minX;
	const h = best.maxY - best.minY;
	if (w > viewport.width * 0.45 || h > viewport.height * 0.45) return { zoom: [], cluster: null };
	const maxDim = Math.max(w, h * 1.6);
	const scale = maxDim < 260 ? 1.7 : maxDim < 620 ? 1.5 : 1.35;

	const toStepFrame = (t) => Math.round((map(t) - stepSrcStart) * FPS);
	const first = best.actions[0];
	const last = best.actions[best.actions.length - 1];
	const inStart = Math.max(2, toStepFrame(first.tStart) - 10);
	const inDone = inStart + 20;
	const outStart = Math.max(inDone + 12, Math.min(stepFrames - 24, toStepFrame(last.tEnd) + 18));
	const outDone = Math.min(stepFrames - 1, outStart + 22);
	if (outStart <= inDone) return { zoom: [], cluster: null };
	const focal = { x: best.cx, y: best.cy };
	const center = { x: viewport.width / 2, y: viewport.height / 2 };
	return {
		zoom: [
			{ frame: 0, scale: 1, x: center.x, y: center.y },
			{ frame: inStart, scale: 1, x: focal.x, y: focal.y },
			{ frame: inDone, scale, x: focal.x, y: focal.y },
			{ frame: outStart, scale, x: focal.x, y: focal.y },
			{ frame: outDone, scale: 1, x: center.x, y: center.y },
		],
		cluster: { bbox: { x: best.minX, y: best.minY, width: w, height: h }, scale },
	};
}

function cursorForStep(step, map, stepSrcStart, stepFrames) {
	const path = [];
	const clicks = [];
	const toStepFrame = (t) => Math.round((map(t) - stepSrcStart) * FPS);
	for (const a of step.actions) {
		if (a.pointer) {
			for (const p of a.pointer) {
				const frame = toStepFrame(p.t);
				if (frame >= 0 && frame <= stepFrames) path.push({ frame, x: p.x, y: p.y });
			}
		}
		if (a.tClick && a.bbox) {
			clicks.push({ frame: toStepFrame(a.tClick), x: Math.round(a.bbox.x + a.bbox.width / 2), y: Math.round(a.bbox.y + a.bbox.height / 2) });
		}
	}
	path.sort((a, b) => a.frame - b.frame);
	return { path, clicks };
}

export function solveTimeline({ events, frames, words, config }) {
	const viewport = events.meta.viewport;
	const { map, totalOut } = buildRetimeMap(events, frames);
	const blockFor = (id) => words.blocks.find((b) => b.blockId === id);

	const sec = (f) => f / FPS;
	const toFrames = (s) => Math.round(s * FPS);
	const canonical = (url) => {
		try {
			const u = new URL(url);
			u.host = events.meta.canonicalHost;
			return u.href;
		} catch {
			return url;
		}
	};

	let cursorFrame = 0;
	let lastCursor = null;
	let lastStepAudioEnd = 0;
	const audioPlacements = [];
	const timelineSteps = [];

	const intro = blockFor("intro");
	const introDur = intro ? intro.durationSec : 0;
	// Title card holds for half the narration; the rest of the intro VO plays over the
	// first step, whose own VO is pushed back so the two never overlap.
	const introFrames = toFrames(Math.min(2.8, Math.max(2.2, (introDur + 1.0) / 2)));
	if (intro) audioPlacements.push({ blockId: "intro", startSec: 0.4 });
	cursorFrame += introFrames;
	const introAudioSpill = intro ? Math.max(0, 0.4 + introDur - sec(cursorFrame)) : 0;

	for (const s of events.steps) {
		const block = blockFor(`step:${s.stepId}`);
		const srcFrom = map(s.tStart);
		const srcEnd = map(s.tEnd);
		const videoDur = Math.max(0.2, srcEnd - srcFrom);
		const audioDur = block ? block.durationSec : 0;
		const audioLead = 0.25 + (timelineSteps.length === 0 ? introAudioSpill : 0);
		const screenTime = Math.max(videoDur + 0.25, audioLead + audioDur + 0.5);
		const durationInFrames = toFrames(screenTime);
		const videoFrames = toFrames(videoDur);
		const freezeFrames = Math.max(0, durationInFrames - videoFrames);
		const { zoom, cluster } = planZoom(s, map, srcFrom, durationInFrames, viewport);
		const cursor = cursorForStep(s, map, srcFrom, durationInFrames);
		// Cursor continuity: a step with no pointer motion keeps the cursor parked where it was.
		if (!cursor.path.length && lastCursor) cursor.path = [{ frame: 0, x: lastCursor.x, y: lastCursor.y }];
		if (cursor.path.length) lastCursor = cursor.path[cursor.path.length - 1];
		const stepWords = block
			? block.words.map((w) => ({
					text: w.word,
					startFrame: cursorFrame + toFrames(audioLead + w.start),
					endFrame: cursorFrame + toFrames(audioLead + w.end),
				}))
			: [];
		if (block) {
			audioPlacements.push({ blockId: block.blockId, startSec: sec(cursorFrame) + audioLead });
			lastStepAudioEnd = sec(cursorFrame) + audioLead + audioDur;
		}
		timelineSteps.push({
			stepId: s.stepId,
			title: (s.title && s.title !== s.stepId ? s.title : s.stepId.replace(/[-_]+/g, " ").replace(/^\w/, (c) => c.toUpperCase())),
			from: cursorFrame,
			durationInFrames,
			video: { srcFrom: toFrames(srcFrom), srcDuration: videoFrames, freezeFrames },
			urlDisplay: canonical(s.urlAfter),
			zoom,
			zoomCluster: cluster,
			cursor,
			words: stepWords,
		});
		cursorFrame += durationInFrames;
	}

	const outro = blockFor("outro");
	const outroDur = outro ? outro.durationSec : 0;
	// Mirror of the intro spill: the sign-off starts over the tail of the last step (never on top
	// of that step's own line), so the end card only has to hold the last beat of it.
	const outroCardStart = sec(cursorFrame);
	const outroAudioStart = outro
		? Math.min(outroCardStart + 0.4, Math.max(lastStepAudioEnd + 0.35, outroCardStart - 2.0))
		: outroCardStart;
	const outroFrames = toFrames(Math.max(2.2, outroAudioStart + outroDur + 0.7 - outroCardStart));
	if (outro) audioPlacements.push({ blockId: "outro", startSec: outroAudioStart });
	const durationInFrames = cursorFrame + outroFrames;

	const introWords = intro
		? intro.words.map((w) => ({ text: w.word, startFrame: toFrames(0.4 + w.start), endFrame: toFrames(0.4 + w.end) }))
		: [];
	const outroWords = outro
		? outro.words.map((w) => ({
				text: w.word,
				startFrame: toFrames(outroAudioStart + w.start),
				endFrame: toFrames(outroAudioStart + w.end),
			}))
		: [];

	const timeline = {
		meta: {
			flowId: events.meta.flowId,
			title: events.meta.title,
			fps: FPS,
			width: 3840,
			height: 2160,
			durationInFrames,
			viewport,
		},
		brand: config.brand,
		assets: { mezzanine: "mezzanine.mp4", audio: "mixed.wav" },
		intro: { from: 0, durationInFrames: introFrames, title: events.meta.title, subtitle: events.meta.goal, words: introWords },
		outro: {
			from: cursorFrame,
			durationInFrames: outroFrames,
			title: config.brand?.name || "",
			subtitle: canonical(events.meta.baseUrl),
			words: outroWords,
		},
		steps: timelineSteps,
		chapters: [
			{ title: "Intro", startFrame: 0 },
			...timelineSteps.map((s) => ({ title: s.title, startFrame: s.from })),
		],
	};
	return { timeline, map, totalOut, audioPlacements };
}
