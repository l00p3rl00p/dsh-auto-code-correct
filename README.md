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

ACC runs after supported, successful DeepSeek Harness file edits, applies configured fixers, runs read-only checks, and returns remaining diagnostics to the agent. Tool discovery and language settings are managed through native DSH capabilities.

## What you need

| | Requirement | Purpose |
| --- | --- | --- |
| **Required** | DeepSeek Harness | Compatible DSH version as declared in [package.json](package.json) |
| **Developer builds only** | Node.js and pnpm | Needed when building from source, not for Web UI installation |
| **As enabled** | Language quality tools | Reuse available linters, formatters, and language servers |
| **Not required** | Separate Docker service | ACC is a native plugin, not an independent service |

## Getting started

### Local package installation — QDev Docker

When the repository is available on the container filesystem, **GitHub authentication is not required inside the Harness container**. Build and install ACC from its local checkout:

```sh
cd /path/to/dsh-auto-code-correct
pnpm install --no-frozen-lockfile
pnpm run verify
mkdir -p dist
pnpm pack --pack-destination dist
dsh plugin --profile web add ./dist/dsh-auto-code-correct-0.1.0.tgz
dsh --profile web --dump-config
```

Use the actual container-visible checkout path. The verified distribution is a **built local tarball**, which includes ACC's Host entry, Web settings client, CLI, and Cordis patch. Do not assume a raw directory link has the same packaging/peer behavior as a tarball; SOUP has a separately tested local-directory workflow.

**Native profile prerequisites:** ACC needs compatible `@deepseek-ai/dsh-lsp` and `@deepseek-ai/dsh-lsp-stdio` available when DSH Web starts. The QDev [Harness startup script](https://github.com/l00p3rl00p/qdocker-compose/blob/main/stacks/harness/start-harness.sh) owns the environment-specific dependency setup; ACC does not introduce a second installer or Docker service. See [ENVIRONMENT.md](ENVIRONMENT.md#native-lsp-package-dependency-chain).

After installation, restart the **DSH Web process** (or its owning Harness container), not the whole stack. Launch [DSH Web](http://localhost:3080), using its token-bearing start URL where required.

### Alternative: GitHub-source installation

In **DeepSeek Harness → Plugins → Installed → Add plugin**, use:

```text
github:l00p3rl00p/dsh-auto-code-correct
```

This method requires that the Git transport used by pnpm can access the repository. If GitHub authentication inside the container is unavailable, use the local-package method rather than adding extra SSH credentials or transports just to install the plugin. Keep the **Official npm registry** for dependencies.

**Settings:** In **Plugins → Installed → dsh-auto-code-correct**, configure **Auto-Correct**, **Language Servers**, and **Code Hygiene**. These are plugin-specific panels, not **Settings → Built-in plugins**; settings belong to the active DSH profile.

### Verify behavior, not just installation

`pnpm run verify` checks source quality, tests, compilation, and the native package contract. CI also verifies packed clean-profile installation. To confirm ACC actually runs in a DSH conversation, enable Python Auto-Correct, edit a disposable `.py` file using DSH's native edit tool, and observe Ruff/ty execution and diagnostics delivered to the agent. Separately test the enabled Git hygiene pre-commit hook in a disposable repository. Detailed expected outcomes and failure diagnostics are in [RUNBOOK.md](RUNBOOK.md#two-independent-event-acceptance-tests).

Use `/acc status <capability-id>` in DSH to inspect an available tool and `/acc link <capability-id> /absolute/path/to/executable` to select an already-installed executable. Do not install a duplicate tool unnecessarily. pnpm store warnings alone do not indicate an installation failure; peer-dependency warnings require inspection in the target DSH profile.

## Project reference

| Question | Authoritative source |
| --- | --- |
| How does ACC work? | [Architecture](ARCHITECTURE.md) |
| Which environments and tools does it support? | [Environment](ENVIRONMENT.md) |
| How do I install, operate, and recover it? | [Runbook](RUNBOOK.md) |
| Which versions, dependencies, and commands are declared? | [Package manifest](package.json) |
| How do I contribute? | [Contributing](CONTRIBUTING.md) |
| What is the original project and license? | [Attribution](ATTRIBUTION.md) · [MIT license](LICENSE) |

## License and attribution

MIT; original attribution to [dsh-lens-lite](https://github.com/ben7am1n/dsh-lens-lite) is preserved. See [LICENSE](LICENSE) and the upstream project for original copyright and license terms.

<div align="center"><sub>ACC · Native DeepSeek Harness code correction and verification</sub></div>

