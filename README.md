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
- Behavior at a glance, and the documentation authority rules: [ARCHITECTURE.md](ARCHITECTURE.md)

## License

MIT, preserving attribution to dsh-lens-lite. See upstream for original copyright and license terms.
