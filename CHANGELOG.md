# Changelog

## Unreleased

- Add `render --no-captions` to export a separate narrated video for external caption editing while keeping
  the original render and WebVTT captions.
- Document an optional Faceless workflow for importing footage, editing captions, and rendering in the cloud.
- Add a copyable agent setup prompt and assistant buttons, including prompt links where supported.

## 0.1.4 (2026-09-11)

- Replace the initial icon with the approved open-guide mark, combining written steps and video playback.
- Update the light and dark logos, favicon, Apple touch icon, and brand guide with ivory and graphite
  branding.
- Pin README logo URLs to this release so published packages display the matching artwork.

## 0.1.3 (2026-09-11)

- Add an original folded play-ribbon icon and matching Tutorials Kit logos for light and dark backgrounds.
- Show the logo in the README and provide downloadable brand assets, a favicon, and an Apple touch icon.

## 0.1.2 (2026-09-11)

- Use the Tutorials Kit name throughout the documentation and local demo.
- Update repository metadata, badges, banner, and reporting links for `Side-Products/tutorials-kit`.
- Use `tutorials-kit` in generated CLI guidance.

## 0.1.1 (2026-09-11)

- Publish as the unscoped npm package `tutorials-kit`.
- Add the `tutorials-kit` CLI command alongside the existing `tutorial-kit` and `tkit` aliases.
- Update installation instructions and the npm badge to use the new package name.

## 0.1.0 (2026-09-11)

First public npm release, originally published as `@pushpit07/tutorial-kit` with the `tutorial-kit` and `tkit`
CLI commands.

### Open-source preparation

- Add an MIT license, contribution and conduct guidelines, security policy, third-party notices, issue
  templates, and pull request guidance.
- Rewrite the README, add configuration documentation, and include a local demo with no required API keys.
- Add consistent formatting, offline security regression tests, browser/media integration tests, CI, CodeQL
  analysis, Git history secret scanning, and grouped Dependabot updates.

### Security and compatibility

- Update vulnerable dependencies and remove the unused Remotion CLI dependency.
- Require Node.js 22+ and a maintained system FFmpeg; the old bundled FFmpeg installer is removed.
- Validate flow/step IDs, artifact paths, generated actions, and scout routes. Refuse draft overwrites.
- Save sessions with owner-only permissions and prevent unauthenticated flows from loading cached sessions.
- Require secure credential transport except on loopback, disable provider redirects, and omit provider error
  bodies from logs.
- Disable selector repair by default; repairs only change the target of an existing action and preserve its
  value.
- Strip query strings and fragments from output URLs and redact password fields in event metadata. Pixel data
  still requires review; metadata redaction does not mask screenshots or video.
- Escape generated Markdown/HTML, validate SVG colors, and protect FFmpeg concat manifests from path
  injection.
- Correct generated video references for proof renders and reject unknown `--force` stages.

The security changes invalidate earlier build caches. The next `build` may record the flow again and incur
provider or application charges. Review the target environment before rebuilding. Old output, scripts,
backups, and recordings are not retroactively scrubbed; review or delete them separately.
