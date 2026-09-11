import React from "react";
import { useCurrentFrame } from "remotion";

// Lower-third captions: words grouped into short pages, active word tinted accent.
// No glow, hairline border, translucent slab.
function paginate(words) {
	const pages = [];
	let page = null;
	for (const w of words) {
		const prev = page?.words[page.words.length - 1];
		const gap = prev ? w.startFrame - prev.endFrame : 0;
		if (!page || page.words.length >= 5 || gap > 24) {
			page = { start: w.startFrame, end: w.endFrame, words: [] };
			pages.push(page);
		}
		page.words.push(w);
		page.end = w.endFrame;
	}
	return pages;
}

export const Captions = ({ words, colors }) => {
	const frame = useCurrentFrame();
	if (!words?.length) return null;
	const pages = paginate(words);
	const page = pages.find((p) => frame >= p.start - 3 && frame <= p.end + 8);
	if (!page) return null;
	return (
		<div
			style={{
				position: "absolute",
				bottom: 172,
				left: 0,
				right: 0,
				display: "flex",
				justifyContent: "center",
				pointerEvents: "none",
			}}
		>
			<div
				style={{
					maxWidth: "72%",
					padding: "18px 40px",
					borderRadius: 14,
					background: `${colors.bg || "#0B0713"}D9`,
					fontSize: 52,
					fontWeight: 500,
					letterSpacing: 0.2,
					color: "rgba(255,255,255,0.95)",
					textAlign: "center",
					lineHeight: 1.3,
					textShadow: "0 2px 10px rgba(0,0,0,0.45)",
				}}
			>
				{page.words.map((w) => w.text).join(" ")}
			</div>
		</div>
	);
};
