// Minimal OpenAI-compatible chat client. Modern reasoning models reject temperature/top_p, so we
// simply never send them (the lesson from faceless's normalizeChatParams).
export async function chat({ system, user, model, json = true, maxTokens = 6000 }) {
	const key = process.env.OPENAI_API_KEY;
	if (!key) throw new Error("OPENAI_API_KEY not set");
	const base = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
	// json_object mode requires the literal word "json" somewhere in the messages.
	const sys = json ? `${system || ""}\nRespond with a single JSON object.` : system;
	const body = {
		model,
		messages: [...(sys ? [{ role: "system", content: sys }] : []), { role: "user", content: user }],
		max_completion_tokens: maxTokens,
		...(json ? { response_format: { type: "json_object" } } : {}),
	};
	const res = await fetch(`${base}/chat/completions`, {
		method: "POST",
		headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
		body: JSON.stringify(body),
	});
	if (!res.ok) throw new Error(`LLM ${res.status}: ${(await res.text()).slice(0, 400)}`);
	const data = await res.json();
	const text = data.choices?.[0]?.message?.content || "";
	if (!text) throw new Error("LLM returned empty content (model may need a higher token budget)");
	return json ? JSON.parse(text) : text;
}

export function scriptModel(config) {
	return config.script?.model || process.env.TUTORIAL_LLM_MODEL || "gpt-5.6-sol";
}
