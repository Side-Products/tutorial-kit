import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { assertIdentifier, pathInside } from "./security/paths.mjs";
import { httpUrl, requireSecureTransport } from "./security/urls.mjs";

const DEFAULTS = {
	viewport: { width: 1920, height: 1080, dsf: 2 },
	flowsDir: "flows",
	outDir: "out",
	// Installed Chrome has H.264/AAC; Playwright's bundled Chromium does not (page MP4s go black).
	browserChannel: "chrome",
	auth: null,
	selfHeal: false,
	brand: { name: "Product", colors: { bg: "#0b0b10", accent: "#8B5CF6", text: "#ffffff" } },
};

// Load KEY=VALUE lines from a .env beside the config file (never overrides real env vars).
function loadEnvFile(dir) {
	const p = path.join(dir, ".env");
	if (!fs.existsSync(p)) return;
	for (const line of fs.readFileSync(p, "utf8").split("\n")) {
		const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
		if (!m || line.trim().startsWith("#")) continue;
		const value = m[2].replace(/^["']|["']$/g, "");
		if (value && !(m[1] in process.env)) process.env[m[1]] = value;
	}
}

export async function loadConfig(configPath) {
	const p = path.resolve(configPath || "tutorials.config.mjs");
	if (!fs.existsSync(p)) throw new Error(`config not found: ${p} (pass --config <path>)`);
	loadEnvFile(path.dirname(p));
	const mod = await import(pathToFileURL(p).href);
	const c = mod.default || {};
	if (!c.baseUrl) throw new Error(`config.baseUrl is required in ${p}`);
	httpUrl(c.baseUrl, "config.baseUrl");
	if (c.auth) requireSecureTransport(c.baseUrl, "authenticated config.baseUrl");
	const merged = { ...DEFAULTS, ...c, viewport: { ...DEFAULTS.viewport, ...(c.viewport || {}) } };
	merged.configPath = p;
	merged.root = path.dirname(p);
	merged.flowsDirAbs = path.resolve(merged.root, merged.flowsDir);
	merged.outDirAbs = path.resolve(merged.root, merged.outDir);
	for (const protectedDir of [merged.root, merged.flowsDirAbs]) {
		const rel = path.relative(merged.outDirAbs, protectedDir);
		if (!rel || (!rel.startsWith(`..${path.sep}`) && rel !== ".." && !path.isAbsolute(rel))) {
			throw new Error("config.outDir must not contain the config or flows directory");
		}
	}
	merged.canonicalHost = merged.canonicalHost || new URL(merged.baseUrl).host;
	return merged;
}

export function flowOutDir(config, flowId) {
	return pathInside(config.outDirAbs, assertIdentifier(flowId, "flow.id"));
}
