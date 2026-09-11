import fs from "node:fs";
import path from "node:path";
import { run, probeDuration, concatFileLine } from "./encode.mjs";
import { assertIdentifier, pathInside } from "../security/paths.mjs";

// Narration placement doctrine (vendored from faceless longform/voice.js): decode every block to
// uniform PCM, size explicit silence between them, and concat: the concat file IS the clock.
// Then the faceless longform/audio.js mix chain: looped music bed, sidechain duck, loudnorm.

export async function buildNarrationTrack({ voiceDir, blocks, placements, totalSec, workDir, outPath }) {
	fs.mkdirSync(workDir, { recursive: true });
	const entries = [];
	let clock = 0;
	const ordered = [...placements].sort((a, b) => a.startSec - b.startSec);
	for (let i = 0; i < ordered.length; i++) {
		const p = ordered[i];
		const block = blocks.find((b) => b.blockId === p.blockId);
		if (!block) continue;
		const gap = p.startSec - clock;
		if (gap > 0.005) {
			const sil = path.join(workDir, `sil-${i}.wav`);
			await run([
				"-y",
				"-f",
				"lavfi",
				"-i",
				`anullsrc=r=44100:cl=mono`,
				"-t",
				gap.toFixed(3),
				"-c:a",
				"pcm_s16le",
				sil,
			]);
			entries.push(sil);
			clock += gap;
		}
		if (block.blockId.startsWith("step:")) assertIdentifier(block.blockId.slice(5), "audio step id");
		else if (!["intro", "outro"].includes(block.blockId)) throw new Error("invalid audio block id");
		const wav = pathInside(workDir, `${block.blockId.replace(":", "-")}.wav`);
		await run([
			"-y",
			"-i",
			pathInside(voiceDir, block.audioFile),
			"-ar",
			"44100",
			"-ac",
			"1",
			"-c:a",
			"pcm_s16le",
			wav,
		]);
		entries.push(wav);
		clock += block.durationSec;
	}
	const tail = totalSec - clock;
	if (tail > 0.005) {
		const sil = path.join(workDir, "sil-tail.wav");
		await run([
			"-y",
			"-f",
			"lavfi",
			"-i",
			`anullsrc=r=44100:cl=mono`,
			"-t",
			tail.toFixed(3),
			"-c:a",
			"pcm_s16le",
			sil,
		]);
		entries.push(sil);
	}
	const listPath = path.join(workDir, "concat.txt");
	fs.writeFileSync(listPath, entries.map(concatFileLine).join("\n"));
	await run([
		"-y",
		"-f",
		"concat",
		"-safe",
		"0",
		"-protocol_whitelist",
		"file",
		"-i",
		listPath,
		"-ar",
		"44100",
		"-ac",
		"1",
		"-c:a",
		"pcm_s16le",
		outPath,
	]);
	return outPath;
}

export async function mixAudio({ narrationWav, music, outPath }) {
	const voiceLufs = -16;
	const truePeakDb = -1.5;
	if (!music?.track || !fs.existsSync(music.track)) {
		if (music?.track) console.warn(`music track not found, mixing voice only: ${music.track}`);
		await run([
			"-y",
			"-i",
			narrationWav,
			"-af",
			`loudnorm=I=${voiceLufs}:TP=${truePeakDb}:LRA=11`,
			"-ar",
			"44100",
			"-ac",
			"2",
			"-c:a",
			"pcm_s16le",
			outPath,
		]);
		return outPath;
	}
	const musicDb = music.gainDb ?? -23;
	if (!Number.isFinite(musicDb)) throw new Error("music.gainDb must be a finite number");
	const dur = await probeDuration(narrationWav);
	const filter = [
		`[0:a]aformat=channel_layouts=mono,asplit=2[v][vkey]`,
		`[1:a]aloop=loop=-1:size=2e9,atrim=0:${dur.toFixed(2)},volume=${musicDb}dB,afade=t=out:st=${Math.max(0, dur - 2.5).toFixed(2)}:d=2.5[bed]`,
		`[bed][vkey]sidechaincompress=threshold=0.03:ratio=6:attack=40:release=900:makeup=1[ducked]`,
		`[v][ducked]amix=inputs=2:duration=first:dropout_transition=2,volume=2[mix]`,
		`[mix]loudnorm=I=${voiceLufs}:TP=${truePeakDb}:LRA=11[out]`,
	].join(";");
	await run([
		"-y",
		"-i",
		narrationWav,
		"-i",
		music.track,
		"-filter_complex",
		filter,
		"-map",
		"[out]",
		"-ar",
		"44100",
		"-ac",
		"2",
		"-c:a",
		"pcm_s16le",
		outPath,
	]);
	return outPath;
}
