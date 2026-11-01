# ACC — Environment

**Authority:** Deployment and file layouts differ by host. ACC's own tool discovery and launch behavior are in `src/`; package compatibility and plugins are declared in `package.json` / `cordis.patch.yml`. The QDev Docker Compose repository owns QDev environment installation, volumes and executable provision; this repository must not duplicate or modify that deployment.

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
| Compiled output paths | [`tsdown.config.ts`](tsdown.config.ts) | `src/index.ts` → `lib/index.js`, `src/cli.ts` → `lib/cli.js`, `src/client/index.tsx` → `lib/client.js` |
| Packaging and cross-repo verification environment | [`.github/workflows/ci.yml`](.github/workflows/ci.yml) | GitHub Actions secret `ACC_QDOCKER_READ_TOKEN`; job environment `ACC_DOCKER_INSTALLER`; read-only checkout path `.acc-docker-source/stacks/llm-runtime/install-code-and-quality.sh` |
| Optional project-local hygiene selection | [`src/cli.ts`](src/cli.ts) | `<project-root>/.acc-hygiene.json` with JSON `enabled` object of capability IDs and boolean values; **not** a checked-in default file |
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



## Harness and host separation

ACC must run within the existing DSH plugin lifecycle; it should not create a standalone Harness, overwrite the QDev Code-and-Quality tool volume, or add Docker services merely to make a language tool available. Use the existing executable path or `ACC_TOOL_PATHS`; record profile-specific overrides through DSH's native config mechanism. Ensure any path used in Docker resolves **inside** the Harness container, not just on the Mac host.

For a normal local checkout, discovery uses that host's PATH/project executables. For QDev, the code-quality volume is read-only and installed by the QDev repository; build artifacts and ACC's own package belong outside that mount.


## Three settings groups — exact lookup and persistence boundaries

| Group | Exact implementation | Native setting/trigger | Runtime boundary |
|---|---|---|---|
| Auto-Correct | `src/index.ts`, `cordis.patch.yml`, `src/capabilities.ts` | `config.languages`, `config.capabilities`, `config.fixers`, `config.checkers`, `config.tools` on `tools/post-execute` | Only enabled matching edited-file pipeline executes |
| Language Servers | `src/index.ts`, `src/client/index.tsx` | `config.languageServers`, `config.languages`, `config.capabilities`, `config.executables`; native `dsh-lsp-stdio` and `dsh-lsp-actions` | Disabled language or server must not be started |
| Code Hygiene | `src/cli.ts`, `src/client/index.tsx` | UI writes `config.capabilities` via DSH ConfigForms; separate Git hook invokes `acc-tools hygiene` and reads `<project-root>/.acc-hygiene.json` | **Current gap:** UI Code Hygiene switches are not yet consumed by the Git hook. Hook opt-in via `acc-tools hooks install`. |

**Persistent native DSH settings:** `src/client/index.tsx` calls `configForms.get('auto-code-correct')` and `scope.mutate` for the active Cordis entry. `src/commands.ts` uses `configEditor.edit` for `/acc link`; the authoritative settings are the active DSH profile, not a second project file. Persistence after restart still requires a real DSH test.

**Separate local artifacts:** `ACC_HOME` (default `~/.config/dsh-auto-code-correct`) owns `owned-tools.json` for tools installed by ACC; `<project-root>/.acc-hygiene.json` is the **current** Git CLI's optional selection file. Neither substitutes for native profile configuration. Reconciliation is needed to satisfy the one-configuration design intent.

**Git hook exact paths and flags:** `src/cli.ts` uses `git rev-parse --absolute-git-dir` and writes `<returned-git-dir>/hooks/pre-commit`; refuses existing hook or configured `git config --get core.hooksPath`. Its default commands come from `src/cli.ts`, **not** `hooks.json` or `check.sh` (both deprecated experiments). Exact command flags are listed in [RUNBOOK.md](RUNBOOK.md#event-b--git-pre-commit-checks-opt-in-installation).

**Configured language defaults and command lines:** `cordis.patch.yml` has `config.languages.python: true`, `rust: false`, `typescript: false`; it declares all three language pipelines but disabled languages do not execute. For the complete exact `argv` values, consult [ARCHITECTURE.md](ARCHITECTURE.md#language-specific-post-edit-pipeline--exact-intended-sequence) and `cordis.patch.yml`.
