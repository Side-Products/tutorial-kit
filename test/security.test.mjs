import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathInside } from "../src/security/paths.mjs";
import { httpUrl, sameOriginUrl, publicUrl, requireSecureTransport } from "../src/security/urls.mjs";
import { loadConfig, flowOutDir } from "../src/config.mjs";
import { loadFlows } from "../src/flow/loader.mjs";
import { validateFlow, validateAction, selectorRepair } from "../src/flow/validate.mjs";
import { runAction, codegenFlow } from "../src/flow/actions.mjs";
import { buildSelfHeal, selectScoutRoutes, writeDraft } from "../src/plan/scout.mjs";
import { saveAuthState, authStateForFlow, ensureAuth } from "../src/capture/auth.mjs";
import { Driver } from "../src/capture/driver.mjs";
import { concatFileLine } from "../src/media/encode.mjs";
import { annotateShot } from "../src/docs/annotate.mjs";
import { main } from "../src/cli.mjs";
import { renderFlow } from "../src/render/render.mjs";

function temporary(t) {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "tutorial-kit-test-"));
	t.after(() => fs.rmSync(root, { recursive: true, force: true }));
	return root;
}

const spec = () => ({
	id: "demo",
	title: "Demo",
	steps: [{ id: "open", actions: [{ kind: "goto", path: "/" }] }],
});

test("flow paths reject traversal, absolute paths, control characters and non-string IDs", (t) => {
	const root = temporary(t);
	for (const id of [
		"..",
		"../victim",
		"/tmp/victim",
		"a/b",
		"a\\b",
		"a\nfile",
		"",
		null,
		{},
		"a".repeat(81),
	]) {
		assert.throws(() => flowOutDir({ outDirAbs: root }, id));
	}
	assert.equal(flowOutDir({ outDirAbs: root }, "demo_2"), path.join(root, "demo_2"));
});

test("artifact paths reject escaping paths and symlink components", (t) => {
	const root = temporary(t);
	for (const input of ["../outside", "/outside", "..\\outside", "line\nfile", "."])
		assert.throws(() => pathInside(root, input));
	fs.symlinkSync(os.tmpdir(), path.join(root, "link"));
	assert.throws(() => pathInside(root, "link/target"), /symbolic links/);
	assert.equal(pathInside(root, "shots/step.png"), path.join(root, "shots/step.png"));
});

test("unsafe clean cannot delete a directory outside the selected output", async (t) => {
	const root = temporary(t);
	fs.mkdirSync(path.join(root, "flows"));
	const sentinel = path.join(root, "keep.txt");
	fs.writeFileSync(sentinel, "keep");
	const config = path.join(root, "tutorials.config.mjs");
	fs.writeFileSync(config, 'export default { baseUrl: "https://example.com" };');
	fs.writeFileSync(
		path.join(root, "flows", "bad.tutorial.mjs"),
		`export default ${JSON.stringify({ ...spec(), id: ".." })};`,
	);
	await assert.rejects(main(["clean", "--all", "--config", config]), /flow.id/);
	assert.equal(fs.readFileSync(sentinel, "utf8"), "keep");
});

test("configuration refuses output directories containing source and insecure remote authentication", async (t) => {
	const root = temporary(t);
	for (const [i, config] of [
		{ baseUrl: "https://example.com", outDir: "." },
		{ baseUrl: "https://example.com", outDir: "flows" },
		{ baseUrl: "http://example.com", auth: {} },
	].entries()) {
		const file = path.join(root, `config-${i}.mjs`);
		fs.writeFileSync(file, `export default ${JSON.stringify(config)};`);
		await assert.rejects(loadConfig(file));
	}
});

test("validation rejects duplicate steps, invalid actions and cross-origin navigation", () => {
	assert.throws(() => validateFlow({ ...spec(), steps: [spec().steps[0], spec().steps[0]] }), /duplicate/);
	assert.throws(() =>
		validateFlow({ ...spec(), steps: [{ id: "../escape", actions: [{ kind: "pause" }] }] }),
	);
	for (const action of [
		{ kind: "eval" },
		{ kind: "pause", seconds: Infinity },
		{ kind: "fill", target: { css: "input" }, value: {} },
		{ kind: "click", target: {} },
		{ kind: "goto", path: "https://elsewhere.example/" },
	]) {
		assert.throws(() => validateAction(action, "https://example.com"));
	}
	assert.match(codegenFlow(spec()), /export default/);
});

test("generated drafts cannot overwrite a file or use a traversal ID", async (t) => {
	const config = { baseUrl: "https://example.com", flowsDirAbs: path.join(temporary(t), "flows") };
	const file = writeDraft(spec(), config);
	const original = fs.readFileSync(file, "utf8");
	assert.throws(() => writeDraft({ ...spec(), title: "Overwrite" }, config), { code: "EEXIST" });
	assert.equal(fs.readFileSync(file, "utf8"), original);
	assert.throws(() => writeDraft({ ...spec(), id: "../escape" }, config));
	fs.writeFileSync(path.join(config.flowsDirAbs, "duplicate.tutorial.mjs"), original);
	await assert.rejects(loadFlows(config), /duplicate flow/);
});

