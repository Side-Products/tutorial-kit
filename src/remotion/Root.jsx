import React from "react";
import { Composition } from "remotion";
import { Tutorial } from "./Tutorial.jsx";

const FALLBACK = {
	meta: {
		flowId: "none",
		title: "Tutorial",
		fps: 30,
		width: 3840,
		height: 2160,
		durationInFrames: 90,
		viewport: { width: 1920, height: 1080, dsf: 2 },
	},
	brand: { name: "Product", colors: { bg: "#0b0b10", accent: "#8B5CF6", text: "#ffffff" } },
	assets: { mezzanine: "mezzanine.mp4", audio: "mixed.wav" },
	intro: { from: 0, durationInFrames: 45, title: "Tutorial", subtitle: "", words: [] },
	outro: { from: 45, durationInFrames: 45, title: "", subtitle: "", words: [] },
	steps: [],
	chapters: [],
};

export const Root = () => (
	<Composition
		id="Tutorial"
		component={Tutorial}
		durationInFrames={90}
		fps={30}
		width={3840}
		height={2160}
		defaultProps={{ timeline: FALLBACK }}
		calculateMetadata={({ props }) => ({
			durationInFrames: props.timeline.meta.durationInFrames,
			fps: props.timeline.meta.fps,
			width: props.timeline.meta.width,
			height: props.timeline.meta.height,
		})}
	/>
);
