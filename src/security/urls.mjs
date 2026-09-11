export function httpUrl(value, label = "URL") {
	let url;
	try {
		url = new URL(value);
	} catch {
		throw new Error(`${label} must be a valid HTTP(S) URL`);
	}
	if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
		throw new Error(`${label} must use HTTP(S) and must not contain credentials`);
	}
	return url;
}

export function sameOriginUrl(value, baseUrl) {
	if (typeof value !== "string" || !value.trim()) throw new Error("navigation needs a URL or path");
	const base = httpUrl(baseUrl);
	const url = httpUrl(new URL(value, `${base.href.replace(/\/$/, "")}/`).href);
	if (url.origin !== base.origin)
		throw new Error("declarative navigation must stay on config.baseUrl's origin");
	return url.href;
}

export function requireSecureTransport(value, label = "URL") {
	const url = httpUrl(value, label);
	if (url.protocol !== "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
		throw new Error(`${label} must use HTTPS (HTTP is allowed only on loopback for local development)`);
	}
	return url;
}

// Queries, fragments and userinfo frequently carry tokens. Keep only the location for artifacts.
export function publicUrl(value) {
	try {
		const url = httpUrl(value);
		url.search = "";
		url.hash = "";
		return url.href;
	} catch {
		return value === "about:blank" ? value : "";
	}
}
