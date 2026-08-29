import React from "react";
import { useCurrentFrame, interpolate } from "remotion";

// Synthetic cursor replaying the exact recorded pointer waypoints (the real cursor is hidden
// during capture). Lives inside the ZoomPan transform so it tracks zooms automatically.
export const CursorLayer = ({ cursor, accent }) => {
	const frame = useCurrentFrame();
	if (!cursor || !cursor.path || cursor.path.length === 0) return null;
	const pts = cursor.path.filter((p, i, arr) => i === 0 || p.frame > arr[i - 1].frame);
	const frames = pts.map((p) => p.frame);
	const x = interpolate(frame, frames, pts.map((p) => p.x), { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
	const y = interpolate(frame, frames, pts.map((p) => p.y), { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

	let press = 0;
	for (const c of cursor.clicks || []) {
		if (frame >= c.frame - 3 && frame <= c.frame + 6) {
			press = interpolate(frame, [c.frame - 3, c.frame, c.frame + 6], [0, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
		}
	}

	return (
		<>
			{(cursor.clicks || []).map((c, i) => {
				if (frame < c.frame || frame > c.frame + 18) return null;
				const r = interpolate(frame, [c.frame, c.frame + 18], [10, 64]);
				const o = interpolate(frame, [c.frame, c.frame + 18], [0.55, 0]);
				return (
					<div
						key={i}
						style={{
							position: "absolute",
							left: c.x - r,
							top: c.y - r,
							width: r * 2,
							height: r * 2,
							borderRadius: "50%",
							border: `3px solid ${accent}`,
							opacity: o,
						}}
					/>
				);
			})}
			<svg
				width={30}
				height={30}
				viewBox="0 0 28 28"
				style={{
					position: "absolute",
					left: x - 4,
					top: y - 3,
					transform: `scale(${1 - press * 0.18})`,
					transformOrigin: "6px 4px",
					filter: "drop-shadow(0 2px 5px rgba(0,0,0,0.5))",
				}}
			>
				<path
					d="M6 3 L6 21.5 L10.6 17.2 L13.4 23.4 L16.6 22 L13.8 15.9 L20.2 15.6 Z"
					fill="#111"
					stroke="#fff"
					strokeWidth="1.6"
					strokeLinejoin="round"
				/>
			</svg>
		</>
	);
};
