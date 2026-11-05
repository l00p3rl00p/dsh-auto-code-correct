# ACC — Runbook

**Authority:** Actual commands are defined in `package.json`, native settings in `cordis.patch.yml`, and the plugin command handler in `src/`. Consult [ENVIRONMENT.md](ENVIRONMENT.md) for Docker path assumptions and [ARCHITECTURE.md](ARCHITECTURE.md) for behavior.

## Emergency recovery — bad Web plugin

**This procedure works without DSH's browser UI.** A bad client module can prevent the entire Web shell from starting, so keep the CLI escape available. It does not require rebuilding the QDev image or clearing DSH data.

From the Mac, if ACC makes Web unusable:

```sh
docker exec -it quatrus-harness-deepseek-harness bash -lc 'dsh plugin --profile web remove dsh-auto-code-correct'
docker restart quatrus-harness-deepseek-harness
```

The native `dsh plugin` command forwards to the target profile's pnpm package manager. It removes the **installed dependency**; if an explicit manually maintained Cordis patch still inserts ACC, the corresponding insertion must also be removed from the actual profile/home configuration before restarting. Diagnose with `dsh --profile web --dump-config` and inspect `$DSH_HOME/profiles/web/cordis.patch.yml` or `$DSH_HOME/cordis.patch.yml` **when those files exist**. Remove only the ACC insertion, not other plugin entries, sessions, tokens or profile configuration. See [official DSH CLI reference](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/cli/reference/README.md) and [shared plugin lessons](https://github.com/l00p3rl00p/quatrus-scratchpad/blob/main/plugins/plugin-lessons.md).

## Preferred installation — verified GitHub Actions package into Docker

The [ACC GitHub Actions packager](.github/workflows/dsh-auto-code-correct-package.yml) builds from the tested Git commit, checks unresolved Web imports, smoke-loads the actual Web module, installs the tarball into a clean DSH profile, and uploads an artifact. **Prefer this exact artifact over building or fetching private Git dependencies inside the Docker container.** From an authenticated Mac Terminal:

```sh
set -e
repo="l00p3rl00p/quatrus-scratchpad"
run="42012146720"  # verified 0.1.9 readiness injection fix at commit 0f6fbc9
tmp=$(mktemp -d)
gh run download "$run" -R "$repo" -n dsh-auto-code-correct-plugin-0.1.9 -D "$tmp"
test -f "$tmp/dsh-auto-code-correct-0.1.9.tgz"
docker cp "$tmp/dsh-auto-code-correct-0.1.9.tgz" quatrus-harness-deepseek-harness:/tmp/dsh-auto-code-correct-0.1.9.tgz
docker exec -it quatrus-harness-deepseek-harness bash -lc '
set -euo pipefail
dsh plugin --profile web remove dsh-auto-code-correct
dsh plugin --profile web add /tmp/dsh-auto-code-correct-0.1.9.tgz
cd "${DSH_HOME:-/home/qdev/.dsh}/profiles/web"
node -e "const fs=require(\"node:fs\");const p=require.resolve(\"dsh-auto-code-correct/client\");const s=fs.readFileSync(p,\"utf8\");if(s.includes(\"require(\\\"@deepseek-ai/dsh-typert-protocol/remote-info\\\")\"))process.exit(1);console.log(\"Verified installed browser bundle:\",p)"
dsh --profile web --dump-config >/dev/null
'
docker restart quatrus-harness-deepseek-harness
rm -rf "$tmp"
```

This selectively replaces ACC in the **installed Web profile**, not Scratchpad source and not the Docker image. Re-installing the same package version via an explicit remove/add avoids retained cached package copies. The command stops on build/download/install/validation failures and does not restart a failing plugin installation. Once the container restarts, open DSH Web, confirm the plugin configuration page and AutoCorrect tab load without browser-console ModuleLoader errors, and perform a disposable real edit. A CI loader smoke test cannot prove the mounted React UI or actual DSH session operation.

**Normal Git-source update and install (inside Docker):** fetch the intended branch, build in a detached temporary worktree so uncommitted SOUP/telemetry work is untouched, and install only if the source checks pass. Match the printed revision to the successful GitHub Actions run before promoting to a live Web profile.

```sh
# Invoked from the Mac; fetches the branch to a fresh temporary worktree.
docker exec -it quatrus-harness-deepseek-harness bash -lc '
set -euo pipefail
cd /home/qdev/scratchpad
git fetch origin main
sha=$(git rev-parse origin/main)
echo "Building Git revision: $sha"
worktree=$(mktemp -d /tmp/acc-install.XXXXXX)
git worktree add --detach "$worktree" "$sha"
cleanup() {
  cd /home/qdev/scratchpad || true
  git worktree remove --force "$worktree" 2>/dev/null || true
}
trap cleanup EXIT
cd "$worktree/plugins/dsh-auto-code-correct"
pnpm install --no-frozen-lockfile
pnpm run verify
mkdir -p dist
pnpm pack --pack-destination dist
version=$(node -p "require(\"./package.json\").version")
test -f "dist/dsh-auto-code-correct-$version.tgz"
dsh plugin --profile web add "./dist/dsh-auto-code-correct-$version.tgz"
dsh --profile web --dump-config
'
```

