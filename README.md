# dsh-auto-code-correct (ACC)

Native DeepSeek Harness Cordis plugin for automatic code correction and verification, derived from the MIT-licensed [dsh-lens-lite](https://github.com/ben7am1n/dsh-lens-lite).

## Integration

The native implementation is in `src/index.ts`, registered on `tools/post-execute`. It uses the harness `ctx.subprocess` provider and returns remaining diagnostics as model-visible `additionalContexts` in the same tool result. The plugin package and example native profile patch are `package.json` and `cordis.patch.yml`.

**The old `hooks.json` and `check.sh` are superseded legacy experiments, not the installation method.** Do not install the third-party `dsh-plugin-hooks` for ACC.

## Execution

For successful native `write`, `edit`, and `str_replace_editor` operations, ACC resolves the actual path from the tool result (falling back to `file_path`), runs matching configured fixers in order, then runs read-only verifiers concurrently. Python defaults use Ruff fix, Ruff format, Ruff check, and ty; Rust defaults use rustfmt; shell defaults use ShellCheck. Commands are invoked without shell interpretation.

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
