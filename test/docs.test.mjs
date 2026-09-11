import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { buildDocs } from "../src/docs/build.mjs";
import { buildFlow } from "../src/stages.mjs";

test("generated guides render page content as text and keep redacted values out of artifacts", async (t) => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "tutorial-docs-"));
	t.after(() => fs.rmSync(root, { recursive: true, force: true }));
	const flow = { id: "demo" };
	const out = path.join(root, flow.id);
	for (const dir of ["capture/shots", "compose", "script"])
		fs.mkdirSync(path.join(out, dir), { recursive: true });
	await sharp({ create: { width: 20, height: 20, channels: 3, background: "white" } })
		.png()
		.toFile(path.join(out, "capture/shots/step.png"));
	const events = {
		meta: {
			title: '<script>alert("example")</script>',
			viewport: { dsf: 1 },
			canonicalHost: "example.com",
			baseUrl: "https://example.com/?token=private-url",
		},
		steps: [
			{
				stepId: "open",
				urlBefore: "about:blank",
				urlAfter: "https://example.com/?token=private-url",
				shotAfter: "shots/step.png",
				actions: [
					{
						kind: "fill",
						redact: true,
						value: "private-demo-value",
						elementText: "![tracker](https://elsewhere.example/pixel)",
					},
				],
			},
		],
	};
	const timeline = {
		meta: { durationInFrames: 30 },
		intro: { words: [] },
		outro: { words: [] },
		chapters: [],
		steps: [{ stepId: "open", title: "Open", words: [] }],
	};
	fs.writeFileSync(path.join(out, "capture/events.json"), JSON.stringify(events));
	fs.writeFileSync(path.join(out, "compose/timeline.json"), JSON.stringify(timeline));
	fs.writeFileSync(
		path.join(out, "script/script.md"),
		"## intro\n\n<img src=remote>\n\n## step:open\n\nA sample.\n",
	);
	await buildDocs(flow, { outDirAbs: root });
	const guide = fs.readFileSync(path.join(out, "docs/guide.md"), "utf8");
	const json = fs.readFileSync(path.join(out, "docs/tutorial.json"), "utf8");
	assert.ok(!guide.includes("<script>") && !guide.includes("<img"));
	assert.ok(!guide.includes("![tracker]("));
	assert.ok(guide.includes("&lt;script&gt;"));
	assert.ok(!guide.includes("private-demo-value") && !json.includes("private-demo-value"));
	assert.ok(!json.includes("private-url"));
});

test("an invalid force stage fails before recording or reading flow files", async () => {
	await assert.rejects(buildFlow({ id: "demo" }, {}, { force: "typo" }), /unknown force stage/);
});
