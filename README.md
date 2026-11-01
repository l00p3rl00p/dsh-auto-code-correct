# dsh-auto-code-correct (ACC)

Native DeepSeek Harness Cordis plugin for automatic code correction and verification, derived from the MIT-licensed [dsh-lens-lite](https://github.com/ben7am1n/dsh-lens-lite).

## Integration

The native implementation is in `src/index.ts`, registered on `tools/post-execute`. It uses the harness `ctx.subprocess` provider and returns remaining diagnostics as model-visible `additionalContexts` in the same tool result. The plugin package and example native profile patch are `package.json` and `cordis.patch.yml`.

**The old `hooks.json` and `check.sh` are superseded legacy experiments, not the installation method.** Do not install the third-party `dsh-plugin-hooks` for ACC.

## Execution

For successful native `write`, `edit`, and `str_replace_editor` operations, ACC resolves the actual path from the tool result (falling back to `file_path`), runs matching configured fixers in order, then runs read-only verifiers concurrently. Python defaults use Ruff fix, Ruff format, Ruff check, and ty; Rust defaults use rustfmt; shell defaults use ShellCheck. Commands are invoked without shell interpretation.

## Reused LSP actions and QDev toolchain

ACC uses the existing Apache-2.0 [dsh-lsp-actions](https://github.com/PerryLink/dsh-lsp-actions) at pinned version `0.5.17` as an ordinary package dependency. **It is one generic plugin for multiple language servers**, not one TypeScript-only language server. ACC uses its native Cordis registration instead of copying its LSP client. The provider supplies diagnostics, formatting, code actions, completion, symbols, inlay hints, signature help, and rename. DSH's own `dsh-lsp`/`dsh-lsp-stdio`/`dsh-tool-lsp` keep their four read-only navigation operations.

| Language | Existing command | Arguments | File extensions |
|---|---|---|---|
| Python | `ty` | `server` | `.py` |
| Rust | `rust-analyzer` | none | `.rs` |
| TypeScript | `typescript-language-server` | `--stdio` | `.ts`, `.tsx` |

This matches the real Docker deployment's Code-and-Quality tools installed by `l00p3rl00p/qdocker-compose/stacks/llm-runtime/install-code-and-quality.sh`, mounted read-only at `/home/qdev/llm-runtime`, with `tools/bin` and `tools/rust/cargo/bin` on the Harness PATH. **Do not run installation scripts or attempt to write inside the mounted toolchain.** The plugin resolves existing executables first. No Python, Rust, or TypeScript language server is launched for a disabled language. Enabled servers start on demand when called, and are reused per workspace.

The upstream LSP-actions dependency has its own tests for TypeScript, routing, formatting, cancellation, and sandbox/permission handling. ACC's tests exercise upstream routing for all three languages and preserve the DSH tool registry's existing action definitions when already registered. The upstream project exposes subprocess and filesystem authority; it is not sandboxed on its own. Source/compatibility review does **not** replace a live Docker Harness integration test.

This dependency is version-pinned; it is not a fork and no upstream LSP source has been copied. The connected GitHub tooling in this session does not expose repository forking. Fork only if a demonstrated defect requires an approved downstream change.

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

## Install and build

DeepSeek Harness officially supports bundle plugins with `dsh.bundle.patch`. ACC exports a Cordis `apply(ctx, config)` function and uses the native `tools/post-execute` event. This package builds with pnpm and tsdown.

The GitHub Actions workflow installs dependencies, checks ESLint, Prettier, TypeScript, tests, builds, and creates a `.tgz` package artifact. A passing run is required before treating the artifact as verified.

For a local checkout:

```sh
pnpm install --no-frozen-lockfile
pnpm run typecheck
pnpm test
pnpm run build
mkdir -p dist
pnpm pack --pack-destination dist
dsh plugin --profile web add ./dist/dsh-auto-code-correct-0.1.0.tgz
dsh --profile web --dump-config
```

For a GitHub source installation, the package's `prepare` script builds the plugin. pnpm 10 may require explicit permission for this package's build script in the profile's `pnpm-workspace.yaml` (`allowBuilds: { dsh-auto-code-correct: true }`). Prefer the prebuilt tarball if build permission is unwanted. Only install from trusted, pinned sources.

## Default behavior and configuration choices

ACC runs only after successful configured file-edit tools, selected by extension:

- Python: Ruff fix, Ruff format, Ruff verification, ty.
- Rust: rustfmt, Clippy fix, cargo check, Clippy verification. Clippy fix is project-scoped and can modify additional files. Remove `clippy-fix` from the profile override to disable it.
- TypeScript/TSX: ESLint fix, Prettier format, ESLint verification, TypeScript compiler verification. ESLint and TypeScript project configuration must exist in the target workspace.
- Shell: ShellCheck verification.

The plugin does not launch language servers; they remain editor services. No unrelated language pipeline runs on an edit.

**Profile customization:** override the `auto-code-correct` row in the profile's `cordis.patch.yml`, restating its full `config` (DSH replaces whole config rows). The `fixers` and `checkers` arrays determine which operations run; remove entries to disable them. `tools` selects edit-tool names and `maxDiagnosticChars` caps agent-visible output.

## Current implementation boundary

The repository changes have not been confirmed by a passing GitHub Actions build or a live DSH installation in this session. The plugin processes one file path per edit-tool result; it does not yet batch across tool calls. Project root discovery is based on nearest Cargo.toml for Rust and nearest tsconfig.json or package.json for TypeScript. These behaviors still need end-to-end integration testing. Do not claim inaccessible files were corrected.

## License

MIT, preserving attribution to dsh-lens-lite. See upstream for original copyright and license terms.
