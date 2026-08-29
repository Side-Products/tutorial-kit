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
				bottom: 86,
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
					padding: "22px 44px",
					borderRadius: 22,
					background: "rgba(6,6,10,0.62)",
					border: "1px solid rgba(255,255,255,0.10)",
					fontSize: 56,
					fontWeight: 600,
					letterSpacing: 0.2,
					color: colors.text || "#fff",
					textAlign: "center",
					lineHeight: 1.25,
				}}
			>
				{page.words.map((w, i) => {
					const active = frame >= w.startFrame && frame <= w.endFrame + 2;
					return (
						<span key={i} style={{ color: active ? colors.accent || "#A78BFA" : "rgba(255,255,255,0.92)" }}>
							{w.text}
							{i < page.words.length - 1 ? " " : ""}
						</span>
					);
				})}
			</div>
		</div>
	);
};
