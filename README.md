<div align="center">

# dsh-auto-code-correct (ACC)

**Automatic code correction and verification for DeepSeek Harness.**

A native DeepSeek Harness Cordis plugin that reuses existing language tools and reports remaining diagnostics after edits.

[![Platform](https://img.shields.io/badge/Platform-DeepSeek%20Harness-233C40?style=flat-square)](https://github.com/deepseek-ai) [![Configuration](https://img.shields.io/badge/Configuration-Cordis%20Plugin-6853B7?style=flat-square)](cordis.patch.yml) [![Language](https://img.shields.io/badge/Language-TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](package.json) [![License](https://img.shields.io/badge/License-MIT-436477?style=flat-square)](LICENSE)

**Explore the project**

[![Getting started](https://img.shields.io/badge/Getting_Started-EAF2EF?style=for-the-badge&logo=rocket&logoColor=203D39&labelColor=EAF2EF)](#getting-started)
[![Architecture](https://img.shields.io/badge/Architecture-233C40?style=for-the-badge)](ARCHITECTURE.md)
[![Environment](https://img.shields.io/badge/Environment-233C40?style=for-the-badge)](ENVIRONMENT.md)
[![Runbook](https://img.shields.io/badge/Runbook-233C40?style=for-the-badge)](RUNBOOK.md)
[![Contributing](https://img.shields.io/badge/Contributing-233C40?style=for-the-badge)](CONTRIBUTING.md)

</div>

---

## Correct code with the tools you already have

ACC runs after supported, successful DeepSeek Harness file edits, applies configured fixers, runs read-only checks, and returns remaining diagnostics to the agent. Tool discovery and language settings are managed through native DSH capabilities. ACC is derived from the MIT-licensed [dsh-lens-lite](https://github.com/ben7am1n/dsh-lens-lite), with its upstream attribution preserved.

## What you need

| | Requirement | Purpose |
| --- | --- | --- |
| **Required** | DeepSeek Harness | Compatible DSH version as declared in [package.json](package.json) |
| **Required** | Node.js and pnpm | Build, verify, and package the plugin; see the [Node engine range](package.json) |
| **As enabled** | Language quality tools | Reuse available linters, formatters, and language servers |
| **Not required** | Separate Docker service | ACC is a native plugin, not an independent service |

## Getting started

Use an existing compatible DSH profile:

```sh
pnpm install --no-frozen-lockfile
pnpm run verify
mkdir -p dist
pnpm pack --pack-destination dist
dsh plugin --profile web add ./dist/dsh-auto-code-correct-0.1.0.tgz
dsh --profile web --dump-config
```

In a DSH chat, run `/acc status <capability-id>` to check a tool. Use `/acc link <capability-id> /absolute/path/to/executable` to point to an existing executable rather than reinstalling it. For a Docker deployment, inspect [ENVIRONMENT.md](ENVIRONMENT.md) before installation.

A passing `pnpm run verify` is a repository check; it is **not** proof of successful installation or operation in a live DSH session. See the [Runbook](RUNBOOK.md) for verification and troubleshooting.

## Project reference

| Question | Authoritative source |
| --- | --- |
| How does ACC work? | [Architecture](ARCHITECTURE.md) |
| Which environments and tools does it support? | [Environment](ENVIRONMENT.md) |
| How do I install, operate, and recover it? | [Runbook](RUNBOOK.md) |
| Which versions, dependencies, and commands are declared? | [Package manifest](package.json) |
| How do I contribute? | [Contributing](CONTRIBUTING.md) |

## License and attribution

MIT; original attribution to [dsh-lens-lite](https://github.com/ben7am1n/dsh-lens-lite) is preserved. See [LICENSE](LICENSE) and the upstream project for original copyright and license terms.

<div align="center"><sub>ACC · Native DeepSeek Harness code correction and verification</sub></div>
