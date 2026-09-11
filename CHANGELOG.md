# Changelog

## Unreleased

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
