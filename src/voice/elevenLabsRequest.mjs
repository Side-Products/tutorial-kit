// Vendored (simplified) from faceless tts/elevenLabsRequest.js: FIFO concurrency gate + retry on
// retriable statuses honoring Retry-After. Same env var names so existing keys just work.
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
	await acquire();
	try {
		for (let attempt = 0; ; attempt++) {
			const res = await fetch(url, init);
			if (res.ok) return res;
			const retriable = res.status === 408 || res.status === 425 || res.status === 429 || res.status >= 500;
			const bodyText = await res.text().catch(() => "");
			if (!retriable || attempt >= MAX_RETRIES) {
				throw new Error(`${label} failed: ${res.status} ${bodyText.slice(0, 300)}`);
			}
			const retryAfter = Number(res.headers.get("retry-after"));
			const waitSec = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : Math.min(30, 2 ** attempt);
			await new Promise((r) => setTimeout(r, waitSec * 1000));
		}
	} finally {
		release();
	}
}
