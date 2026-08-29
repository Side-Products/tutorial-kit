import fs from "node:fs";
import path from "node:path";

// Form login (the lazy, robust option: same approach as faceless's own e2e scripts) + storageState
// reuse. Login always happens BEFORE the screencast starts so credentials are never on tape.
export function storageStatePath(config) {
	const p = config.auth?.storageState || ".tutorial-kit/auth.json";
	return path.resolve(config.root, p);
}

export async function ensureAuth(context, page, config) {
	const a = config.auth;
	if (!a) return { authenticated: false };
	const loginPath = a.loginPath || "/login";
	await page.goto(config.baseUrl + loginPath, { waitUntil: "domcontentloaded", timeout: 60000 });
	await page.waitForTimeout(1200);
	if (!page.url().includes(loginPath)) {
		return { authenticated: true, via: "storageState" };
	}
	const email = process.env[a.emailEnv || "TUTORIAL_EMAIL"];
	const password = process.env[a.passwordEnv || "TUTORIAL_PASSWORD"];
	if (!email || !password) {
		throw new Error(`login required: set ${a.emailEnv || "TUTORIAL_EMAIL"} and ${a.passwordEnv || "TUTORIAL_PASSWORD"}`);
	}
	const loginTab = page.getByRole("button", { name: /^log ?in$/i }).first();
	if (await loginTab.count().catch(() => 0)) await loginTab.click().catch(() => {});
	const emailSel = a.emailSelector || '#email_field, input[type="email"]';
	const passSel = a.passwordSelector || '#password_field, input[type="password"]';
	await page.waitForSelector(emailSel, { timeout: 30000 });
	await page.locator(emailSel).first().fill(email);
	await page.locator(passSel).first().fill(password);
	await page.locator(a.submitSelector || 'form button[type="submit"]').first().click();
	await page.waitForURL((u) => !u.pathname.includes(loginPath), { timeout: 90000 });
	const statePath = storageStatePath(config);
	fs.mkdirSync(path.dirname(statePath), { recursive: true });
	await context.storageState({ path: statePath });
	return { authenticated: true, via: "form" };
}
