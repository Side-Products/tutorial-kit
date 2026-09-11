<h1>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/Side-Products/tutorials-kit/master/docs/assets/tutorials-kit-logo-dark.png">
    <img src="https://raw.githubusercontent.com/Side-Products/tutorials-kit/master/docs/assets/tutorials-kit-logo-light.png" alt="Tutorials Kit" width="520">
  </picture>
</h1>

**Turn a browser workflow into a narrated video and a written guide.**

[![CI](https://github.com/Side-Products/tutorials-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/Side-Products/tutorials-kit/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/tutorials-kit.svg)](https://www.npmjs.com/package/tutorials-kit)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js: 22+](https://img.shields.io/badge/node.js-22%2B-339933.svg)](package.json)

![A browser workflow becoming a narrated tutorial video and an annotated written guide.](https://raw.githubusercontent.com/Side-Products/tutorials-kit/master/docs/assets/tutorial-kit-banner.webp)

Define the steps once. Tutorials Kit drives your app with Playwright, records the screen and interaction
timings, generates editable narration, and renders a video with Remotion. The same recording produces
annotated screenshots, captions, and a structured guide that other tools can read.

[Install](#install-from-npm) · [Quick start](#quick-start) · [Configuration](docs/configuration.md) ·
[Pipeline](docs/pipeline.md) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md)

## What you get

- **Repeatable recordings.** Write flows in JavaScript or draft declarative steps from a plain-English
  request.
- **Local video rendering.** 1080p proofs and 4K finals with cursor motion, automatic zooms, title cards, and
  captions.
- **Editable narration.** Review `script.md` before synthesizing speech with ElevenLabs.
- **Incremental builds.** Reuse captured footage and cached voice blocks as you refine a tutorial.
- **Documentation from the same source.** A Markdown guide, annotated screenshots, `tutorial.json`, WebVTT
  captions, and video chapters.
- **UI drift checks.** Replay flows without recording to find broken selectors.

This is an early-stage CLI. Flow and artifact formats may change before 1.0. Browser capture and rendering run
locally; planning and script generation use an OpenAI-compatible provider, and voice synthesis uses
ElevenLabs. Those services require your own accounts and may incur charges.

## Install from npm

Use **Node.js 22 or newer**. Install the CLI in your product project:

```bash
npm install --save-dev tutorials-kit
npx tutorials-kit --help
npx playwright install chromium
```

Video composition and rendering also require **FFmpeg** with `libx264` and AAC support; see the installation
notes below. [Add a configuration and flow for your app](#use-it-with-your-app), then run:

```bash
npx tutorials-kit check --config tutorials/tutorials.config.mjs
npx tutorials-kit build --config tutorials/tutorials.config.mjs
```

For npm installations, use `npx tutorials-kit` in place of `node bin/tutorial-kit.js` in the examples below.
To try the included local demo, follow the source checkout walkthrough.

## Quick start

### 1. Install from source

Use **Node.js 22 or newer**, npm, and a current **FFmpeg** installation with `libx264` and AAC support. Google
Chrome is recommended for recording pages that contain MP4 video. Bundled Chromium is the fallback.

```bash
git clone https://github.com/Side-Products/tutorials-kit.git
cd tutorials-kit
npm ci
npx playwright install chromium
ffmpeg -version
```

Install FFmpeg through your system package manager, for example `brew install ffmpeg` on macOS or
`sudo apt install ffmpeg` on Ubuntu. On Linux, `npx playwright install --with-deps chromium` also installs
required system libraries. See the [FFmpeg download page](https://ffmpeg.org/download.html) for other
platforms.

The commands below run this checkout directly. No global installation or published npm package is required.

### 2. Record the local example

Start the included demo in one terminal:

```bash
npm run demo
```

In another terminal, from the repository root:

```bash
node bin/tutorial-kit.js list --config examples/basic/tutorials.config.mjs
node bin/tutorial-kit.js check --config examples/basic/tutorials.config.mjs
node bin/tutorial-kit.js record --config examples/basic/tutorials.config.mjs
```

This example uses a local page and synthetic data. It needs **no API keys**. The recording and screenshots
appear under `examples/basic/out/hello-world/capture/`.

### 3. Add narration and render

```bash
cp .env.example examples/basic/.env
```

Edit `examples/basic/.env` and set `OPENAI_API_KEY`, `TUTORIAL_LLM_MODEL`, `ELEVENLABS_API_KEY`, and
`ELEVENLABS_VOICE_ID` to values available to your accounts. Then:

```bash
# Generate the script, then review/edit it before paying for speech synthesis.
node bin/tutorial-kit.js script --config examples/basic/tutorials.config.mjs
node bin/tutorial-kit.js voice --config examples/basic/tutorials.config.mjs
node bin/tutorial-kit.js compose --config examples/basic/tutorials.config.mjs
node bin/tutorial-kit.js render --config examples/basic/tutorials.config.mjs
node bin/tutorial-kit.js docs --config examples/basic/tutorials.config.mjs
```

For subsequent tutorials, `build` runs all six stages with caching:

```bash
node bin/tutorial-kit.js build hello-world --config examples/basic/tutorials.config.mjs
node bin/tutorial-kit.js build hello-world --final --config examples/basic/tutorials.config.mjs
```

Standalone stage commands do not update `build`'s stage keys. The first `build` after running stages manually
may repeat work. Once you start using `build`, edits to its generated `script.md` are preserved while upstream
inputs stay unchanged.

## Use it with your app

Create a tutorials directory inside your product repository:

```text
tutorials/
├── tutorials.config.mjs
├── .env                       # local credentials; keep out of Git
└── flows/
    └── getting-started.tutorial.mjs
```

Copy [the configuration template](templates/tutorials.config.example.mjs), set your demo app's `baseUrl`, and
add a flow:

```js
export default {
	id: "getting-started",
	title: "Create your first project",
	goal: "Open the project workspace",
	auth: false,
	steps: [
		{
			id: "open-projects",
			say: "Open Projects to see your workspace.",
			actions: [
				{ kind: "goto", path: "/projects" },
				{ kind: "pause", seconds: 1.5 },
			],
		},
	],
};
```

Use `--config /path/to/tutorials/tutorials.config.mjs` to run commands against that product. Configuration
paths are resolved relative to the configuration file.

For custom interactions, replace a step's `actions` with an async `run(t)` function. The driver exposes
`goto`, `click`, `fill`, `press`, `hover`, `select`, `scrollBy`, `waitFor`, `waitLong`, and `pause`. Use
`t.page` for raw Playwright access. Optional `setup({ config, page })` and `teardown({ config, page })` hooks
prepare and clean up fixtures.

### Draft a flow with AI

Add routes to `config.sitemap`, then run:

```bash
node bin/tutorial-kit.js plan "show the project dashboard" --config /path/to/tutorials/tutorials.config.mjs
```

The scout visits up to three configured routes and sends page snapshots to your LLM provider. Review the
generated file before running it. `--yes` opts into recording the draft immediately; `--new` skips matching
the request to existing flows. Drafting never overwrites an existing flow file.

## Commands

All commands accept `--config <path>`. Flow selection accepts exact IDs or a plain-English phrase; commands
with no flow argument select all flows. Unmatched phrases may use the configured LLM to select a flow.

| Command             | Purpose                                                                     |
| ------------------- | --------------------------------------------------------------------------- |
| `list`              | List configured flows.                                                      |
| `plan "request"`    | Match a flow or draft one from your sitemap.                                |
| `record [flow...]`  | Capture browser frames, screenshots, and events.                            |
| `script [flow...]`  | Generate editable narration.                                                |
| `voice [flow...]`   | Synthesize speech and word timings.                                         |
| `compose [flow...]` | Assemble footage, mix audio, and solve the timeline.                        |
| `render [flow...]`  | Render a 1080p proof; add `--final` for 4K and 1080p finals.                |
| `docs [flow...]`    | Generate the guide, screenshots, captions, and metadata.                    |
| `build [flow...]`   | Run with caching; `--force <stage>` rebuilds from a stage onward.           |
| `check [flow...]`   | Execute flows without recording; exit nonzero on failure.                   |
| `clean [flow...]`   | Delete captured frames; `--all` deletes selected flows' output directories. |

`--headed` opens a visible capture browser for debugging. `--help` prints the command reference.

## How it works

```mermaid
flowchart LR
    P[Plan or write a flow] --> R[Record]
    R --> S[Script]
    S --> V[Voice]
    V --> C[Compose]
    C --> F[Render]
    F --> D[Docs]
```

Each build writes to `out/<flow-id>/` beside your configuration:

```text
out/hello-world/
├── capture/       # frames, screenshots, interaction log
├── script/        # editable script.md
├── voice/         # audio blocks and word timings
├── compose/       # footage, mixed audio, timeline.json
├── render/        # proof.mp4 or final-4k.mp4 + final-1080p.mp4
└── docs/          # guide.md, shots, tutorial.json, captions.vtt, chapters, snippets
```

See [the pipeline guide](docs/pipeline.md) for timing, caching, and rebuild behavior.

## Privacy and safe operation

Use a dedicated demo account with synthetic data. Flows, including `check`, act on the real application:
clicks can create records, spend credits, or delete data. Configuration and flow files are executable
JavaScript; only run files you trust.

Authentication happens before recording. Saved sessions use owner-only file permissions, and `auth: false`
flows start without cached sessions. URL queries and fragments are omitted from recorded metadata and
generated guides; review any routing information that your published guide needs.

**`redact: true` hides a fill value in event metadata, narration prompts, and generated action text. It does
not mask screenshots or video.** Password inputs are automatically redacted in metadata. Other page content,
selectors, URL paths, and recordings can still contain private data. Review every output before publishing.

Automatic selector repair is off by default. Enabling `selfHeal: true` sends page snapshots to your LLM
provider and can rewrite fully declarative flows. Repairs preserve the action kind and typed value, but may
still choose the wrong control. See [SECURITY.md](SECURITY.md) for the trust model and reporting instructions.

## Development

```bash
npm ci
npm run check                # formatting and offline regression tests
npm run test:integration     # local capture, FFmpeg composition, docs, and a short render
npm run format              # apply repository formatting
```

The integration suite needs Chromium and FFmpeg. It uses local fixtures and makes no paid AI requests. Source
lives in `src/`, CLI entry points in `bin/`, examples in `examples/`, and historical capture experiments in
`spike/`.

Contributions are welcome: start with [CONTRIBUTING.md](CONTRIBUTING.md). For bugs or feature proposals,
[open an issue](https://github.com/Side-Products/tutorials-kit/issues). Report vulnerabilities privately as
described in [SECURITY.md](SECURITY.md).

The logo and icon are available in [Brand assets](docs/branding.md).

## License

Tutorials Kit's own source code is licensed under [MIT](LICENSE).
[Remotion has separate licensing terms](https://www.remotion.dev/docs/license), including conditions for
commercial use. FFmpeg, browser binaries, AI services, voices, and media assets also retain their own terms.
See [third-party notices](THIRD_PARTY_NOTICES.md).
