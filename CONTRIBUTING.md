# Contributing to Tutorial Kit

Small, focused pull requests are welcome. Discuss changes to the CLI or artifact formats in an issue before
doing substantial work.

## Set up

1. Fork and clone the repository.
2. Use Node.js 22 or newer and run `npm ci`.
3. Install a current FFmpeg and run `npx playwright install chromium`.
4. Run `npm run check` and try the local example described in the README.

You do not need API keys to work on recording, timing, documentation, or rendering. Tests use synthetic data;
never add credentials or production recordings as fixtures.

## Make a change

- Keep source changes in the relevant pipeline stage under `src/`.
- Keep all Remotion packages on the same exact version.
- Add a regression test for a bug or a meaningful behavior change. Use Node's built-in test runner.
- Update documentation when a command, default, or output format changes.
- Run `npm run format`, `npm run check`, and `npm run test:integration` when changing the browser or media
  pipeline.
- Run `npm audit` after dependency changes. Inspect `npm pack --dry-run` when changing package contents.

`npm test` is offline. The integration suite uses a loopback demo, a short synthetic audio track, and local
rendering. It must not log in to production accounts or call paid providers. Remotion may download its browser
on the first integration run.

Open pull requests against `master`. Explain the problem, the resulting behavior, and what you tested. Include
a sanitized example or screenshot when it helps reviewers assess a visual change.

## Report a bug

Include the command, your OS and Node version, the stage that failed, and a minimal flow using synthetic data.
Remove credentials, session files, private URLs, and customer data from logs and screenshots. Use
[SECURITY.md](SECURITY.md) for vulnerabilities.

## Working together

Follow the [code of conduct](CODE_OF_CONDUCT.md) in all project spaces.

Be respectful, explain technical disagreements with evidence, and help newcomers reproduce issues. Harassment,
threats, and disclosure of another person's private information are not acceptable. Maintainers may remove
content or restrict participation that disrupts collaboration.

By submitting a contribution, you agree that your original contribution is provided under the project's
[MIT license](LICENSE). Include attribution and compatible license notices for third-party material.
