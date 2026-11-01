# ACC — Runbook

**Authority:** Actual commands are defined in `package.json`, native settings in `cordis.patch.yml`, and the plugin command handler in `src/`. Consult [ENVIRONMENT.md](ENVIRONMENT.md) for Docker path assumptions and [ARCHITECTURE.md](ARCHITECTURE.md) for behavior.

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


## Operator procedure

1. Confirm the intended DSH profile and access to existing language tools (`/acc status <capability-id>`).
2. Link tools already present (`/acc link <capability-id> /absolute/path/to/executable`); only use `/acc install` for a tool actually absent and into a writable, approved location.
3. Run the repository's `pnpm run verify` before `pnpm pack`; install the resulting pinned plugin package into the intended profile.
4. Inspect `dsh --profile web --dump-config` for the native Cordis plugin. Exercise one enabled language's real `write` or `edit` tool in a disposable test project; check that fixers run and remaining diagnostics enter `additionalContexts`.
5. Check that disabled languages launch no server; verify a read-only mounted toolchain remains unchanged. Test Rust project-scoped Clippy fix only in a disposable/isolated worktree.
6. If checks fail, capture the actual DSH error, enabled capability, resolved executable path and relevant profile config. Distinguish a missing executable from a disabled language, missing project configuration, or runtime/plugin mismatch. Don't invent an additional deployment layer or bypass failed checks.

## Build, CI and release acceptance

```sh
pnpm run lint
pnpm run formatcheck
pnpm run typecheck
pnpm test
pnpm run build
pnpm run packcheck
```

GitHub Actions checks the plugin and declared capability registry; it does not constitute proof that the user's running Docker Harness has loaded ACC. Confirm the workflow and test in the actual Harness environment before claiming end-to-end success. If an optional capability such as `license-audit` is unavailable, report its absent dependency rather than installing a package into the QDev read-only tool volume.

## Existing legacy entry points

`hooks.json` and `check.sh` are historical experiments; don't use either to install or run the native plugin. Don't install third-party `dsh-plugin-hooks` for ACC.
