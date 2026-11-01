# ACC — Environment

**Authority:** Deployment and file layouts differ by host. ACC's own tool discovery and launch behavior are in `src/`; package compatibility and plugins are declared in `package.json` / `cordis.patch.yml`. The QDev Docker Compose repository owns QDev environment installation, volumes and executable provision; this repository must not duplicate or modify that deployment.

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
