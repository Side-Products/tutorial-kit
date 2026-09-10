# tutorial-kit

Automated product tutorial pipeline (a self-hosted Clueso): define a flow as code or plain English,
get back a studio-grade tutorial video AND agent-readable docs, fully automated.

```
plan (English -> flow file, AI scout)
  -> record  (Playwright drives the real app; CDP screencast captures true 4K frames + a
              ground-truth event log: selectors, bboxes, pointer paths, timestamps)
  -> script  (LLM narration -> editable script.md, copy rules enforced)
  -> voice   (ElevenLabs with word timestamps, per-block cache)
  -> compose (timeline solver: idle-gap retiming, auto zoom clusters, synthetic cursor,
              freeze math, ducked + loudness-normalized audio mix)
  -> render  (local Remotion: proof 1080p / final 4K + 1080p)
  -> docs    (guide.md with annotated screenshots, tutorial.json for AI agents,
              captions.vtt, YouTube chapters, publish snippets)
```

See [docs/pipeline.md](docs/pipeline.md) for how each stage works, what a rebuild costs, and
which `--force` level a given change needs.

## Setup

```bash
npm install
npx playwright install chromium
```

Env: `OPENAI_API_KEY` (script + scout), `ELEVENLABS_API_KEY` (voice), optional `OPENAI_BASE_URL`,
`TUTORIAL_LLM_MODEL`, `RENDER_CONCURRENCY`.

## Product setup

A product repo keeps a `tutorials/` directory with `tutorials.config.mjs` (baseUrl, auth env vars,
brand colors, voice, music, sitemap for the scout) and `flows/*.tutorial.mjs`. Copy
`templates/tutorials.config.example.mjs` to start.

## Commands

```bash
tutorial-kit plan "how do I buy credits" [--yes]   # match existing flow or scout + draft a new one
tutorial-kit build [flow...] [--final] [--force <stage>]
tutorial-kit record|script|voice|compose|render|docs [flow...]
tutorial-kit check          # headless drift detection, nonzero exit on failure (nightly CI)
tutorial-kit clean [--all]  # drop captured frames (or the whole out dir)
```

Flow references accept exact ids or plain English. All stages cache by content hash; `build` re-runs
only what changed. `script.md` is human-editable: tweak a sentence, re-`build`, and only that voice
block re-synthesizes.

## Flow files

Hand-written (full Playwright via the `t` driver: humanized cursor, event logging, redaction):

```js
export default {
	id: "buy-credits",
	title: "Buy credits",
	goal: "Top up your balance",
	steps: [
		{ id: "open", say: "Open billing", run: async (t) => { await t.goto("/billing?tab=credits"); await t.pause(1.5); } },
		{ id: "pick", say: "Pick a pack", run: async (t) => { await t.click(t.page.getByRole("button", { name: /buy/i })); } },
	],
	setup: async ({ config, page }) => {}, // optional API fixtures
	teardown: async ({ config, page }) => {},
};
```

Declarative (what `plan` generates; self-healing: a failed target is repaired by the LLM against a
live accessibility snapshot and the file is rewritten):

```js
export default {
	id: "buy-credits",
	title: "Buy credits",
	steps: [{ id: "open", say: "Open billing", actions: [{ kind: "goto", path: "/billing?tab=credits" }] }],
};
```

## Capture notes (hard-won)

- 4K frames come from `--window-size=1920,1080 --force-device-scale-factor=2` with `viewport: null`.
  Playwright's own deviceScaleFactor emulation does NOT scale the screencast surface.
- Screencast frames are damage-driven and each carries an epoch timestamp: the event log aligns to
  ~1ms with no sync markers.
- Real pointer moves along eased paths (real hover states fire); the OS cursor is hidden and the
  composition replays the exact waypoints as a synthetic cursor.