test("scout only selects configured routes and declarative goto never starts off-origin", async () => {
	const config = { baseUrl: "https://example.com", sitemap: [{ path: "/projects" }] };
	assert.deepEqual(selectScoutRoutes(["/projects", "/projects"], config), ["/projects"]);
	assert.throws(() => selectScoutRoutes(["/delete-account"], config));
	assert.throws(() => selectScoutRoutes("/projects", config));
	let navigated = false;
	await assert.rejects(
		runAction(
			{
				baseUrl: config.baseUrl,
				goto: () => {
					navigated = true;
				},
			},
			{ kind: "goto", url: "https://elsewhere.example/" },
		),
	);
	assert.equal(navigated, false);
	assert.equal(sameOriginUrl("/projects", config.baseUrl), "https://example.com/projects");
});

test("selector repair is opt-in and preserves action behavior and privacy flags", () => {
	assert.equal(buildSelfHeal(spec(), {}), null);
	const action = { kind: "fill", target: { css: "#old" }, value: "synthetic text", noHeal: false };
	const repair = selectorRepair(action, {
		kind: "fill",
		target: { css: "#new" },
		value: "injected text",
		noHeal: true,
	});
	assert.deepEqual(repair, { ...action, target: { css: "#new" } });
	assert.equal(selectorRepair(action, { kind: "goto", path: "/delete" }), null);
	assert.equal(selectorRepair({ ...action, redact: true }, { kind: "fill", target: { css: "#new" } }), null);
	assert.equal(selectorRepair({ ...action, noHeal: true }, { kind: "fill", target: { css: "#new" } }), null);
});

test("auth state is private, replaced atomically, and excluded from unauthenticated flows", async (t) => {
	const config = { root: temporary(t), auth: {} };
	const state = { cookies: [], origins: [] };
	const context = { storageState: async () => state };
	await saveAuthState(context, config);
	const file = authStateForFlow(config, {});
	assert.deepEqual(JSON.parse(fs.readFileSync(file)), state);
	if (process.platform !== "win32") {
		assert.equal(fs.statSync(file).mode & 0o777, 0o600);
		assert.equal(fs.statSync(path.dirname(file)).mode & 0o777, 0o700);
		fs.chmodSync(file, 0o644);
		await saveAuthState(context, config);
		assert.equal(fs.statSync(file).mode & 0o777, 0o600);
	}
	assert.equal(authStateForFlow(config, { auth: false }), undefined);
	assert.equal(authStateForFlow({ ...config, auth: null }), undefined);
	assert.deepEqual(fs.readdirSync(path.dirname(file)), ["auth.json"]);
});

test("form login rejects a redirect off origin before touching credential fields", async () => {
	let fieldsRead = false;
	const page = {
		goto: async () => {},
		waitForTimeout: async () => {},
		url: () => "https://elsewhere.example/login",
		getByRole: () => {
			fieldsRead = true;
		},
	};
	await assert.rejects(ensureAuth({}, page, { auth: {}, baseUrl: "https://example.com" }), /origin/);
	assert.equal(fieldsRead, false);
});

test("provider URLs require secure transport and public URLs omit token-bearing components", () => {
	assert.throws(() => httpUrl("file:///etc/passwd"));
	assert.throws(() => httpUrl("https://user:password@example.com"));
	assert.throws(() => requireSecureTransport("http://remote.example"));
	assert.equal(requireSecureTransport("http://127.0.0.1:4000").hostname, "127.0.0.1");
	assert.equal(
		publicUrl("https://example.com/projects?token=synthetic#credential"),
		"https://example.com/projects",
	);
	assert.equal(publicUrl("data:text/plain,private"), "");
});

test("password fills redact metadata and strip URL tokens", async () => {
	const events = [];
	let typed;
	const locator = {
		getAttribute: async (name) => (name === "type" ? "password" : null),
		boundingBox: async () => ({ x: 1, y: 1, width: 100, height: 20 }),
		innerText: async () => "",
		pressSequentially: async (value) => {
			typed = value;
		},
	};
	const page = {
		locator: () => ({ first: () => locator }),
		mouse: { down: async () => {}, up: async () => {} },
		waitForTimeout: async () => {},
		url: () => "https://example.com/?token=synthetic",
	};
	const driver = new Driver({
		page,
		baseUrl: "https://example.com",
		viewport: { width: 100, height: 100 },
		onEvent: (event) => events.push(event),
	});
	driver.scrollIntoView = async () => {};
	driver.scrollY = async () => 0;
	driver.movePointer = async () => [];
	await driver.fill("#password", "private-demo-value");
	assert.equal(typed, "private-demo-value");
	assert.equal(events[0].redact, true);
	assert.equal(events[0].url, "https://example.com/");
	assert.ok(!JSON.stringify(events).includes("private-demo-value"));
});

test("FFmpeg manifests escape quotes and reject injected directives", () => {
	assert.equal(concatFileLine("/tmp/a'b/frame.jpg"), "file '/tmp/a'\\''b/frame.jpg'");
	assert.throws(() => concatFileLine("/tmp/a\nfile '/etc/passwd'"), /control characters/);
});

test("annotation rejects SVG injection before reading an image", async () => {
	await assert.rejects(
		annotateShot({
			shotPath: "missing.png",
			dsf: 2,
			outPath: "unused.jpg",
			accent: '#fff"/><image href="file:///etc/passwd"/>',
		}),
		/hex color/,
	);
});

test("render rejects timeline assets outside the composition directory before launching a browser", async (t) => {
	const root = temporary(t);
	const compose = path.join(root, "demo", "compose");
	fs.mkdirSync(compose, { recursive: true });
	fs.writeFileSync(
		path.join(compose, "timeline.json"),
		JSON.stringify({ assets: { mezzanine: "mezzanine.mp4", audio: "../../private.wav" } }),
	);
	await assert.rejects(renderFlow({ id: "demo" }, { outDirAbs: root }), /inside its directory/);
});
