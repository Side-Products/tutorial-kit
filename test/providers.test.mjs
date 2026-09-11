import test from "node:test";
import assert from "node:assert/strict";
import { chat } from "../src/llm/client.mjs";
import { elevenLabsFetch } from "../src/voice/elevenLabsRequest.mjs";

function env(t, key, value) {
	const original = process.env[key];
	process.env[key] = value;
	t.after(() => {
		if (original === undefined) delete process.env[key];
		else process.env[key] = original;
	});
}

test("LLM transport rejects redirects and never echoes provider error bodies", async (t) => {
	env(t, "OPENAI_API_KEY", "synthetic-test-key");
	env(t, "OPENAI_BASE_URL", "https://provider.example/v1");
	let request;
	t.mock.method(globalThis, "fetch", async (url, init) => {
		request = { url, init };
		return new Response("private provider response", { status: 401 });
	});
	await assert.rejects(
		chat({ user: "hello", model: "test" }),
		(error) => error.message.includes("401") && !error.message.includes("private provider"),
	);
	assert.equal(request.init.redirect, "error");
	assert.ok(request.init.signal instanceof AbortSignal);
	assert.equal(request.url, "https://provider.example/v1/chat/completions");
});

test("LLM never sends credentials to an insecure remote endpoint", async (t) => {
	env(t, "OPENAI_API_KEY", "synthetic-test-key");
	env(t, "OPENAI_BASE_URL", "http://provider.example/v1");
	const fetch = t.mock.method(globalThis, "fetch", async () => {
		throw new Error("should not fetch");
	});
	await assert.rejects(chat({ user: "hello", model: "test" }), /HTTPS/);
	assert.equal(fetch.mock.callCount(), 0);
});

test("ElevenLabs credentials stay at the expected origin and redirects are disabled", async (t) => {
	let request;
	t.mock.method(globalThis, "fetch", async (url, init) => {
		request = { url, init };
		return new Response("private provider response", { status: 401 });
	});
	await assert.rejects(elevenLabsFetch("https://elsewhere.example/", {}), /must use/);
	assert.equal(request, undefined);
	await assert.rejects(
		elevenLabsFetch("https://api.elevenlabs.io/v1/test", {}),
		(error) => error.message.includes("401") && !error.message.includes("private provider"),
	);
	assert.equal(request.init.redirect, "error");
});
