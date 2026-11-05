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

ACC runs after supported, successful DeepSeek Harness file edits, applies configured fixers, runs read-only checks, and returns remaining diagnostics to the agent. Each completed ACC operation is also recorded in the native **AutoCorrect** conversation tab with its real name, status, timing, output, and observed fixer change. Tool discovery and language settings are managed through native DSH capabilities.

## What you need

| | Requirement | Purpose |
| --- | --- | --- |
| **Required** | DeepSeek Harness | Compatible DSH version as declared in [package.json](package.json) |
| **Developer builds only** | Node.js and pnpm | Needed when building from source, not for Web UI installation |
| **As enabled** | Language quality tools | Reuse available linters, formatters, and language servers |
| **Not required** | Separate Docker service | ACC is a native plugin, not an independent service |

## Delivered components

| Component | Source | Runtime surface |
| --- | --- | --- |
| Host correction pipeline | `src/index.ts` | Native `tools/execute` / `tools/post-execute` |
| Operation contract | `src/operation-record.ts` | Durable ACC-owned `auto-code-correct/operation` session event |
| Native settings page | `src/client/index.tsx` | Plugins → Installed → ACC configuration |
| AutoCorrect results tab | `src/client/autocorrect-view.tsx` | Always-visible conversation view beside Chat and Trajectory |
| Tool manager and hygiene | `src/cli.ts`, `src/hygiene-hook.ts` | `/acc` commands and Git pre-commit hook |
| LSP integration | `src/lsp-routing.test.ts`, `src/index.ts` | Native DSH LSP services and actions |

The AutoCorrect tab is an ACC-owned results view, not a replacement for DSH Chat or Trajectory. It projects completed operations from durable ACC-owned session events; it does not alter native tool results or fabricate tool/PTC events. Native nested operation rows inside the shipped Chat/Trajectory tool tree still require a future generic DSH operation seam.

## Emergency escape — recover DSH without the browser

If installing or updating ACC makes the DSH Web interface unusable, remove **only ACC** from its installed Web profile from the Mac Terminal:

```sh
docker exec -it quatrus-harness-deepseek-harness bash -lc 'dsh plugin --profile web remove dsh-auto-code-correct'
docker restart quatrus-harness-deepseek-harness
```

