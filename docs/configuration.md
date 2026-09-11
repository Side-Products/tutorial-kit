# Configuration

Pass `--config /path/to/tutorials.config.mjs`, or run from a directory containing that filename. The default
export is a JavaScript object. The CLI loads `.env` beside it before importing the module; existing
environment variables take precedence. `.env` accepts simple `KEY=value` lines and quoted values, without
shell expansion.

Start from [the template](../templates/tutorials.config.example.mjs) and [.env.example](../.env.example).
Configuration and flow modules execute with your user's privileges, including for `list`.

## Options

| Key              | Default                                         | Purpose                                                                                                                        |
| ---------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `baseUrl`        | Required                                        | App HTTP(S) URL without embedded credentials. Authenticated use requires HTTPS except on loopback.                             |
| `canonicalHost`  | Host of `baseUrl`                               | Host shown in generated guides and video browser chrome.                                                                       |
| `flowsDir`       | `flows`                                         | Directory containing `*.tutorial.mjs` files.                                                                                   |
| `outDir`         | `out`                                           | Generated artifacts. Must not contain the configuration or flows directory.                                                    |
| `viewport`       | `{ width: 1920, height: 1080, dsf: 2 }`         | Browser CSS dimensions and capture device scale. Final composition is 3840×2160.                                               |
| `browserChannel` | `chrome`                                        | Installed browser channel; `null` selects bundled Chromium. Chrome supports page H.264/AAC playback.                           |
| `auth`           | `null`                                          | Optional form-login configuration, below.                                                                                      |
| `selfHeal`       | `false`                                         | Opt into LLM selector repair for fully declarative flows.                                                                      |
| `sitemap`        | None                                            | Array of `{ path, purpose }`; the scout can select only these routes on the configured origin.                                 |
| `brand`          | Product name and dark/purple colors             | `name`, `colors: { bg, accent, text }`, optional local `logo`. Use hex colors.                                                 |
| `voice`          | None                                            | Required for voice: `id`, optional `model`, `settings`, `speed`, and `pronunciations` mapping.                                 |
| `script.model`   | `TUTORIAL_LLM_MODEL`, then the built-in default | Model available from your LLM provider. Set this or the environment variable explicitly.                                       |
| `music`          | None                                            | Optional local `track` path and numeric `gainDb`. Missing music falls back to voice-only audio.                                |
| `allowLeakage`   | `false`                                         | Bypass the composition check for local/test URLs. The local demo sets this intentionally; it is not a general secret detector. |

Paths are relative to the configuration file. `auth.storageState` must stay inside its directory tree. Keep
custom output and session paths in your product's `.gitignore`.

## Authentication

```js
auth: {
	loginPath: "/login",
	emailEnv: "TUTORIAL_EMAIL",
	passwordEnv: "TUTORIAL_PASSWORD",
	storageState: ".tutorial-kit/auth.json",
	emailSelector: 'input[type="email"]',
	passwordSelector: 'input[type="password"]',
	submitSelector: 'form button[type="submit"]',
}
```

The helper supports a same-origin email/password form that navigates away from the login path on success. For
SSO, MFA, or other login patterns, prepare a compatible Playwright storage-state file in a trusted local
session and set `storageState`. Authentication must complete before recording. `auth: false` on an individual
flow skips login and cached sessions.

## Environment variables

| Variable                              | Used by                                                                                                      |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `OPENAI_API_KEY`                      | `plan`, `script`, optional LLM flow matching, and opted-in selector repair.                                  |
| `OPENAI_BASE_URL`                     | Optional OpenAI-compatible API base; defaults to `https://api.openai.com/v1`. Receives your key and prompts. |
| `TUTORIAL_LLM_MODEL`                  | LLM model unless `script.model` is set.                                                                      |
| `ELEVENLABS_API_KEY`                  | `voice`.                                                                                                     |
| `ELEVENLABS_VOICE_ID`                 | Read by the supplied example configurations. Choose a voice available to your account.                       |
| `TUTORIAL_EMAIL`, `TUTORIAL_PASSWORD` | Default login credential names; override with `auth.emailEnv` / `auth.passwordEnv`.                          |
| `TUTORIAL_FFMPEG_PATH`                | FFmpeg executable path; otherwise `ffmpeg` is resolved from `PATH`.                                          |
| `RENDER_CONCURRENCY`                  | Render worker count, minimum 2. Defaults to a CPU-based value capped at 8.                                   |
| `ELEVENLABS_MAX_CONCURRENCY`          | Maximum concurrent requests, default 4.                                                                      |
| `ELEVENLABS_MAX_RETRIES`              | Retry budget, default 4.                                                                                     |

## Flow conventions

IDs use 1–80 letters, digits, hyphens, or underscores, starting with a letter or digit. Flow IDs and step IDs
must be unique within their scope. Prefer descriptive kebab-case names.

Declarative action kinds are `goto`, `click`, `fill`, `press`, `hover`, `scroll`, `waitFor`, `waitLong`, and
`pause`. Targets use exactly one of `{ css }`, `{ text, exact? }`, or `{ role, name?, exact? }`. Set
`redact: true` on a fill for metadata redaction. This does not mask screenshots or footage.

Set `noHeal: true` when an action must fail rather than use a repaired selector, especially a wait for a real
operation to finish. Even when enabled, repairs cannot change the action kind, value, or privacy flags.
Hand-written or mixed flows are not automatically rewritten. Use `zoom: false` on a flow to disable click
zooms.

## Troubleshooting

- **Browser executable missing:** run `npx playwright install chromium`, or install Chrome.
- **MP4s appear black inside the app:** use installed Chrome with `browserChannel: "chrome"`.
- **`spawn ffmpeg ENOENT`:** install FFmpeg or set `TUTORIAL_FFMPEG_PATH` to its executable.
- **LLM or voice request fails:** check the provider account, available model/voice, and environment
  variables. Provider response bodies are omitted from errors because they can contain sensitive data.
- **Composition rejects localhost:** use `allowLeakage: true` only for a reviewed local fixture, as in the
  basic example. The check detects development markers, not all secrets.
- **A selector fails:** run `check` against a demo environment, update the flow, then record again.
- **A config path is ignored by Git:** `.env` and generated state are ignored intentionally; never force-add
  them.
