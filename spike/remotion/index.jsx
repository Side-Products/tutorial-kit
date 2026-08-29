import React from "react";
import { registerRoot, Composition, AbsoluteFill, OffthreadVideo, staticFile } from "remotion";

const SpikeZoom = ({ src }) => {
	return (
		<AbsoluteFill style={{ backgroundColor: "#0a0a0f" }}>
			<AbsoluteFill style={{ transform: "scale(1.6)", transformOrigin: "35% 30%" }}>
				<OffthreadVideo src={staticFile(src)} muted />
			</AbsoluteFill>
		</AbsoluteFill>
	);
};

const Root = () => (
	<Composition
		id="SpikeZoom"
		component={SpikeZoom}
		durationInFrames={60}
		fps={30}
		width={3840}
		height={2160}
		defaultProps={{ src: "mezzanine.mp4" }}
	/>
);

registerRoot(Root);
