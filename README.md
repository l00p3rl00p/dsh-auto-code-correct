# dsh-auto-code-correct (ACC)

Native DeepSeek Harness Cordis plugin for automatic code correction and verification, derived from the MIT-licensed [dsh-lens-lite](https://github.com/ben7am1n/dsh-lens-lite).

## Integration

The native implementation is in `src/index.ts`, registered on `tools/post-execute`. It uses the harness `ctx.subprocess` provider and returns remaining diagnostics as model-visible `additionalContexts` in the same tool result. The plugin package and example native profile patch are `package.json` and `cordis.patch.yml`.

**The old `hooks.json` and `check.sh` are superseded legacy experiments, not the installation method.** Do not install the third-party `dsh-plugin-hooks` for ACC.

## Execution

For successful native `write`, `edit`, and `str_replace_editor` operations, ACC resolves the actual path from the tool result (falling back to `file_path`), runs matching configured fixers in order, then runs read-only verifiers concurrently. Python defaults use Ruff fix, Ruff format, Ruff check, and ty; Rust defaults use rustfmt; shell defaults use ShellCheck. Commands are invoked without shell interpretation.

## Current implementation boundary

The native plugin source and configuration are committed, but have **not yet been compiled or exercised inside DeepSeek Harness**. The initial implementation inherits Lite's one-path-per-tool-result behavior; the separately developed file-set planner has not yet been integrated into the native plugin. Multi-file batching across separate tool calls is not implemented. Rustfmt's edition is an example and should follow the repository's configuration. Tools and files must be accessible from the actual harness runtime. Do not claim inaccessible files were corrected.

## Validation needed

Run `pnpm install --ignore-workspace`, `pnpm run typecheck`, `pnpm test`, and `pnpm run build` in a working environment with the declared dependencies. Then test real harness write/edit results and verify that corrected file contents and remaining findings reach the agent. The source has not yet passed these integration tests.

## License

MIT, preserving attribution to dsh-lens-lite. See upstream for original copyright and license terms.
