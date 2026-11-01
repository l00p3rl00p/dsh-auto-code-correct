# dsh-auto-code-correct (ACC)

Native DeepSeek Harness Cordis plugin for automatic code correction and verification, derived from the MIT-licensed [dsh-lens-lite](https://github.com/ben7am1n/dsh-lens-lite).

## Quick Start

Requirements: an existing DeepSeek Harness profile compatible with the engine range declared in [package.json](package.json), Node and pnpm, and the relevant code-quality tools for the languages you enable. ACC uses your existing tools where available; it does not require a new Docker service.

```sh
pnpm install --no-frozen-lockfile
pnpm run verify
mkdir -p dist
pnpm pack --pack-destination dist
dsh plugin --profile web add ./dist/dsh-auto-code-correct-0.1.0.tgz
dsh --profile web --dump-config
```

In a DSH chat, run `/acc status <capability-id>` to check a tool. Use `/acc link <capability-id> /absolute/path/to/executable` to point to an existing executable rather than reinstalling it. For a Docker deployment, inspect [ENVIRONMENT.md](ENVIRONMENT.md) before installation.

## Documentation and authority

- [ARCHITECTURE.md](ARCHITECTURE.md) — the plugin's mechanism, runtime behavior, LSP reuse, and implementation boundaries.
- [ENVIRONMENT.md](ENVIRONMENT.md) — supported environment assumptions, existing tool discovery and Docker coexistence.
- [RUNBOOK.md](RUNBOOK.md) — repeatable install, build, verification, operator commands and troubleshooting.
- **Authoritative executable configuration, not another Markdown document:** [package.json](package.json) (scripts, versions, dependencies, bundle manifest), [cordis.patch.yml](cordis.patch.yml) (native Cordis registration/default settings), and source code under `src/`. If prose disagrees with actual configuration or source, correct the prose; do not introduce a parallel version matrix.

Do not create new Markdown files for routine decisions or experiments: revise the correct existing authority. Preserve older experimental `hooks.json` and `check.sh` as legacy only; they are not installation interfaces.

## License

MIT, preserving attribution to dsh-lens-lite. See upstream for original copyright and license terms.


## Behavior at a glance

ACC has **one plugin with three groups**: **Auto-Correct**, **Language Servers**, and **Code Hygiene**. After an enabled successful code edit it automatically runs the matching Python, Rust or TypeScript correction-and-verification pipeline and surfaces remaining diagnostics to the agent. Language servers use native DSH/LSP extensions and respect on/off switches. Git hygiene runs **at the Git boundary**, not after each edit, and is enabled by default: ACC creates/chains the native pre-commit hook for repositories it edits. Disable it with `hygieneEnabled: false` in the DSH plugin settings.

The complete [implementation contract, architecture diagrams, language matrix and known delivery gaps](ARCHITECTURE.md#implementation-contract--restored-from-acc-design-decisions-2026-11-01) are in `ARCHITECTURE.md`. The [two-event verification procedure](RUNBOOK.md#two-independent-event-acceptance-tests) is in `RUNBOOK.md`; exact setting/file flags are in `ENVIRONMENT.md`. The native DSH profile is the configuration authority; a generated policy in the repository Git directory supplies the same effective toggles to the Git hook. Live Docker/profile-restart verification is still required.
