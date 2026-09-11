// Vendored (simplified) from faceless tts/elevenLabsRequest.js: FIFO concurrency gate + retry on
// retriable statuses honoring Retry-After. Same env var names so existing keys just work.
import { httpUrl } from "../security/urls.mjs";

const MAX_CONCURRENCY = Math.max(1, Number(process.env.ELEVENLABS_MAX_CONCURRENCY) || 4);
const MAX_RETRIES = Math.max(0, Number(process.env.ELEVENLABS_MAX_RETRIES) || 4);

let active = 0;
const waiters = [];

function acquire() {
	if (active < MAX_CONCURRENCY) {
		active++;
		return Promise.resolve();
	}
	return new Promise((resolve) => waiters.push(resolve));
}

function release() {
	const next = waiters.shift();
	if (next) next();
	else active--;
}

export async function elevenLabsFetch(url, init, { label = "elevenlabs" } = {}) {
	if (httpUrl(url).origin !== "https://api.elevenlabs.io")
		throw new Error("ElevenLabs requests must use https://api.elevenlabs.io");
	await acquire();
	try {
		for (let attempt = 0; ; attempt++) {
			const res = await fetch(url, {
				...init,
				redirect: "error",
				signal: init?.signal || AbortSignal.timeout(120000),
			});
			if (res.ok) return res;
			const retriable = res.status === 408 || res.status === 425 || res.status === 429 || res.status >= 500;
			await res.body?.cancel();
			if (!retriable || attempt >= MAX_RETRIES) {
				throw new Error(
					`${label} failed (HTTP ${res.status}); check your provider account and voice settings`,
				);
			}
			const retryAfter = Number(res.headers.get("retry-after"));
			const waitSec =
				Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(60, retryAfter) : Math.min(30, 2 ** attempt);
			await new Promise((r) => setTimeout(r, waitSec * 1000));
		}
	} finally {
		release();
	}
}
