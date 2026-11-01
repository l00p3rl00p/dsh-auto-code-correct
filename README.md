# dsh-auto-code-correct

A DeepSeek Harness hook that lints each Python or shell file the agent edits or writes,
using Ruff and ty (Python) and ShellCheck (shell), all installed in the harness.

## Install

1. Copy `check.sh` to `$DSH_HOME/auto-code-correct/check.sh` (the harness data folder).
2. Copy `hooks.json` to `$DSH_HOME/hooks.json`.
3. Install the hook plugin, `dsh-plugin-hooks` (third party, not pinned yet):
   `dsh plugin --profile web add dsh-plugin-hooks`, then mount it.

## What it does

After every `edit` or `write`, the hook runs the matching checks and writes the result to
`$DSH_HOME/auto-code-correct/findings.txt`. It never blocks the agent.

## Not yet verified

- **Feedback to the agent.** The findings are written to a file. Nothing yet shows them to the
  agent on its next turn. Until that is wired, this only records results.
- **File path field.** The hook reads the path from `args.path` (or `args.file_path`). Confirm
  this for each edit/write tool the harness uses.
- **Plugin version.** `dsh-plugin-hooks` is third party. Pin it before use.
