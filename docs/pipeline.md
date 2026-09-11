# How a tutorial video gets made

Six stages run in order. Each caches its own outputs against a hash of its inputs, so a rebuild only redoes
the stages whose inputs actually changed.

```
plan -> record -> script -> voice -> compose -> render -> docs
```

`plan` runs once per tutorial; the other six run on every build.

## 1. Plan (new tutorials only)

- You describe the tutorial in plain English: `plan "create a video from a prompt" --yes`.
- An LLM scout visits the routes listed under `sitemap` in `tutorials.config.mjs` to see what the screens
  actually contain.
- It writes a flow file to `flows/<id>.tutorial.mjs`: a list of steps, each with a `say` hint and declarative
  actions (`goto`, `click`, `fill`, `scroll`, `waitFor`, `waitLong`, `pause`).
- Declarative actions make flows re-recordable and support optional selector repair. Hand-written flows can
  drop to raw Playwright via `step.run` instead.

## 2. Record — `src/capture/`

- Playwright optionally signs in as the demo account and drives the configured app at 4K, capturing frames
  over CDP screencast.
- Motion is synthesized to look human: the cursor eases between targets and scrolling glides (accelerate,
  cruise, settle) rather than stepping.
- Alongside the frames it writes `capture/events.json` — the ground truth for everything downstream:
  per-action timestamps, element bounding boxes, pointer paths, and the URL after each step.
- **Optional self-heal:** with `selfHeal: true`, when a selector no longer matches, an LLM proposes a
  replacement target, the same action is retried, and the flow file is rewritten. Mark an action
  `"noHeal": true` when a timeout means "the product is slow or stuck" rather than "the selector drifted" —
  otherwise healing picks a plausible wrong element and silently corrupts the flow.

## 3. Script — `src/script/generate.mjs`

- An LLM turns the event log into narration: one block per step, plus an intro and an outro.
- Each step gets a word budget derived from its real on-screen duration, so narration cannot outrun the
  picture. Intro and outro are capped tighter still, because they play over title cards with no action to
  watch.
- Copy rules are enforced in the prompt: second person, present tense, no hype, no em dashes.
- Output is `script/script.md`. Edit it by hand and rebuild — only the blocks you touched are re-synthesized.

## 4. Voice — `src/voice/`

- ElevenLabs synthesizes each block and returns **per-word timestamps**.
- Those timestamps become the caption timings, so captions are frame-accurate for free.
- Cached per block, keyed on text plus voice settings.

## 5. Compose — `src/timeline/solve.mjs` and `src/compose/`

The solver turns raw capture plus audio into `compose/timeline.json`, deciding:

- **Retiming** — idle gaps are compressed; `waitLong` windows (renders, uploads) collapse into a couple of
  seconds of timelapse. A step lasts `max(its footage, its narration)`, so audio and picture can never drift
  apart.
- **Zoom** — consecutive clicks near each other form one cluster; the zoom scale is chosen by how small the
  target is (smaller target, tighter push).
- **Cursor** — a synthetic pointer is drawn along the recorded path, parked where it last was on steps with no
  movement.
- **Card spill** — intro narration starts on the title card and finishes over the first step; the sign-off
  starts over the tail of the last step. That keeps both cards short without cutting the voiceover.
- Video is assembled into a mezzanine file, and narration is mixed with background music (ducked and
  loudness-normalized).

## 6. Render and docs — `src/render/`, `src/docs/`

- Remotion (`src/remotion/`) draws browser chrome, zoom, cursor, captions, and title cards over the footage.
  `Tutorial.jsx` is the composition root; `Cards.jsx` is intro/outro; `StepScene.jsx` is the browser frame;
  `Captions.jsx` is the subtitles.
- Proof mode renders at half resolution for quick review. `--final` renders 4K plus a 1080p downscale.
- The docs stage emits `guide.md` (annotated screenshots), `tutorial.json` (agent-executable), `captions.vtt`,
  `chapters.txt`, and `publish-snippets.md`.

### Export for a caption editor

After a normal build, `render <flowId> --no-captions` produces `render/proof-no-captions.mp4`. Add `--final`
for `final-4k-no-captions.mp4` and `final-1080p-no-captions.mp4`. These copies retain narration, title cards,
cursor motion, and zooms, and leave the standard renders and caption timings intact.

This option applies to the standalone `render` command. It does not change the cached `build` pipeline. The
[Faceless workflow](faceless.md) explains how to add and edit captions in a hosted editor. Until the next npm
release, use the source checkout for `--no-captions`.

## Commands

```bash
cd tutorials

node /path/to/tutorials-kit/bin/tutorial-kit.js plan "..." --yes   # draft + record a new flow
node /path/to/tutorials-kit/bin/tutorial-kit.js build <flowId>     # proof build
node /path/to/tutorials-kit/bin/tutorial-kit.js build <flowId> --final   # 4K + 1080p delivery
node /path/to/tutorials-kit/bin/tutorial-kit.js check              # headless, no recording
```

- Flow references accept plain English: `build the billing tutorial`.
- `--force <stage>` re-runs from that stage down (`record`, `script`, `voice`, `compose`, `render`, `docs`).
- `check` runs every flow headless with no recording and exits nonzero on UI drift. **Run it after any
  selector change** — it costs seconds, where a bad selector costs a full re-recording.

## What a rebuild actually costs

Pick the cheapest `--force` level that covers your change:

| You changed                            | Force from | Re-records? |
| -------------------------------------- | ---------- | ----------- |
| Remotion components, colours, captions | `render`   | no          |
| Zoom, pacing, timeline logic           | `compose`  | no          |
| Narration copy or prompt, voice model  | `script`   | no          |
| The flow file itself                   | `record`   | yes         |

Recording and drift checks perform the actions defined by your flow, which can mutate data or spend credits.
Use a demo account. Planning and script generation can incur LLM charges; voice synthesis can incur ElevenLabs
charges. Composition, rendering, and documentation run locally. Remotion licensing terms still apply.

Standalone stage commands do not write the stage cache keys used by `build`. Switching from standalone
commands to `build` can repeat work. When using `build`, manual edits to `script.md` survive while upstream
inputs stay unchanged. Script regeneration creates a `.bak` copy.

Cache keys cover selected stage inputs, not every configuration field or source change. Force from `record`
after authentication, browser, viewport, or capture-code changes; force from the affected stage after other
pipeline code changes. Never depend on a cached production recording being safe to publish without review.
