import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pathInside } from "../security/paths.mjs";
import { requireSecureTransport, sameOriginUrl } from "../security/urls.mjs";

// Form login (the lazy, robust option: same approach as faceless's own e2e scripts) + storageState
// reuse. Login always happens BEFORE the screencast starts so credentials are never on tape.
export function storageStatePath(config) {
	const p = config.auth?.storageState || ".tutorial-kit/auth.json";
	return pathInside(config.root, p);
}

export function authStateForFlow(config, flow = {}) {
	if (!config.auth || flow.auth === false) return undefined;
	const file = storageStatePath(config);
	if (!fs.existsSync(file)) return undefined;
	fs.chmodSync(file, 0o600);
	return file;
}

export async function saveAuthState(context, config) {
	const file = storageStatePath(config);
	fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
	const temporary = `${file}.${crypto.randomBytes(8).toString("hex")}.tmp`;
	try {
		const state = await context.storageState();
		fs.writeFileSync(temporary, JSON.stringify(state), { mode: 0o600, flag: "wx" });
		fs.renameSync(temporary, file);
	} finally {
		fs.rmSync(temporary, { force: true });
	}
}

export async function ensureAuth(context, page, config) {
	const a = config.auth;
	if (!a) return { authenticated: false };
	requireSecureTransport(config.baseUrl, "authenticated config.baseUrl");
	const loginPath = a.loginPath || "/login";
	const loginUrl = sameOriginUrl(loginPath, config.baseUrl);
	await page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
	await page.waitForTimeout(1200);
	sameOriginUrl(page.url(), config.baseUrl);
	if (new URL(page.url()).pathname !== new URL(loginUrl).pathname) {
		return { authenticated: true, via: "storageState" };
	}
	const email = process.env[a.emailEnv || "TUTORIAL_EMAIL"];
	const password = process.env[a.passwordEnv || "TUTORIAL_PASSWORD"];
	if (!email || !password) {
		throw new Error(
			`login required: set ${a.emailEnv || "TUTORIAL_EMAIL"} and ${a.passwordEnv || "TUTORIAL_PASSWORD"}`,
		);
	}
	const loginTab = page.getByRole("button", { name: /^log ?in$/i }).first();
	if (await loginTab.count().catch(() => 0)) await loginTab.click().catch(() => {});
	sameOriginUrl(page.url(), config.baseUrl);
	const emailSel = a.emailSelector || '#email_field, input[type="email"]';
	const passSel = a.passwordSelector || '#password_field, input[type="password"]';
	await page.waitForSelector(emailSel, { timeout: 30000 });
	await page.locator(emailSel).first().fill(email);
	await page.locator(passSel).first().fill(password);
	await page
		.locator(a.submitSelector || 'form button[type="submit"]')
		.first()
		.click();
	await page.waitForURL((u) => u.pathname !== new URL(loginUrl).pathname, { timeout: 90000 });
	sameOriginUrl(page.url(), config.baseUrl);
	await saveAuthState(context, config);
	return { authenticated: true, via: "form" };
}
