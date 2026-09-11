# Security

Tutorial Kit is a local automation CLI for trusted configurations, trusted flows, and dedicated demo accounts.
It is not a sandbox for user-uploaded JavaScript or a service for executing arbitrary URLs on behalf of
strangers.

## Report a vulnerability

Use GitHub's private **Report a vulnerability** form when available:
[submit a private report](https://github.com/Side-Products/tutorial-kit/security/advisories/new).

If the form is unavailable, open an issue containing only a request for a private security contact. Do not
include exploit details, credentials, customer data, or an unpatched proof of concept in that issue.

Privately include the affected commit, reproduction steps using synthetic data, impact, and a proposed fix if
you have one. The current `master` branch is the supported development version; there are no separately
maintained release branches or guaranteed response times yet.

## Trust boundaries

| Input or operation                                | Security implications                                                                                                                                                                                    |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Configuration, flow modules, setup/teardown hooks | Execute JavaScript with your OS user's filesystem, network, and environment access, including during `list`. Review them before any command.                                                             |
| `record`, `check`, `plan --yes`, uncached `build` | Perform real browser actions. Use a demo environment and a least-privileged account. `check` can mutate application data.                                                                                |
| AI planning                                       | Sends the request, product metadata, configured routes, and selected page snapshots to your LLM provider. Generated steps require review.                                                                |
| Script generation                                 | Sends action descriptions, labels, page paths, and narration hints to your LLM provider.                                                                                                                 |
| `selfHeal: true`                                  | Sends failed action targets and page snapshots to your LLM provider. Retries a selector and rewrites fully declarative flows. Disabled by default; same-kind repairs can still choose the wrong control. |
| Speech synthesis                                  | Sends narration, voice settings, and adjacent narration blocks to ElevenLabs.                                                                                                                            |
| `OPENAI_BASE_URL`                                 | Determines who receives your LLM API key and prompts. Use a trusted provider. HTTPS is required except on loopback.                                                                                      |
| Recordings and artifacts                          | May contain everything visible in the browser, personal data, private URL paths, and typed values. Treat them as private until reviewed.                                                                 |

The CLI does not publish videos or guides. Browser downloads and dependencies may contact upstream services.
Consult providers' terms and privacy policies for how they handle data.

## Credentials and artifacts

- Keep `.env`, `.tutorial-kit/`, auth state, recordings, and output out of version control. Add equivalent
  ignore rules to product repositories and for any custom output or auth-state filenames.
- Saved browser state contains reusable session credentials. It is written atomically with mode `0600`; new
  auth directories use `0700`. Permissions on Windows depend on your ACL configuration.
- A flow with `auth: false` starts without saved authentication state.
- Authentication requires HTTPS except for loopback development. Form login checks the configured origin
  before filling credentials.
- Capture starts after login and setup. Output URL metadata omits query strings and fragments, but secrets in
  URL paths or on the page itself remain visible.
- `fill(..., { redact: true })` and declarative `redact: true` omit the typed value from event metadata and
  downstream action text. Password fields automatically use metadata redaction. **This does not mask pixels**,
  DOM snapshots, selectors, page labels, or values copied elsewhere in the UI. Use synthetic data.
- Flow and step IDs are validated before use in paths. Generated drafts cannot overwrite existing files.
  Artifact filenames must remain in their expected directory, without symlinks.
- Declarative `goto` actions and scout route selection are restricted to the configured origin. This is not
  browser network isolation: resources, redirects, clicked links, and custom JavaScript can contact other
  origins. Do not visit untrusted sites with privileged sessions.
- `clean --all` deletes selected flow outputs. Keep backups of work you want to retain.

Keep Node.js, Chrome/Chromium, FFmpeg, and npm dependencies updated. `npm audit` covers known npm advisories;
it does not comprehensively audit browser or native media binaries. Capture enables Chromium's sandbox. Run as
a regular OS user in an environment that supports it.

## Before making a fork public

Scan the working tree and complete Git history. Deleting a secret from the current tree does not remove it
from history. Revoke exposed credentials first, then clean affected history and other copies as needed. Also
inspect releases, issue attachments, pull requests, CI artifacts, and output copied elsewhere.

Maintainers should enable private vulnerability reporting, Dependabot alerts and updates, secret scanning, and
push protection in GitHub settings where available. Require the CI workflow for changes to `master`.
