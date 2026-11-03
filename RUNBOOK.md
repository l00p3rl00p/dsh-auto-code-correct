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


## Completion and verification boundaries

This is the operational contract for the standalone ACC programming plugin. The separate SOUP drift plugin is documented in [Quatrus Scratchpad](https://github.com/l00p3rl00p/quatrus-scratchpad/tree/main/plugins/qdev-soup-drift). Neither plugin requires the other, and model choice (local or frontier) is an independent DSH configuration decision. Keep source/package changes and their corresponding README, architecture, environment, and runbook instructions synchronized **within this repository**. Do not mirror ACC implementation into Scratchpad.

The operator must confirm three independent outcomes: native Host registration, browser-side plugin settings that actually mount and persist, and actual ACC execution on a disposable edit (plus a separate Git hook check). A missing settings window is a real product defect, not a successful install. The tests below are the acceptance procedure, not a claim that a particular user's live Harness has already passed.

## Installing without GitHub inside Docker

If the checkout is already mounted into DSH, build and install **locally**, without asking the Harness container to authenticate to GitHub:

```sh
cd /path/to/dsh-auto-code-correct
pnpm install --no-frozen-lockfile
pnpm run verify
mkdir -p dist
pnpm pack --pack-destination dist
dsh plugin --profile web add ./dist/dsh-auto-code-correct-0.1.0.tgz
dsh --profile web --dump-config
```

The path must resolve **inside** the running container. ACC's verified local artifact is the tarball because its multi-entrypoint package contains the Host plugin, a separately bundled Web settings client, CLI, and Cordis patch. This workflow does not require GitHub authentication or SSH rewrites. The QDev-owned startup process remains responsible for ACC's native DSH LSP peer dependencies.

### Prove the ACC settings window is present

After restarting the DSH Web process, open its token-bearing URL (ordinarily http://localhost:3080). Go to **Plugins → Installed → dsh-auto-code-correct** and open the bundle configuration. The client code in `src/client/index.tsx` registers a native `plugins.bundle.config` slot and exposes language toggles, capability controls and Git hygiene. The build includes `lib/client.js`; the package includes `dsh.client.inject` and `dsh.client.platform: web`.

**Acceptance:** the ACC plugin detail renders its configuration page, settings can be changed through native ConfigForms, and the saved value remains after a Web restart. A packaged `lib/client.js` file is not proof that the page was mounted: examine DSH Web client errors and the plugin's client-bundle loader if the page is missing. A plugin appearing in `--dump-config` proves native configuration registration only; it is not a Web UI activation test.

To prove that ACC actually performs its work, run the independent post-edit and Git-hook acceptance tests below in a disposable project. Do not treat a visible settings page as proof that the post-edit pipeline fires.

## Native DSH dependency repair (before first Web launch)

- The ACC entry point loads `@deepseek-ai/dsh-lsp-stdio`, which itself loads `@deepseek-ai/dsh-lsp`. Both must resolve as native profile packages. Install these together in the target profile with `dsh plugin --profile <profile> add`, taking their matching version from the installed DSH release. Do not hardcode an extra independent rc pin or grant an exact-version compatibility exemption.
- In QDev, the Docker-owned startup script handles the native LSP package pair and ACC before running `dsh web`. It preserves `$DSH_HOME` and avoids starting the server temporarily just to install plugins. The ACC repository does not duplicate QDev's Docker installation logic.
- Acceptance is a real native DSH startup with ACC loading successfully and no missing-package exception. Do not separately import ACC *before* DSH boots: DSH's profile resolver first supplies the installation-owned peers (such as `@deepseek-ai/cordis`). An ordinary `pnpm run build` and package-name checks are not proof of correct runtime loading.

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


## Two independent event acceptance tests

See [ARCHITECTURE.md](ARCHITECTURE.md#two-event-architecture) for the full implementation contract, diagram, three-language matrix and the difference between **intended** and **implemented** behavior.

### Event A — automatic DSH post-edit pipeline

1. In an isolated DSH test session with ACC loaded, confirm `auto-code-correct` appears in `dsh --profile web --dump-config`.
2. Inspect effective `config.languages`, `config.capabilities`, `config.fixers`, `config.checkers`, `config.languageServers`, `config.executables` from the profile. The source defaults in `cordis.patch.yml` enable Python only.
3. Execute a **successful** native `write` or `edit` on a disposable `.py` file; observe Ruff fix → Ruff format, then Ruff check and ty. Confirm remaining findings and checker failures appear in the agent's `additionalContexts`.
4. Disable `languages.python`, repeat the edit and establish **no Python fixer/checker or Python LSP starts**; re-enable and test one individual `capabilities['ruff-fix'] = false` switch. Avoid inferring disabled semantics from the UI alone.
5. Separately enable Rust and TypeScript in disposable projects with their actual `Cargo.toml`, `package.json`, `tsconfig.json`, and toolchain. Confirm the exact pipelines in the architecture matrix; avoid Clippy `--fix` on a shared worktree.
6. Test failed edit, missing executable, failed fixer, failed checker, and cancellation. A failed edit must not initiate ACC; a failing fixer must stop further **mutating** fixers; read-only verifier results and failures must remain visible.
7. Restart DSH and confirm saved native settings and enabled/disabled LSP behavior persist. A CI mock cannot substitute for this installed-profile test.

### Event B — Git pre-commit checks (default on)

```sh
# Run from the disposable Git repository where ACC's CLI is available:
acc-tools hygiene git-diff gitleaks shellcheck
# The native DSH plugin installs/chains the Git hook automatically on activation/edit.
# This optional command re-synchronizes it explicitly:
acc-tools hooks install
```

The installed hook resides at the effective Git hooks path (`<git-dir>/hooks/pre-commit` or the configured `core.hooksPath`) and invokes `acc-tools hygiene`. Existing pre-commit content is retained and chained. The hook reads `<git-dir>/acc-hygiene-effective.json`, a generated projection of DSH native settings. Default checks are `git-diff`, `gitleaks`, and `shellcheck`; `large-files`, `dependency-audit`, `license-audit`, and `history-secrets` are optional. A disabled `hygieneEnabled` causes the hook to skip checks.

Exact implemented commands include:
- `git diff --cached --check` for staged whitespace/conflict-marker checks.
- `gitleaks git --pre-commit --staged --redact` for staged secrets.
- `git diff --cached --name-only -z --diff-filter=ACMRT` plus `git ls-files -s` and `git cat-file -s` for staged large-file detection (10 MiB default).
- `git show :<path>` piped to `shellcheck --filename <path> -` for staged `.sh` when selected.
- `npm audit --audit-level=high`, `license-checker --summary`, and `gitleaks git --redact` for explicitly selected optional checks.

Test with a known failure in a disposable repository. The hook should fail the commit and print a diagnostic rather than silently succeeding. Remove the test changes rather than bypassing the hook.

**Single effective configuration:** the DSH native UI sets `hygieneEnabled` and capability toggles. ACC emits the generated policy to the Git directory on plugin activation or a successful edit; `acc-tools hygiene` reads it at commit time. Verify a changed toggle is projected before committing, especially if the agent has not edited a file since the change. Git hooks are machine-local; a Mac-side Git commit cannot use a Docker-only executable path unless `acc-tools` is installed on the host PATH.

### Contract-focused CI and release acceptance

The real workflow is [`.github/workflows/ci.yml`](.github/workflows/ci.yml). Before calling ACC fully implemented, inspect the current workflow run and validate: packaged plugin import, DSH native profile install, Auto-Correct language and capability off/on, LSP on/off and startup, Git hook invocation with staged-data pass/fail, and **persistence** across restart. CI currently defines build, lint, format, typecheck, Vitest and package checks; the complete three-group runtime acceptance sequence has **not** been proven by those declarations alone.

`ACC_QDOCKER_READ_TOKEN` is the exact optional CI secret for the private QDev Code-and-Quality installer checkout. Without it, cross-repository inventory validation is skipped. See [ENVIRONMENT.md](ENVIRONMENT.md) for the exact source paths and environment flags.
