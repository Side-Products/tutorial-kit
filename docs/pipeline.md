# How a tutorial video gets made

Six stages run in order. Each caches its own outputs against a hash of its inputs, so a rebuild
only redoes the stages whose inputs actually changed.

```
plan -> record -> script -> voice -> compose -> render -> docs
```

`plan` runs once per tutorial; the other six run on every build.

## 1. Plan (new tutorials only)

- You describe the tutorial in plain English: `plan "create a video from a prompt" --yes`.
- An LLM scout visits the routes listed under `sitemap` in `tutorials.config.mjs` to see what the
  screens actually contain.
- It writes a flow file to `flows/<id>.tutorial.mjs`: a list of steps, each with a `say` hint and
  declarative actions (`goto`, `click`, `fill`, `scroll`, `waitFor`, `waitLong`, `pause`).
- Declarative actions are what make flows self-healing and re-recordable. Hand-written flows can
  drop to raw Playwright via `step.run` instead.

## 2. Record — `src/capture/`

- Playwright signs in as the demo account and drives the **real production app** at 4K, capturing
  frames over CDP screencast.
- Motion is synthesized to look human: the cursor eases between targets and scrolling glides
  (accelerate, cruise, settle) rather than stepping.
- Alongside the frames it writes `capture/events.json` — the ground truth for everything
  downstream: per-action timestamps, element bounding boxes, pointer paths, and the URL after each
  step.
- **Self-heal:** when a selector no longer matches, an LLM proposes a replacement, the action is
  retried, and the flow file is rewritten. Mark an action `"noHeal": true` when a timeout means
  "the product is slow or stuck" rather than "the selector drifted" — otherwise healing picks a
  plausible wrong element and silently corrupts the flow.

## 3. Script — `src/script/generate.mjs`

- An LLM turns the event log into narration: one block per step, plus an intro and an outro.
- Each step gets a word budget derived from its real on-screen duration, so narration cannot
  outrun the picture. Intro and outro are capped tighter still, because they play over title
  cards with no action to watch.
- Copy rules are enforced in the prompt: second person, present tense, no hype, no em dashes.
- Output is `script/script.md`. Edit it by hand and rebuild — only the blocks you touched are
  re-synthesized.

## 4. Voice — `src/voice/`

- ElevenLabs synthesizes each block and returns **per-word timestamps**.
- Those timestamps become the caption timings, so captions are frame-accurate for free.
- Cached per block, keyed on text plus voice settings.

## 5. Compose — `src/timeline/solve.mjs` and `src/compose/`

The solver turns raw capture plus audio into `compose/timeline.json`, deciding:

- **Retiming** — idle gaps are compressed; `waitLong` windows (renders, uploads) collapse into a
  couple of seconds of timelapse. A step lasts `max(its footage, its narration)`, so audio and
  picture can never drift apart.
- **Zoom** — consecutive clicks near each other form one cluster; the zoom scale is chosen by how
  small the target is (smaller target, tighter push).
- **Cursor** — a synthetic pointer is drawn along the recorded path, parked where it last was on
  steps with no movement.
- **Card spill** — intro narration starts on the title card and finishes over the first step;
  the sign-off starts over the tail of the last step. That keeps both cards short without cutting
  the voiceover.
- Video is assembled into a mezzanine file, and narration is mixed with background music
  (ducked and loudness-normalized).

## 6. Render and docs — `src/render/`, `src/docs/`

- Remotion (`src/remotion/`) draws browser chrome, zoom, cursor, captions, and title cards over
  the footage. `Tutorial.jsx` is the composition root; `Cards.jsx` is intro/outro; `StepScene.jsx`
  is the browser frame; `Captions.jsx` is the subtitles.
- Proof mode renders at half resolution for quick review. `--final` renders 4K plus a 1080p
  downscale.
- The docs stage emits `guide.md` (annotated screenshots), `tutorial.json` (agent-executable),
  `captions.vtt`, `chapters.txt`, and `publish-snippets.md`.

## Commands

```bash
cd faceless/tutorials

node ../../tutorial-kit/bin/tutorial-kit.js plan "..." --yes   # draft + record a new flow
node ../../tutorial-kit/bin/tutorial-kit.js build <flowId>     # proof build
node ../../tutorial-kit/bin/tutorial-kit.js build <flowId> --final   # 4K + 1080p delivery
node ../../tutorial-kit/bin/tutorial-kit.js check              # headless, no recording
```

- Flow references accept plain English: `build the billing tutorial`.
- `--force <stage>` re-runs from that stage down (`record`, `script`, `voice`, `compose`,
  `render`, `docs`).
- `check` runs every flow headless with no recording and exits nonzero on UI drift. **Run it after
  any selector change** — it costs seconds, where a bad selector costs a full re-recording.

## What a rebuild actually costs

Pick the cheapest `--force` level that covers your change:

| You changed | Force from | Re-records? |
| --- | --- | --- |
| Remotion components, colours, captions | `render` | no |
| Zoom, pacing, timeline logic | `compose` | no |
| Narration copy or prompt, voice model | `script` | no |
| The flow file itself | `record` | yes |

Recording the agent tutorial queues a **real video generation** on production: it spends credits
and the render takes about 12 minutes (occasionally it stalls). Everything downstream of `record`
is free and fast by comparison.
