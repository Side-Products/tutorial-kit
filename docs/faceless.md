# From a product walkthrough to a social video

Tutorials Kit captures your real app and produces a narrated walkthrough, screenshots, and a written guide.
[Faceless](https://faceless.so/?utm_source=tutorials-kit&utm_medium=docs&utm_campaign=opensource&utm_content=workflow)
provides a hosted editor for captions, music, and video finishing, plus publishing to connected social
accounts. Use it when you want to prepare a version of that walkthrough for your audience.

This is an optional workflow using Faceless's existing import tools and CLI. Tutorials Kit itself renders
captions locally and exports WebVTT. Faceless has its own account, service terms, and plan requirements.

## 1. Export a copy for caption editing

Complete and review a normal Tutorials Kit build first. Then, from the Tutorials Kit source checkout, run:

```bash
node bin/tutorial-kit.js render getting-started \
  --config /path/to/your-app/tutorials/tutorials.config.mjs \
  --no-captions
```

Replace `getting-started` with your flow ID and the configuration path with your app's configuration. The
`--no-captions` option is available on `master` and is planned for the next npm release; npm `0.1.4` does not
include it yet. See the [source setup instructions](../README.md#1-install-from-source).

The command writes `out/<flow-id>/render/proof-no-captions.mp4` beside your configuration. Add `--final` to
produce both `final-4k-no-captions.mp4` and `final-1080p-no-captions.mp4`.

These files keep the narration, screen recording, title cards, cursor, and zooms. Omitting the burned-in
captions gives Faceless room to add an editable caption track. The standard renders, narration timings,
written guide, and `captions.vtt` stay available. Use this option with `render`, after `build`.

## 2. Import and edit in Faceless

Open
[Faceless](https://faceless.so/?utm_source=tutorials-kit&utm_medium=docs&utm_campaign=opensource&utm_content=import)
and import the reviewed `*-no-captions.mp4` through its existing-footage workflow. Adjust the captions in the
editor, then export a preview.

For a product walkthrough, check names, shortcuts, and technical vocabulary in the transcription. Place
captions where they leave the controls readable. Keep a landscape layout for detailed UI; a short social cut
should focus on one useful outcome and keep the relevant screen area visible.

If you trim or retime the video in Faceless, the original guide's chapter times and WebVTT still describe the
Tutorials Kit render. Use captions and timing from the edited version when distributing that cut.

## Run the import from an agent or terminal

Faceless also offers a
[CLI and agent tools](https://faceless.so/agents?utm_source=tutorials-kit&utm_medium=docs&utm_campaign=opensource&utm_content=agents).
The commands below were checked against `faceless-cli` `1.1.12`.

Install the CLI and authenticate locally:

```bash
npm install --global faceless-cli
faceless login
faceless whoami --json
```

See
[Faceless's developer page](https://faceless.so/developers?utm_source=tutorials-kit&utm_medium=docs&utm_campaign=opensource&utm_content=api)
for account access and authentication. The caption workflow needs `videos:write` and `videos:read` scopes.
Keep credentials out of prompts, source files, and Git.

The caption API accepts a **video URL**, rather than uploading a local file. Provide an HTTPS media URL that
Faceless can fetch without browser cookies. Review the recording before making it accessible; use Faceless's
dashboard upload if you do not have a suitable media host. A `localhost` URL will not work.

Create the caption project:

```bash
faceless videos captions \
  --video-url 'https://media.example.com/getting-started-no-captions.mp4' \
  --name 'Getting started walkthrough' \
  --language English \
  --idempotency-key 'tutorials-getting-started-export-1' \
  --json
```

Replace the example URL with the reviewed export's URL. Choose a distinct idempotency key for each new export
and reuse it when retrying the same request. Save the returned `data.id` so you can resume an existing job
instead of creating another one.

Wait for transcription and captions:

```bash
FACELESS_VIDEO_ID='replace-with-the-returned-data.id'
faceless videos status "$FACELESS_VIDEO_ID" --wait --json
```

Continue only when `data.status` is `completed`. Review and adjust the captions in Faceless, then render:

```bash
faceless videos render "$FACELESS_VIDEO_ID" --wait --json
```

Use the returned media URL only after the render status is `done`. If a job fails or times out, inspect its
status and resume that job using its saved ID. Review the MP4 before publishing or scheduling it. Faceless's
publishing tools use separately connected social accounts and `posts:write` permission.

## Ask your agent to prepare the Faceless version

Use this after the main Tutorials Kit setup prompt, when you have chosen this optional workflow:

```text
Prepare a Faceless version of my completed Tutorials Kit walkthrough.

Read https://github.com/Side-Products/tutorials-kit/blob/master/docs/faceless.md.
Locate the finished tutorial and render a separate copy without burned-in
captions. Keep its existing narration and actual screen recording.

Show me the export for review before uploading it. Use Faceless's existing-
video caption workflow through its CLI or connected agent tools. If only a
local file is available, explain the dashboard upload option or ask me to
choose a media host; do not make a private recording public automatically.

Use credentials configured locally. Save project and render IDs, resume
existing jobs, and check their terminal status. Return the preview for me
to review. Ask before incurring charges, publishing, or scheduling posts.
Report any unfinished steps and API limitations clearly.
```

## Captions and voice support

| Use case                                         | Current fit                                                                                                                                                                  |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Styled captions on the recorded walkthrough      | Existing-video import and caption API; the workflow above.                                                                                                                   |
| Cloud editing and publishing                     | Faceless editor and render/publishing tools, with review before posting.                                                                                                     |
| A separate promotional video from a short script | Faceless's video-generation API can generate voice, visuals, and captions. It creates new visuals; keep the original screen recording for exact product instructions.        |
| Faceless as the tutorial's voice provider        | Requires a documented standalone speech endpoint returning audio and word timings. The CLI catalog exposes voice selection for generated videos, not that provider contract. |

Tutorials Kit currently uses its own ElevenLabs wrapper for narration, including retries, pronunciation
handling, per-block caching, and word timestamps. A Faceless voice integration could wrap the same ElevenLabs
speech endpoint and return that audio and alignment contract through Faceless authentication. That provider
integration is proposed; it is not part of the workflow above.

For current capabilities, consult the [Faceless CLI](https://www.npmjs.com/package/faceless-cli),
[API reference](https://faceless.so/api/v1/openapi.json), and [agent guide](https://faceless.so/agents).
