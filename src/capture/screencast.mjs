import fs from "node:fs";
import path from "node:path";

// CDP screencast recorder. Frames are damage-driven: they only arrive on repaint, and each one
// must be acked immediately or Chrome stops sending. metadata.timestamp is epoch seconds on the
// same clock family as Date.now(), which is what makes event/frame alignment exact.
export class Screencast {
	constructor({ context, page, framesDir }) {
		this.context = context;
		this.page = page;
		this.framesDir = framesDir;
		this.frames = [];
		this.writeChain = Promise.resolve();
		this.index = 0;
		this.cdp = null;
	}

	async start() {
		fs.mkdirSync(this.framesDir, { recursive: true });
		this.cdp = await this.context.newCDPSession(this.page);
		this.cdp.on("Page.screencastFrame", (params) => {
			const i = this.index++;
			const file = path.join(this.framesDir, `f${String(i).padStart(6, "0")}.jpg`);
			this.frames.push({ i, file: path.basename(file), t: params.metadata.timestamp });
			this.cdp.send("Page.screencastFrameAck", { sessionId: params.sessionId }).catch(() => {});
			const buf = Buffer.from(params.data, "base64");
			this.writeChain = this.writeChain.then(() => fs.promises.writeFile(file, buf));
		});
		// everyNthFrame 1 + quality 85: 4K JPEG encode is the fps bottleneck during motion (~17fps
		// at q90). Cheaper encode + uncapped sampling buys real frames exactly when things move.
		await this.cdp.send("Page.startScreencast", {
			format: "jpeg",
			quality: 85,
			maxWidth: 3840,
			maxHeight: 2160,
			everyNthFrame: 1,
		});
	}

	async stop() {
		if (!this.cdp) return this.frames;
		await this.cdp.send("Page.stopScreencast").catch(() => {});
		await this.writeChain;
		return this.frames;
	}
}
