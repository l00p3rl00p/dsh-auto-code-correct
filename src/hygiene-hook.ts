/** Git-native pre-commit integration, driven by the effective ACC Cordis configuration.
 * The policy file under the Git directory is a generated runtime projection, never
 * a second editable configuration. Existing hooks are preserved and chained.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

export const DEFAULT_HYGIENE = ['git-diff', 'gitleaks', 'shellcheck'] as const
export type HygienePolicy = { enabled: boolean; checks: string[] }
const begin = '# BEGIN AUTO-CODE-CORRECT (managed)'
const end = '# END AUTO-CODE-CORRECT (managed)'

function git(cwd: string, args: string[]): string | undefined {
  const run = spawnSync('git', args, { cwd, encoding: 'utf8' })
  return run.status === 0 ? run.stdout.trim() : undefined
}
export function gitLocations(cwd: string): { root: string; gitDir: string; hookDir: string } | undefined {
  const root = git(cwd, ['rev-parse', '--show-toplevel'])
  const gitDir = git(cwd, ['rev-parse', '--absolute-git-dir'])
  if (!root || !gitDir) return undefined
  const configured = git(root, ['config', '--get', 'core.hooksPath'])
  const hookDir = configured
    ? isAbsolute(configured)
      ? configured
      : resolve(root, configured)
    : join(gitDir, 'hooks')
  return { root, gitDir, hookDir }
}
function quoteShell(value: string): string {
  return "'" + value.replaceAll("'", "'\\''") + "'"
}

/** Called by the native DSH post-execute listener. Idempotent and repo-local. */
export function syncGitHygiene(cwd: string, policy: HygienePolicy): void {
  const loc = gitLocations(cwd)
  if (!loc) return
  const policyPath = join(loc.gitDir, 'acc-hygiene-effective.json')
  const serialized = JSON.stringify(policy, null, 2) + '\n'
  if (!existsSync(policyPath) || readFileSync(policyPath, 'utf8') !== serialized) {
    writeFileSync(policyPath, serialized, { mode: 0o600 })
    chmodSync(policyPath, 0o600)
  }
  // A disabled hook stays installed but becomes a no-op; the next enable reactivates it.
  mkdirSync(loc.hookDir, { recursive: true })
  const hook = join(loc.hookDir, 'pre-commit')
  const cli = fileURLToPath(new URL('./cli.js', import.meta.url))
  const runner =
    'if command -v acc-tools >/dev/null 2>&1; then\n  acc-tools hygiene || exit $?\nelse\n  ' +
    quoteShell(process.execPath) +
    ' ' +
    quoteShell(cli) +
    ' hygiene || exit $?\nfi'
  const block = begin + '\n' + runner + '\n' + end + '\n'
  const existing = existsSync(hook) ? readFileSync(hook, 'utf8') : ''
  if (existing.includes(begin)) {
    if (!existing.includes(end)) throw new Error('ACC Git pre-commit hook has an incomplete managed block')
    const start = existing.indexOf(begin)
    const stop = existing.indexOf(end, start) + end.length
    const updated = existing.slice(0, start) + block.trimEnd() + existing.slice(stop)
    if (updated !== existing) writeFileSync(hook, updated)
  } else if (existing) {
    if (!existing.startsWith('#!'))
      throw new Error('Existing pre-commit hook has no shebang; cannot safely chain ACC')
    const nl = existing.indexOf('\n')
    const updated = existing.slice(0, nl + 1) + block + existing.slice(nl + 1)
    // Preserve the original hook content and mode. The injected command runs first.
    writeFileSync(hook, updated, { mode: statSync(hook).mode })
  } else {
    writeFileSync(hook, '#!/bin/sh\n' + block, { mode: 0o755 })
  }
  chmodSync(hook, statSync(hook).mode | 0o111)
}

export function readEffectiveHygiene(cwd: string): HygienePolicy {
  const loc = gitLocations(cwd)
  if (!loc) return { enabled: true, checks: [...DEFAULT_HYGIENE] }
  const path = join(loc.gitDir, 'acc-hygiene-effective.json')
  if (!existsSync(path)) return { enabled: true, checks: [...DEFAULT_HYGIENE] }
  const data: unknown = JSON.parse(readFileSync(path, 'utf8'))
  if (typeof data !== 'object' || data === null || !('enabled' in data) || !('checks' in data)) {
    throw new Error('Invalid generated ACC Git hygiene policy')
  }
  const policy = data as HygienePolicy
  if (
    typeof policy.enabled !== 'boolean' ||
    !Array.isArray(policy.checks) ||
    !policy.checks.every((item) => typeof item === 'string')
  ) {
    throw new Error('Invalid generated ACC Git hygiene policy fields')
  }
  return policy
}
