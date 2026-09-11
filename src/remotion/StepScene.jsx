import React from "react";
import { AbsoluteFill, Sequence, OffthreadVideo, Freeze, staticFile, useCurrentFrame, interpolate, Easing } from "remotion";
import { CursorLayer } from "./Cursor.jsx";
import { shade } from "./Tutorial.jsx";

const EASE = Easing.bezier(0.35, 0, 0.15, 1);
const ZOOM_INTENSITY = 0.5;

// Zoom/pan: keyframes carry {frame, scale, x, y} with focal in viewport CSS px. We translate so
// the focal point sits at stage center, clamped so the screen edges never enter the frame.
function zoomTransform(zoom, frame, vw, vh) {
	if (!zoom || zoom.length < 2) return { scale: 1, tx: 0, ty: 0 };
	const kfs = zoom.filter((k, i, arr) => i === 0 || k.frame > arr[i - 1].frame);
	const frames = kfs.map((k) => k.frame);
	const s = interpolate(frame, frames, kfs.map((k) => k.scale), { easing: EASE, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
	let fx = interpolate(frame, frames, kfs.map((k) => k.x), { easing: EASE, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
	let fy = interpolate(frame, frames, kfs.map((k) => k.y), { easing: EASE, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
	fx = Math.max(vw / 2 / s, Math.min(vw - vw / 2 / s, fx));
	fy = Math.max(vh / 2 / s, Math.min(vh - vh / 2 / s, fy));
	// Halve the movement away from the unzoomed view, including the pan. Apply this
	// when rendering so existing timelines get the same reduction as future builds.
	return {
		scale: 1 + (s - 1) * ZOOM_INTENSITY,
		tx: s * (vw / 2 - fx) * ZOOM_INTENSITY,
		ty: s * (vh / 2 - fy) * ZOOM_INTENSITY,
	};
}

export const StepScene = ({ timeline, step, index }) => {
	const frame = useCurrentFrame();
	const { viewport } = timeline.meta;
	const colors = timeline.brand?.colors || {};
	const vw = viewport.width;
	const vh = viewport.height;
	const stageW = timeline.meta.width * 0.84;
	const chromeH = 46; // in viewport CSS units
	const stageScale = stageW / vw;
	const cardH = (vh + chromeH) * stageScale;
	const cardTop = (timeline.meta.height - cardH) / 2 + 20;
	const { scale, tx, ty } = zoomTransform(step.zoom, frame, vw, vh);
	const url = safeUrl(step.urlDisplay);

	return (
		<AbsoluteFill style={{ alignItems: "center" }}>
			<div
				style={{
					width: stageW,
					height: cardH,
					marginTop: cardTop,
					borderRadius: 26 * stageScale * 0.6,
					overflow: "hidden",
					boxShadow: `0 ${44}px ${120}px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.08)`,
					background: shade(colors.bg || "#101016", 0.6),
				}}
			>
				{/* Browser chrome */}
				<div
					style={{
						height: chromeH * stageScale,
						display: "flex",
						alignItems: "center",
						paddingLeft: 22 * stageScale,
						paddingRight: 22 * stageScale,
						gap: 8 * stageScale,
						background: "rgba(255,255,255,0.055)",
						borderBottom: "1px solid rgba(255,255,255,0.07)",
					}}
				>
					{["#FF5F57", "#FEBC2E", "#28C840"].map((c) => (
						<div key={c} style={{ width: 12 * stageScale, height: 12 * stageScale, borderRadius: "50%", background: c, opacity: 0.9 }} />
					))}
					<div
						style={{
							margin: "0 auto",
							padding: `${6 * stageScale}px ${26 * stageScale}px`,
							borderRadius: 999,
							background: "rgba(0,0,0,0.35)",
							border: "1px solid rgba(255,255,255,0.06)",
							color: "rgba(255,255,255,0.72)",
							fontSize: 15 * stageScale,
							fontWeight: 500,
							maxWidth: "46%",
							whiteSpace: "nowrap",
							overflow: "hidden",
							textOverflow: "ellipsis",
						}}
					>
						{url}
					</div>
					<div style={{ width: 44 * stageScale }} />
				</div>
				{/* Screen viewport in CSS-px coordinate space, scaled up to the stage */}
				<div style={{ width: vw, height: vh, transform: `scale(${stageScale})`, transformOrigin: "top left" }}>
					<div style={{ width: vw, height: vh, transform: `translate(${tx}px, ${ty}px) scale(${scale})`, transformOrigin: "center" }}>
						<Sequence from={0} durationInFrames={Math.max(1, step.video.srcDuration)} layout="none">
							<OffthreadVideo
								src={staticFile(timeline.assets.mezzanine)}
								trimBefore={step.video.srcFrom}
								trimAfter={step.video.srcFrom + Math.max(1, step.video.srcDuration)}
								muted
								style={{ width: vw, height: vh, display: "block" }}
							/>
						</Sequence>
						{step.video.freezeFrames > 0 ? (
							<Sequence from={Math.max(1, step.video.srcDuration)} durationInFrames={step.video.freezeFrames} layout="none">
								<Freeze frame={step.video.srcFrom + Math.max(1, step.video.srcDuration) - 1}>
									<OffthreadVideo src={staticFile(timeline.assets.mezzanine)} muted style={{ width: vw, height: vh, display: "block" }} />
								</Freeze>
							</Sequence>
						) : null}
						<CursorLayer cursor={step.cursor} accent={colors.accent || "#8B5CF6"} />
					</div>
				</div>
			</div>
			<StepChip index={index} total={timeline.steps.length} title={step.title} colors={colors} stageW={stageW} top={Math.max(18, cardTop - 96)} />
		</AbsoluteFill>
	);
};

const StepChip = ({ index, total, title, colors, stageW, top }) => {
	const frame = useCurrentFrame();
	const rise = interpolate(frame, [4, 20], [26, 0], { easing: EASE, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
	const opacity = interpolate(frame, [4, 18, 110, 126], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
	return (
		<div
			style={{
				position: "absolute",
				left: `calc(50% - ${stageW / 2}px)`,
				top,
				overflow: "hidden",
				opacity,
			}}
		>
			<div
				style={{
					transform: `translateY(${rise}px)`,
					display: "flex",
					alignItems: "center",
					gap: 20,
					padding: "16px 34px",
					borderRadius: 999,
					background: "rgba(0,0,0,0.42)",
					border: "1px solid rgba(255,255,255,0.12)",
					color: "rgba(255,255,255,0.94)",
					fontSize: 40,
					fontWeight: 600,
				}}
			>
				<span style={{ color: colors.accent || "#8B5CF6", fontWeight: 700 }}>{index + 1}/{total}</span>
				<span>{title}</span>
			</div>
		</div>
	);
};

function safeUrl(u) {
	try {
		const url = new URL(u);
		return `${url.protocol}//${url.host}${url.pathname === "/" ? "" : url.pathname}`;
	} catch {
		return u || "";
	}
}
