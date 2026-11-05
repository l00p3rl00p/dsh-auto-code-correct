# Contributing to ACC

Thanks for your interest in improving **dsh-auto-code-correct**, the DeepSeek Harness Cordis plugin.

This is a small maintainer-led project with **limited review capacity**. Please keep contributions focused and reviewable. A proposed change may not be accepted or reviewed immediately.

Every Web-capable ACC change must satisfy the [single all-plugin lessons authority](https://github.com/l00p3rl00p/quatrus-scratchpad/blob/main/plugins/plugin-lessons.md), including its recorded ACC-specific findings. The GitHub Actions packager's emitted-bundle import check is mandatory even for UI-only changes. Browser mounting, persistence and actual edit behavior remain separate live acceptance gates; do not present a Host-only green CI run as proof of Web health.

## Before you contribute

- **Bug fix or small documentation correction:** Open a focused pull request that explains the problem, the change, and how you verified it.
- **New capability, significant behavior change, integration, or architectural change:** Open a brief issue first and wait for maintainer agreement before implementing. An issue or pull request is not a commitment to accept the work.
- **Security vulnerability:** Do not publish exploit details in an issue or PR. Use GitHub's private vulnerability reporting if the repository offers it; otherwise contact the maintainer privately through an available published channel. Do not post credentials, tokens, or private logs.

## Pull request contract

1. Fork the repository and create a short-lived branch. Do not push directly to `main`.
2. Make the smallest change that solves the agreed problem. Prefer existing DSH/Cordis extension points and installed tools. **Do not add custom integrations until existing native capabilities have been audited and the maintainer has approved the approach.**
3. Update the existing authoritative documentation where relevant: [ARCHITECTURE.md](ARCHITECTURE.md) for design and component ownership, [ENVIRONMENT.md](ENVIRONMENT.md) for environment assumptions and delivered surfaces, [RUNBOOK.md](RUNBOOK.md) for operating instructions, or [README.md](README.md) for getting started. Keep the component list synchronized when adding host, client, settings, or conversation-view surfaces. Do not create extra planning or status Markdown files.
4. Run the checks locally before opening the PR:

   ```bash
   pnpm install --no-frozen-lockfile
   pnpm run verify
   ```

5. Explain what changed, why, what was tested, and any limits of the verification. Add or update a regression test for a behavior fix. A passing unit test is not proof that the plugin has been validated inside a live Docker-hosted DeepSeek session.
6. Keep the PR limited to one concern. Do not make unrelated formatting, dependency, or architectural changes. Do not suppress failures or bypass checks to obtain a green result.

## Review and merging

- The maintainer decides what gets accepted and when. **Do not request automatic assignment, deadlines, or repeated review reminders.**
- CI is evidence, not permission to merge. Only authorized maintainers merge into `main`.
- Squash merges are preferred; completed contribution branches may be deleted afterward.
- For current package/runtime contracts, see [package.json](package.json) and [ARCHITECTURE.md](ARCHITECTURE.md). The code and actual configuration remain authoritative.