The command builds a **detached clean Git revision** from `origin/main`, not the Scratchpad's active working tree. The temporary worktree is removed after the command; it doesn't modify the original checkout. The printed SHA must match the passing Actions revision. If Git authentication fails inside Docker, refresh the Scratchpad's Git refs from the authenticated host, then rerun this exact command; never substitute an unrelated source or skip verification. Reinstalling a verified tarball updates the profile package, but the running DSH Web process must then be restarted **once**, and its browser module load must be tested. Never restart the entire container repeatedly just to test packaging.

### Confirm installed readiness dashboard (ACC 0.1.9)

After installing the **verified ACC 0.1.9** tarball in the active `web` profile and restarting DSH once, open Plugins → Installed → ACC and inspect **Environment readiness**. The initial check should resolve into a timestamp, project path, and per-tool statuses. Click **Refresh** and verify a new check completes. The error `cannot get property "remote.accReadiness" without inject` is a failure of the native Remote child-scope contract—not missing toolchains. Test both initially and after a browser reload. The source contract is also covered by `scripts/check-package.mjs`, but CI does **not** establish live settings readiness until this installed Web check is observed.

### Browser and package release acceptance

The repository's [GitHub Actions packager](.github/workflows/dsh-auto-code-correct-package.yml) must pass `pnpm run verify`; its package contract checks emitted `lib/client.js` loader identity and unsupported browser `require()` calls, self-tests the scanner against the original broken import, and smoke-executes the emitted client factory under a guarded DSH-style module loader. A passing CI install proves only the Host package resolves. After restart, confirm the Web UI opens without ModuleLoader errors, ACC's plugin configuration renders, toggles persist, and a real disposable edit is recorded in AutoCorrect and diagnostics. When a live browser check is unavailable to CI, **mark browser activation as unverified** rather than claiming end-to-end success.

## Install and build

DeepSeek Harness officially supports bundle plugins with `dsh.bundle.patch`. ACC exports a Cordis `apply(ctx, config)` function, runs its correction pipeline in the native `tools/execute` waterfall, and attaches model feedback in `tools/post-execute`. Its Web client also contributes the native **AutoCorrect** conversation tab. This package builds with pnpm and tsdown.

The root GitHub Actions workflow [`dsh-auto-code-correct-package.yml`](.github/workflows/dsh-auto-code-correct-package.yml) installs dependencies, runs the full verification suite, builds all entrypoints, creates the version-derived `.tgz`, installs that exact tarball into a clean official DSH profile, and uploads it as `dsh-auto-code-correct-plugin-<version>`. The package-local [`ci.yml`](.github/workflows/ci.yml) retains the same checks for a standalone checkout. A passing workflow run is required before treating an artifact as verified.

For a local checkout:

```sh
pnpm install --no-frozen-lockfile
pnpm run typecheck
pnpm test
pnpm run build
mkdir -p dist
pnpm pack --pack-destination dist
dsh plugin --profile web add ./dist/dsh-auto-code-correct-0.1.9.tgz
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
dsh plugin --profile web add ./dist/dsh-auto-code-correct-0.1.9.tgz
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
4. Inspect `dsh --profile web --dump-config` for the native Cordis plugin. Exercise one enabled language's real `write` or `edit` tool in a disposable test project; check that fixers run, remaining diagnostics enter `additionalContexts`, and the **AutoCorrect** conversation tab shows each completed named operation.
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
3. Execute a **successful** native `write` or `edit` on a disposable `.py` file; observe Ruff fix → Ruff format, then Ruff check and ty. Confirm remaining findings and checker failures appear in the agent's `additionalContexts`, then open **AutoCorrect** and verify exact operation names, statuses, elapsed times, outputs, and fixer changes.
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
- `git show :<path>` piped to `shellcheck --shell sh -` for staged `.sh` when selected; ACC includes the original staged path in any failure message.
- `npm audit --audit-level=high`, `license-checker --summary`, and `gitleaks git --redact` for explicitly selected optional checks.

Test with a known failure in a disposable repository. The hook should fail the commit and print a diagnostic rather than silently succeeding. Remove the test changes rather than bypassing the hook.

**Single effective configuration:** the DSH native UI sets `hygieneEnabled` and capability toggles. ACC emits the generated policy to the Git directory on plugin activation or a successful edit; `acc-tools hygiene` reads it at commit time. Verify a changed toggle is projected before committing, especially if the agent has not edited a file since the change. Git hooks are machine-local; a Mac-side Git commit cannot use a Docker-only executable path unless `acc-tools` is installed on the host PATH.

### Contract-focused CI and release acceptance

The real workflow is [`.github/workflows/ci.yml`](.github/workflows/ci.yml). Before calling ACC fully implemented, inspect the current workflow run and validate: packaged plugin import, DSH native profile install, Auto-Correct language and capability off/on, LSP on/off and startup, Git hook invocation with staged-data pass/fail, and **persistence** across restart. CI currently defines build, lint, format, typecheck, Vitest and package checks; the complete three-group runtime acceptance sequence has **not** been proven by those declarations alone.

`ACC_QDOCKER_READ_TOKEN` is the exact optional CI secret for the private QDev Code-and-Quality installer checkout. Without it, cross-repository inventory validation is skipped. See [ENVIRONMENT.md](ENVIRONMENT.md) for the exact source paths and environment flags.
