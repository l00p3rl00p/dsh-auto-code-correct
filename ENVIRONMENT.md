# ACC — Environment

**Authority:** Deployment and file layouts differ by host. ACC's own tool discovery and launch behavior are in `src/`; package compatibility and plugins are declared in `package.json` / `cordis.patch.yml`. The QDev Docker Compose repository owns QDev environment installation, volumes and executable provision; this repository must not duplicate or modify that deployment.

## Web loader, installed package, and recovery scope

The Scratchpad checkout at `/home/qdev/scratchpad/plugins/dsh-auto-code-correct` is a source/build location **when that mount exists**, not DSH's installed profile package. The actual installed dependency is managed by `dsh plugin --profile web` inside `$DSH_HOME/profiles/web` (normally `/home/qdev/.dsh/profiles/web`). The DSH CLI forwards package operations to pnpm in the chosen profile, and plugin bundle activation requires restarting the Web process. Inspect the live profile/configuration rather than assuming the source and installed package are identical. <https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/cli/reference/README.md>

The client bundle uses the native DSH browser ModuleLoader, which does not resolve arbitrary Node dependencies. `tsdown.config.ts` must bundle unsupported imports and `scripts/check-package.mjs` is the CI packaging safeguard. See [shared safety lessons](https://github.com/l00p3rl00p/quatrus-scratchpad/blob/main/plugins/plugin-lessons.md) and [emergency recovery](RUNBOOK.md#emergency-recovery--bad-web-plugin). Do not remove all DSH profiles or the container to recover one plugin.

**ACC readiness lifecycle (v0.1.9):** `src/client/index.tsx` mounts `TYPERT_REMOTE` and creates a child `ctx.inject(... 'remote.accReadiness' ...)` scope before accessing `scope.remote.accReadiness.snapshot`. The Host readiness service is defined in `src/readiness-service.ts`. `remote.accReadiness` is **not** a parent-level injection requirement; declaring it on the parent would block creation of its own service. Verify actual installed UI load and Refresh separately from package compilation. See [single plugin lessons authority](https://github.com/l00p3rl00p/quatrus-scratchpad/blob/main/plugins/plugin-lessons.md).

## Exact source files, settings and flags

These are **literal repository-relative paths and identifiers**, not shorthand names or inferred host locations. Open the linked file to inspect the authoritative setting. Runtime filesystem locations below are defaults or paths documented by the upstream deployment, **not** a claim that every machine uses them.

| What to inspect | Exact source file | Exact key, flag, or entry |
|---|---|---|
| Native plugin registration and default enabled languages | [`cordis.patch.yml`](cordis.patch.yml) | `insert[].id: auto-code-correct`; `config.tools`, `config.languages.python`, `config.languages.rust`, `config.languages.typescript`, `config.capabilities`, `config.fixers`, `config.checkers`, `config.maxDiagnosticChars` |
| Valid plugin config schema, optional overrides, LSP defaults | [`src/index.ts`](src/index.ts) | `Config.languages`, `Config.capabilities`, `Config.languageServers`, `Config.executables`, `Config.tools`, `Config.fixers`, `Config.checkers`, `Config.maxDiagnosticChars` |
| Individual checker fields, command arguments and timeouts | [`src/index.ts`](src/index.ts) | `name`, `extensions`, `argv`, `cwd`, `timeoutMs` (default `30000`), `graceMs` (default `2000`), `maxOutputBytes` (default `65536`), `cleanExitCodes` (default `[0]`), `streams` (default `['stdout','stderr']`); supported `argv` substitutions: `{file}`, `{relFile}`, `{dir}` |
| Actual capability identifiers and executable mappings | [`src/capabilities.ts`](src/capabilities.ts) | `CAPABILITIES[].id`, `CAPABILITIES[].executable`, `CAPABILITIES[].language`, `CAPABILITIES[].group` (do **not** assume a capability ID equals an executable filename) |
| Executable resolution and search order | [`src/discovery.ts`](src/discovery.ts) | `FindOptions.explicit`, `FindOptions.prefix`, `FindOptions.cwd`, `FindOptions.toolDirectories`, `FindOptions.path`; `ACC_TOOL_PATHS` and `PATH` |
| Command-line tool manager, installation ownership | [`src/cli.ts`](src/cli.ts) | `ACC_HOME`; `acc-tools list`, `status`, `find`, `install`, `uninstall`, `hooks install`, `hygiene`; `--prefix DIR` on supported CLI actions |
| DSH chat command and config editor | [`src/commands.ts`](src/commands.ts) | `/acc status`, `/acc install`, `/acc uninstall`, `/acc link`; `/acc link` writes the `executables[executable]` config field through the native editor |
| Package, dependency and script version authority | [`package.json`](package.json) | `engines.node`, `engines.dsh`, `dependencies`, `peerDependencies`, `devDependencies`, `scripts.verify`, `scripts.packcheck`, `dsh.bundle.patch`, `bin.acc-tools` |
| Compiled output paths | [`tsdown.config.ts`](tsdown.config.ts) | `src/index.ts` → `lib/index.js`, `src/cli.ts` → `lib/cli.js`, `src/client/index.tsx` + `src/client/autocorrect-view.tsx` → `lib/client.js` |
| Packaging and cross-repo verification environment | [`.github/workflows/dsh-auto-code-correct-package.yml`](.github/workflows/dsh-auto-code-correct-package.yml), [`.github/workflows/ci.yml`](.github/workflows/ci.yml) | Root workflow builds, clean-profile installs, and uploads the versioned `.tgz`; package-local workflow additionally supports standalone extraction. The optional cross-repo check uses `ACC_QDOCKER_READ_TOKEN`, `ACC_DOCKER_INSTALLER`, and `.acc-docker-source/stacks/llm-runtime/install-code-and-quality.sh`. |
| Generated Git hygiene projection (not user-editable) | [`src/hygiene-hook.ts`](src/hygiene-hook.ts), [`src/cli.ts`](src/cli.ts) | `<git-dir>/acc-hygiene-effective.json` with JSON `enabled` boolean and `checks` capability IDs; generated from native DSH `hygieneEnabled` / `capabilities` settings |
| Historical, **inactive** installation experiments | [`hooks.json`](hooks.json), [`check.sh`](check.sh) | Legacy `hooks[].event: post-tool` and `DSH_HOME` fallback in `check.sh`; **not** the Cordis plugin install mechanism |

### Exact runtime environment variables and resolved locations

| Variable / flag | Defined or consumed at | Meaning and exact behavior |
|---|---|---|
| `ACC_TOOL_PATHS` | `src/discovery.ts` | Optional additional tool directories; separated by the operating system's path delimiter (`:` on macOS/Linux, `;` on Windows). Each entry is searched directly and under `bin/`, `node_modules/.bin/`, and `rust/cargo/bin/`. |
| `ACC_TOOL_ROOT` | `src/index.ts` | Optional tool prefix for the plugin's LSP executable resolution; under it discovery searches `bin/`, `node_modules/.bin/`, `rust/cargo/bin/`. This is **not** the same setting as `ACC_TOOL_PATHS`. |
| `ACC_HOME` | `src/cli.ts` | Tool-manager state root. Default: `~/.config/dsh-auto-code-correct`; ownership ledger: `<ACC_HOME>/owned-tools.json` (written with mode `0600`). |
| `PATH` | `src/discovery.ts` | Final executable lookup source after the explicit path, tool prefix, project-local `node_modules/.bin/`, and configured search directories. |
| `--prefix DIR` | `src/cli.ts` | Tool-manager install/search prefix for applicable `acc-tools` operations; defaults to `ACC_HOME`. Do not point it at a read-only shared mount. |
| `ACC_QDOCKER_READ_TOKEN` | `.github/workflows/ci.yml` | Optional GitHub Actions repository secret for reading the private QDev installer in CI. Its absence skips the authoritative cross-repo checkout and prints a warning. |
| `ACC_DOCKER_INSTALLER` | `.github/workflows/ci.yml` → tests | CI test input set to `.acc-docker-source/stacks/llm-runtime/install-code-and-quality.sh` when the read token is available; otherwise empty. |
| `DSH_HOME` | `.github/workflows/ci.yml`; historical `check.sh` | CI overrides the DSH home for clean-profile testing. The older hook script also reads it, but that legacy script is **not active** in native ACC. |

### Exact QDev host/container distinction

The **QDev deployment's** file and volume authority is [`l00p3rl00p/qdocker-compose`](https://github.com/l00p3rl00p/qdocker-compose), not this plugin repository. Relevant existing source is [`stacks/llm-runtime/install-code-and-quality.sh`](https://github.com/l00p3rl00p/qdocker-compose/blob/main/stacks/llm-runtime/install-code-and-quality.sh); consult the deployment's `ENVIRONMENT.md` and Compose files for the current host mount and container PATH. The existing convention described for the Harness is a read-only tool volume rooted at `/home/qdev/llm-runtime`; don't assume its Mac host path equals that container path.

Use `acc-tools status <capability-id>` or `acc-tools find <capability-id>` **inside the running environment** to inspect the executable path actually resolved. A path from the Mac is not automatically an executable path inside Docker.

## Portable tool discovery and two-way Docker reconciliation

ACC is **not tied to QDev's Docker filesystem**. It searches in this order: explicit executable path, ACC-managed install prefix, project-local Node binaries, optional user-provided tool directories (`ACC_TOOL_PATHS`, separated using the OS path delimiter), and the running Harness PATH. It probes only enabled language servers and only runs the fix/check tools for enabled languages. Disabled languages require no installation.

The DSH human command `/acc status <capability-id>` reports whether a tool is available. `/acc link <capability-id> /absolute/path/to/executable` validates an existing executable and saves it to the plugin's `executables` config via DSH's **native configuration editor**. This is a link in configuration, not a symlink or another software installation. `/acc install <capability-id> [destination]` is for tools genuinely missing; installing into a mounted read-only location is not supported. `/acc uninstall <capability-id>` retains tools not owned by ACC. The command UI is the supported mechanism pending integration of equivalent action buttons in the web settings panel.

For example, on the intended QDev Docker setup the following are installed in its helper volume and made available on PATH: Ruff, ty, cargo, rustfmt, Clippy, rust-analyzer, ESLint, Prettier, tsc, TypeScript Language Server, ShellCheck, and Gitleaks. ACC now accounts for **all twelve executables**. Git is an underlying system command, not one of the independently installed Code-and-Quality helpers.

**Reverse reconciliation:** ACC's optional `license-audit` requires `license-checker`, which is *not* installed by the QDev Code-and-Quality installer. `dependency-audit` runs `npm audit` using npm supplied with Node, not a separate security package; the historical secret scan reuses Gitleaks. These are **optional** and do not justify expanding the Docker base install. No additional formatter, typechecker, or LSP is required by ACC's default Python/Rust/TypeScript scope.

GitHub Actions checks ACC's capability registry against a read-only checkout of the **real** QDev installer script, rather than copying source files into ACC. It does not edit or run that installer. The cross-repo test establishes declared-tool coverage; the separate QDev Docker CI checks live executable availability inside the Harness container. A real local Harness session still needs to exercise the native plugin hooks.

### Installation examples

```sh
# Discover existing commands using your current Harness PATH and project:
acc-tools list
acc-tools find ruff-fix

# If a tool exists outside PATH, link rather than reinstall:
# From the DSH chat command surface:
/acc link ruff-fix /absolute/path/to/ruff

# Or give ACC a searchable tools directory when starting the Harness:
export ACC_TOOL_PATHS=/path/to/existing/tools/bin
```



## Delivered component map

| Component | Entry | Loaded by | Purpose |
|---|---|---|---|
| Host plugin | `lib/index.js` | Cordis Host bundle | Correction, diagnostics, LSP routing, and metadata enrichment |
| Web settings | `lib/client.js` from `src/client/index.tsx` | Immediate `dsh.client` Web injection | Native ConfigForms settings page |
| Web results view | `lib/client.js` from `src/client/autocorrect-view.tsx` | Immediate client load, then `conversation.view` registration | Always-visible AutoCorrect session tab |
| CLI | `lib/cli.js` | `acc-tools` binary and generated Git hook | Tool discovery, linking, hygiene, hook synchronization |
| Cordis patch | `cordis.patch.yml` | Bundle loader | Native registration and profile defaults |

## Host plugin versus Web client plugin

ACC has **two distinct deliverables** in one DSH package: the host plugin (`lib/index.js`) and the Web client (`lib/client.js`), which contains both the settings page and the session-scoped **AutoCorrect** conversation tab. The client is declared in `package.json` under `dsh.client` with immediate Web loading and built from `src/client/index.tsx`. Its client entry explicitly injects `slots`, `configForms`, and `uiConversation`: the last service owns conversation-view registration. It registers the DSH-native `plugins.bundle.config` UI slot and binds the active `auto-code-correct` namespace directly through `configForms.get(...)`; bundle detail slots provide the page view but do not supply a row-style form prop. The UI is expected under **Plugins → Installed → dsh-auto-code-correct**, not in a standalone Docker window or the general built-in settings.

Check both surfaces independently: `dsh --profile web --dump-config` for host configuration and the actual DSH Web plugin detail page for the client. A missing UI is a client injection/registration/loader failure, not proof that the host entry is absent. A visible UI is not proof that ACC's post-edit and Git hygiene actions fire. Follow [RUNBOOK.md](RUNBOOK.md#prove-the-acc-settings-window-is-present) for the full acceptance procedure.

## Native LSP package dependency chain

ACC imports `@deepseek-ai/dsh-lsp-stdio` at module load. That provider imports `@deepseek-ai/dsh-lsp`. **Both** are external DSH peer dependencies, so compiling ACC or installing only `dsh-lsp-stdio` does not prove that ACC can load. The active DSH profile must resolve both at a mutually compatible version, using the DSH runtime's selected version as the authority. QDev's `stacks/harness/start-harness.sh` installs/repairs those profile dependencies *before* starting Web, preserving saved profile credentials and application state.

Check runtime loading **after DSH starts its native profile resolver**: it supplies installation-owned runtime packages (including `@deepseek-ai/cordis`) that a standalone pre-boot import cannot resolve. Inspect the real DSH startup diagnostics for plugin import errors; merely checking `package.json` versions is insufficient. Independent development-only versions in ACC's `devDependencies` support verification and are not independent deployment pins. The exact compatibility contract lives in `peerDependencies`.

## Harness and host separation

ACC must run within the existing DSH plugin lifecycle; it should not create a standalone Harness, overwrite the QDev Code-and-Quality tool volume, or add Docker services merely to make a language tool available. Use the existing executable path or `ACC_TOOL_PATHS`; record profile-specific overrides through DSH's native config mechanism. Ensure any path used in Docker resolves **inside** the Harness container, not just on the Mac host.

For a normal local checkout, discovery uses that host's PATH/project executables. For QDev, the code-quality volume is read-only and installed by the QDev repository; build artifacts and ACC's own package belong outside that mount.


## Three settings groups — exact lookup and persistence boundaries

| Group | Exact implementation | Native setting/trigger | Runtime boundary |
|---|---|---|---|
| Auto-Correct | `src/index.ts`, `src/operation-record.ts`, `cordis.patch.yml`, `src/capabilities.ts` | `config.languages`, `config.capabilities`, `config.fixers`, `config.checkers`, `config.tools` on `tools/execute`; durable `tool/result.meta.autoCodeCorrect` | Only enabled matching edited-file pipeline executes; completed results appear in AutoCorrect |
| Language Servers | `src/index.ts`, `src/client/index.tsx` | `config.languageServers`, `config.languages`, `config.capabilities`, `config.executables`; native `dsh-lsp-stdio` and `dsh-lsp-actions` | Disabled language or server must not be started |
| Code Hygiene | `src/hygiene-hook.ts`, `src/cli.ts`, `src/client/index.tsx` | Native `config.hygieneEnabled` and `config.capabilities` are projected to `<git-dir>/acc-hygiene-effective.json`; installed Git pre-commit hook invokes `acc-tools hygiene` | On by default: `git-diff`, `gitleaks`, `shellcheck`; setting off skips all automatic hook checks. Changes propagate on ACC activation or next successful edit. |

**Persistent native DSH settings:** `src/client/index.tsx` calls `configForms.get('auto-code-correct')` and `scope.mutate` for the active Cordis entry. `src/commands.ts` uses `configEditor.edit` for `/acc link`; the authoritative settings are the active DSH profile, not a second project file. Persistence after restart still requires a real DSH test.

**Separate local artifacts:** `ACC_HOME` (default `~/.config/dsh-auto-code-correct`) owns `owned-tools.json` for ACC-managed tool ownership; `<git-dir>/acc-hygiene-effective.json` is a generated projection of native ACC settings for the local Git hook, **not** a second editable settings file. No project `.acc-hygiene.json` selection is required.

**Git hook exact paths and flags:** `src/hygiene-hook.ts` uses `git rev-parse --show-toplevel`, `git rev-parse --absolute-git-dir`, and `git config --get core.hooksPath` to locate the effective Git hook directory; manages `pre-commit` without deleting existing hook content. The installed hook runs `acc-tools hygiene` when available or the packaged Node CLI path otherwise. Existing `hooks.json` and `check.sh` are inactive. Exact command flags are in [RUNBOOK.md](RUNBOOK.md#event-b--git-pre-commit-checks-default-on).

**Configured language defaults and command lines:** `cordis.patch.yml` has `config.languages.python: true`, `rust: false`, `typescript: false`; it declares all three language pipelines but disabled languages do not execute. For the complete exact `argv` values, consult [ARCHITECTURE.md](ARCHITECTURE.md#language-specific-post-edit-pipeline--exact-intended-sequence) and `cordis.patch.yml`.
