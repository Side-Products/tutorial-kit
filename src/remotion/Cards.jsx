import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, Easing } from "remotion";

const EASE = Easing.bezier(0.3, 0, 0.12, 1);

// Prominent text enters as a masked rise (overflow-hidden parent, translateY child), never a
// plain fade.
const Rise = ({ children, delay = 0, dur = 22 }) => {
	const frame = useCurrentFrame();
	const y = interpolate(frame, [delay, delay + dur], [110, 0], { easing: EASE, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
	return (
		<div style={{ overflow: "hidden", padding: "0.12em 0" }}>
			<div style={{ transform: `translateY(${y}%)` }}>{children}</div>
		</div>
	);
};

export const IntroCard = ({ timeline }) => {
	const frame = useCurrentFrame();
	const colors = timeline.brand?.colors || {};
	const out = interpolate(frame, [timeline.intro.durationInFrames - 10, timeline.intro.durationInFrames - 2], [1, 0], {
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
	});
	return (
		<AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: out }}>
			<div style={{ textAlign: "center", maxWidth: "72%" }}>
				<Rise delay={2}>
					<div style={{ fontSize: 54, fontWeight: 700, letterSpacing: 10, textTransform: "uppercase", color: colors.accent || "#A78BFA" }}>
						{timeline.brand?.name || ""} tutorial
					</div>
				</Rise>
				<Rise delay={8}>
					<div style={{ fontSize: 150, fontWeight: 800, lineHeight: 1.06, color: colors.text || "#fff", letterSpacing: -2 }}>
						{timeline.intro.title}
					</div>
				</Rise>
				{timeline.intro.subtitle ? (
					<Rise delay={16}>
						<div style={{ marginTop: 34, fontSize: 58, fontWeight: 500, color: "rgba(255,255,255,0.66)" }}>
							{timeline.intro.subtitle}
						</div>
					</Rise>
				) : null}
			</div>
		</AbsoluteFill>
	);
};

export const OutroCard = ({ timeline }) => {
	const colors = timeline.brand?.colors || {};
	return (
		<AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
			<div style={{ textAlign: "center" }}>
				<Rise delay={4}>
					<div style={{ fontSize: 130, fontWeight: 800, color: colors.text || "#fff", letterSpacing: -1.5 }}>
						{timeline.outro.title}
					</div>
				</Rise>
				<Rise delay={12}>
					<div
						style={{
							marginTop: 44,
							display: "inline-block",
							padding: "24px 64px",
							borderRadius: 999,
							border: `1px solid ${colors.accent || "#A78BFA"}66`,
							background: `${colors.accent || "#A78BFA"}1a`,
							fontSize: 62,
							fontWeight: 600,
							color: colors.text || "#fff",
						}}
					>
						{shortUrl(timeline.outro.subtitle)}
					</div>
				</Rise>
			</div>
		</AbsoluteFill>
	);
};

function shortUrl(u) {
	try {
		return new URL(u).host;
	} catch {
		return u || "";
	}
}
