import React from "react";
import { AbsoluteFill, Audio, Sequence, staticFile } from "remotion";
import { StepScene } from "./StepScene.jsx";
import { IntroCard, OutroCard } from "./Cards.jsx";
import { Captions } from "./Captions.jsx";

export const Tutorial = ({ timeline }) => {
	const { brand, intro, outro, steps, assets } = timeline;
	const colors = brand?.colors || { bg: "#0b0b10", accent: "#8B5CF6", text: "#ffffff" };
	// The title and end cards already carry their line as set type; captioning it too puts the
	// same sentence on screen twice. Words that spill past a card onto the app still caption.
	const cardEnd = intro.from + intro.durationInFrames;
	const allWords = [
		...(intro?.words || []),
		...steps.flatMap((s) => s.words || []),
		...(outro?.words || []),
	].filter((w) => w.startFrame >= cardEnd && w.startFrame < outro.from);
	return (
		<AbsoluteFill
			style={{
				background: colors.bg,
				fontFamily: 'Inter, -apple-system, "SF Pro Display", "Segoe UI", sans-serif',
			}}
		>
			<Audio src={staticFile(assets.audio)} />
			<Sequence from={intro.from} durationInFrames={intro.durationInFrames}>
				<IntroCard timeline={timeline} />
			</Sequence>
			{steps.map((step, i) => (
				<Sequence
					key={step.stepId}
					from={step.from}
					durationInFrames={step.durationInFrames}
					premountFor={30}
				>
					<StepScene timeline={timeline} step={step} index={i} />
				</Sequence>
			))}
			<Sequence from={outro.from} durationInFrames={outro.durationInFrames}>
				<OutroCard timeline={timeline} />
			</Sequence>
			<Captions words={allWords} colors={colors} />
		</AbsoluteFill>
	);
};

export function shade(hex, amt) {
	const m = hex.replace("#", "");
	const n = parseInt(
		m.length === 3
			? m
					.split("")
					.map((c) => c + c)
					.join("")
			: m,
		16,
	);
	const f = (v) => Math.max(0, Math.min(255, Math.round(v * (1 + amt))));
	const r = f((n >> 16) & 255);
	const g = f((n >> 8) & 255);
	const b = f(n & 255);
	return `rgb(${r},${g},${b})`;
}
