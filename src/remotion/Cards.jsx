import React from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame, interpolate, Easing } from "remotion";

const EASE = Easing.bezier(0.22, 0.61, 0.16, 1);

// Elements resolve into focus: blurred and slightly low, then sharp and settled. Reads as a
// lens finding focus rather than a slide, which is what made the old cards feel cheap.
const Reveal = ({ children, delay = 0, dur = 20, lift = 16, blur = 12 }) => {
	const frame = useCurrentFrame();
	const t = interpolate(frame, [delay, delay + dur], [0, 1], {
		easing: EASE,
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
	});
	return (
		<div
			style={{
				opacity: t,
				transform: `translateY(${(1 - t) * lift}px)`,
				filter: t < 1 ? `blur(${(1 - t) * blur}px)` : "none",
			}}
		>
			{children}
		</div>
	);
};

// Hairline that wipes open from the centre. One small piece of motion that keeps the card from
// being a static slab.
const Rule = ({ delay = 0, width = 220, color = "rgba(255,255,255,0.22)" }) => {
	const frame = useCurrentFrame();
	const w = interpolate(frame, [delay, delay + 26], [0, width], {
		easing: EASE,
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
	});
	return <div style={{ height: 1, width: w, background: color, margin: "0 auto" }} />;
};

export const IntroCard = ({ timeline }) => {
	const frame = useCurrentFrame();
	const total = timeline.intro.durationInFrames;
	const colors = timeline.brand?.colors || {};
	// Slow push in, then accelerate through the viewer on exit so the cut into the app feels
	// like a move rather than a splice.
	const drift = interpolate(frame, [0, total], [1, 1.03], { extrapolateRight: "clamp" });
	const exit = interpolate(frame, [total - 9, total - 1], [0, 1], {
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
	});
	return (
		<AbsoluteFill
			style={{
				alignItems: "center",
				justifyContent: "center",
				opacity: 1 - exit,
				transform: `scale(${drift + exit * 0.05})`,
			}}
		>
			<div style={{ textAlign: "center", maxWidth: "68%" }}>
				<Reveal delay={0} lift={10} blur={8}>
					{timeline.brand?.logo ? (
						<Img
							src={staticFile(timeline.brand.logo)}
							style={{ height: 78, display: "block", margin: "0 auto" }}
						/>
					) : (
						<div
							style={{
								fontSize: 30,
								fontWeight: 500,
								letterSpacing: 5,
								textTransform: "uppercase",
								color: "rgba(255,255,255,0.45)",
							}}
						>
							{timeline.brand?.name || ""}
						</div>
					)}
				</Reveal>
				<div style={{ marginTop: 30, marginBottom: 30 }}>
					<Rule delay={6} width={260} color={`${colors.accent || "#8B5CF6"}66`} />
				</div>
				<Reveal delay={5}>
					<div
						style={{
							fontSize: 108,
							fontWeight: 600,
							lineHeight: 1.12,
							color: colors.text || "#fff",
							letterSpacing: -1.5,
						}}
					>
						{timeline.intro.title}
					</div>
				</Reveal>
				{timeline.intro.subtitle ? (
					<Reveal delay={12} lift={12} blur={8}>
						<div style={{ marginTop: 34, fontSize: 42, fontWeight: 400, color: "rgba(255,255,255,0.5)" }}>
							{timeline.intro.subtitle}
						</div>
					</Reveal>
				) : null}
			</div>
		</AbsoluteFill>
	);
};

export const OutroCard = ({ timeline }) => {
	const frame = useCurrentFrame();
	const total = timeline.outro.durationInFrames;
	const colors = timeline.brand?.colors || {};
	// Settles instead of pushing: the video is ending, so the motion decelerates to rest.
	const settle = interpolate(frame, [0, Math.max(24, total)], [1.04, 1], {
		easing: EASE,
		extrapolateRight: "clamp",
	});
	const fade = interpolate(frame, [total - 8, total - 1], [1, 0], {
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
	});
	return (
		<AbsoluteFill
			style={{ alignItems: "center", justifyContent: "center", opacity: fade, transform: `scale(${settle})` }}
		>
			<div style={{ textAlign: "center" }}>
				<Reveal delay={0} lift={12} blur={10}>
					{timeline.brand?.logo ? (
						<Img
							src={staticFile(timeline.brand.logo)}
							style={{ height: 138, display: "block", margin: "0 auto" }}
						/>
					) : (
						<div
							style={{ fontSize: 130, fontWeight: 700, color: colors.text || "#fff", letterSpacing: -1.5 }}
						>
							{timeline.outro.title}
						</div>
					)}
				</Reveal>
				<div style={{ marginTop: 40, marginBottom: 40 }}>
					<Rule delay={8} width={300} color={`${colors.accent || "#8B5CF6"}55`} />
				</div>
				<Reveal delay={10} lift={10} blur={8}>
					<div
						style={{
							display: "inline-block",
							padding: "16px 48px",
							borderRadius: 999,
							border: "1px solid rgba(255,255,255,0.16)",
							fontSize: 44,
							fontWeight: 500,
							letterSpacing: 1,
							color: "rgba(255,255,255,0.85)",
						}}
					>
						{shortUrl(timeline.outro.subtitle)}
					</div>
				</Reveal>
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
