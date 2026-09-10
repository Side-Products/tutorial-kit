import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { elevenLabsFetch } from "./elevenLabsRequest.mjs";
import { probeDuration } from "../media/encode.mjs";
import { parseScriptMd } from "../script/generate.mjs";
import { flowOutDir } from "../config.mjs";

// Fold character alignment into word spans (vendored from faceless longform/voice.js).
export function wordsFromAlignment(alignment) {
	const chars = alignment?.characters || [];
	const starts = alignment?.character_start_times_seconds || [];
	const ends = alignment?.character_end_times_seconds || [];
	if (!chars.length || chars.length !== starts.length) return null;
	const out = [];
	let cur = null;
	for (let i = 0; i < chars.length; i++) {
		const ch = String(chars[i] || "");
		if (/^\s*$/.test(ch)) {
			if (cur) out.push(cur);
			cur = null;
			continue;
		}
		if (!cur) cur = { word: ch, start: Number(starts[i]) || 0, end: Number(ends[i] ?? starts[i]) || 0 };
		else {
			cur.word += ch;
			cur.end = Number(ends[i] ?? starts[i]) || cur.end;
		}
	}
	if (cur) out.push(cur);
	return out?.length ? out : null;
}

const SUPPORTS_CONTEXT = (model) => !/^eleven_v3/.test(model);

export function applyPronunciations(text, pronunciations) {
	if (!pronunciations) return text;
	let t = text;
	for (const [display, spoken] of Object.entries(pronunciations)) {
		t = t.replaceAll(display, spoken);
	}
	return t;
}

export async function synthesizeBlock({ text, voice, previousText, nextText }) {
	const model = voice.model || "eleven_turbo_v2_5";
	const isV3 = /^eleven_v3/.test(model);
	const defaults = isV3
		? { stability: 0.5 }
		: { stability: 0.5, similarity_boost: 0.8, style: 0.2, use_speaker_boost: true };
	const settings = { ...defaults, ...(voice.settings || {}) };
	if (isV3) delete settings.use_speaker_boost;
	if (voice.speed && voice.speed !== 1) settings.speed = Math.max(0.7, Math.min(1.2, voice.speed));
	const body = { text, model_id: model, voice_settings: settings };
	if (previousText && SUPPORTS_CONTEXT(model)) body.previous_text = previousText;
	if (nextText && SUPPORTS_CONTEXT(model)) body.next_text = nextText;
	const res = await elevenLabsFetch(
		`https://api.elevenlabs.io/v1/text-to-speech/${voice.id}/with-timestamps?output_format=mp3_44100_128`,
		{
			method: "POST",
			headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY, "content-type": "application/json" },
			body: JSON.stringify(body),
		},
		{ label: `tts:${voice.id.slice(0, 6)}` }
	);
	const data = await res.json();
	const mp3 = Buffer.from(data.audio_base64, "base64");
	const words = wordsFromAlignment(data.normalized_alignment || data.alignment);
	if (!words) throw new Error("no alignment returned from ElevenLabs");
	return { mp3, words };
}

export async function runVoice(flow, config) {
	if (!process.env.ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY not set");
	const voice = config.voice;
	if (!voice?.id) throw new Error("config.voice.id is required (an ElevenLabs voice id)");
	const outDir = flowOutDir(config, flow.id);
	const scriptPath = path.join(outDir, "script", "script.md");
	if (!fs.existsSync(scriptPath)) throw new Error(`no script for ${flow.id}: run script first`);
	const { blocks } = parseScriptMd(scriptPath);
	const voiceDir = path.join(outDir, "voice");
	const blocksDir = path.join(voiceDir, "blocks");
	fs.mkdirSync(blocksDir, { recursive: true });

	const wordsPath = path.join(voiceDir, "words.json");
	const prev = fs.existsSync(wordsPath) ? JSON.parse(fs.readFileSync(wordsPath)).blocks || [] : [];
	const voiceKey = JSON.stringify({ id: voice.id, model: voice.model, settings: voice.settings, speed: voice.speed, pron: config.voice.pronunciations || null });

	const results = [];
	for (let i = 0; i < blocks.length; i++) {
		const b = blocks[i];
		const spokenText = applyPronunciations(b.text, config.voice.pronunciations);
		const textHash = crypto.createHash("sha256").update(spokenText + voiceKey).digest("hex").slice(0, 16);
		const audioFile = `blocks/${b.blockId.replace(":", "-")}.mp3`;
		const audioAbs = path.join(voiceDir, audioFile);
		const cached = prev.find((p) => p.blockId === b.blockId && p.textHash === textHash);
		if (cached && fs.existsSync(audioAbs)) {
			results.push(cached);
			console.log(`voice ${b.blockId}: cached`);
			continue;
		}
		const { mp3, words } = await synthesizeBlock({
			text: spokenText,
			voice,
			previousText: blocks[i - 1]?.text || null,
			nextText: blocks[i + 1]?.text || null,
		});
		fs.writeFileSync(audioAbs, mp3);
		const durationSec = await probeDuration(audioAbs);
		results.push({ blockId: b.blockId, text: b.text, textHash, audioFile, durationSec, words });
		console.log(`voice ${b.blockId}: ${durationSec.toFixed(1)}s, ${words.length} words`);
	}
	fs.writeFileSync(wordsPath, JSON.stringify({ voice: { id: voice.id, model: voice.model }, blocks: results }, null, 1));
	console.log(`voice: ${wordsPath}`);
	return wordsPath;
}