If ACC still loads, inspect `dsh --profile web --dump-config` and the effective profile/home Cordis patch for a separately configured ACC insertion; disable only that insertion through the native configuration path and restart once. Do **not** delete `~/.dsh`, clear sessions, remove other plugins, or rebuild the entire Docker stack. Full operator details: [ACC Runbook](RUNBOOK.md#emergency-recovery--bad-web-plugin) and [shared plugin lessons](https://github.com/l00p3rl00p/quatrus-scratchpad/blob/main/plugins/plugin-lessons.md).

ACC 0.1.9 also corrects the Environment readiness panel's native Remote-service injection. It reads the mounted `remote.accReadiness` namespace through an explicitly injected child Cordis scope. The verified package must show readiness on first load and after **Refresh**, without the `without inject` error. See [Runbook](RUNBOOK.md#confirm-installed-readiness-dashboard-acc-019) for live acceptance; CI covers the injection source contract but cannot substitute for an installed browser session.

## Browser safety and recovery

**Mandatory DSH plugin lessons:** [All-plugin lessons learned](https://github.com/l00p3rl00p/quatrus-scratchpad/blob/main/plugins/plugin-lessons.md), including the ACC-specific findings.

ACC's Web settings and AutoCorrect tab can fail before the DSH Plugins UI is accessible if the published `lib/client.js` retains a dependency the DSH browser ModuleLoader cannot resolve. The versioned GitHub Actions packager now executes `pnpm run verify`, including `scripts/check-package.mjs`, which checks the **built** browser bundle's loader registration and external `require()` calls, self-tests the scanner against the original failure, and smoke-executes the generated client factory under a guarded DSH-style loader. A green Host-side install alone never proves browser startup. Only install the tarball built from the verified source revision; after installation verify browser startup and real ACC behavior. To recover without the UI, use the explicit CLI removal procedure in the [Runbook](RUNBOOK.md#emergency-recovery--bad-web-plugin). The project source checkout is not the installed plugin copy.

## Getting started

### Local package installation — QDev Docker

When the repository is available on the container filesystem, **GitHub authentication is not required inside the Harness container**. Build and install ACC from its local checkout:

```sh
cd /path/to/dsh-auto-code-correct
pnpm install --no-frozen-lockfile
pnpm run verify
mkdir -p dist
pnpm pack --pack-destination dist
dsh plugin --profile web add ./dist/dsh-auto-code-correct-0.1.9.tgz
dsh --profile web --dump-config
```

Use the actual container-visible checkout path. The verified distribution is a **built local tarball**, which includes ACC's Host entry, Web settings client, CLI, and Cordis patch. Do not assume a raw directory link has the same packaging/peer behavior as a tarball; SOUP has a separately tested local-directory workflow.

**Native profile prerequisites:** ACC needs compatible `@deepseek-ai/dsh-lsp` and `@deepseek-ai/dsh-lsp-stdio` available when DSH Web starts. The QDev [Harness startup script](https://github.com/l00p3rl00p/qdocker-compose/blob/main/stacks/harness/start-harness.sh) owns the environment-specific dependency setup; ACC does not introduce a second installer or Docker service. See [ENVIRONMENT.md](ENVIRONMENT.md#native-lsp-package-dependency-chain).

After installation, restart the **DSH Web process** (or its owning Harness container), not the whole stack. Launch [DSH Web](http://localhost:3080), using its token-bearing start URL where required.

### GitHub Actions build artifact

Every push or pull request touching ACC runs the repository workflow [`dsh-auto-code-correct-package.yml`](.github/workflows/dsh-auto-code-correct-package.yml). It verifies the source, builds the Host/Web/CLI entries, packs the exact manifest version, installs that tarball into a clean official DSH profile, and uploads `dsh-auto-code-correct-plugin-<version>` as a workflow artifact. Download the artifact from the completed workflow run, then install the contained tarball with the normal DSH plugin manager; it is independently installable and can be rebuilt without editing a managed DSH installation.

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

## Plugin completion contract

ACC is the **programming/linting plugin**. Its authoritative source, package, user documentation and release checks live in **this repository**. [Quatrus Scratchpad](https://github.com/l00p3rl00p/quatrus-scratchpad) owns the separate **SOUP trajectory-drift plugin** and its historical experiments; SOUP is not a dependency of ACC. Both plugins run within DSH and can use whichever compatible model endpoint the Harness is configured to use, including local inference. ACC does not require a training platform, a frontier model, or a dedicated Docker service.

Before declaring ACC production-ready, reconcile code, manifest, native host entry, browser settings client, README, [architecture](ARCHITECTURE.md), [environment](ENVIRONMENT.md), and [runbook](RUNBOOK.md). The confirmed user-facing contract is: install in the intended DSH profile; appear in Plugins; open the native settings page; persist toggles; display read-only executable/project readiness; run enabled corrections on a real disposable edit; record those operations in AutoCorrect; report diagnostics back to the agent; and exercise Git hygiene separately. ACC uses an owned durable session event for its tab rather than altering `tool/result`; native nested Chat/Trajectory children and a post-execute metadata patch remain upstream platform requirements. CI and packed-package import tests prove packaging, **not** Web settings mounting or live agent behavior. Missing pieces remain explicit rather than silently treated as finished. Prefer native DSH plugin/UI seams; any new custom integration requires an audit and human approval.

## Project reference

| Question | Authoritative source |
| --- | --- |
| How does ACC work? | [Architecture](ARCHITECTURE.md) |
| Which environments and tools does it support? | [Environment](ENVIRONMENT.md) |
| How do I install, operate, and recover it? | [Runbook](RUNBOOK.md) |
| Which versions, dependencies, and commands are declared? | [Package manifest](package.json) |
| How do I contribute? | [Contributing](CONTRIBUTING.md) |
| What should a future ACC change avoid repeating? | [All-plugin lessons learned](https://github.com/l00p3rl00p/quatrus-scratchpad/blob/main/plugins/plugin-lessons.md) |
| What is the original project and license? | [Attribution](ATTRIBUTION.md) · [MIT license](LICENSE) |

## License and attribution

MIT; original attribution to [dsh-lens-lite](https://github.com/ben7am1n/dsh-lens-lite) is preserved. See [LICENSE](LICENSE) and the upstream project for original copyright and license terms.

<div align="center"><sub>ACC · Native DeepSeek Harness code correction and verification</sub></div>
