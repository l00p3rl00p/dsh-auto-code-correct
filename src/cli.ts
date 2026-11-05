#!/usr/bin/env node
/**
 * ACC tool manager. Reuses existing executables before installing anything,
 * tracks ACC-owned installations, and never removes unowned/shared software.
 * Interactive DSH settings should invoke these actions after user approval.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { CAPABILITIES } from './capabilities.js'
import { configuredToolDirectories, findTool } from './discovery.js'
import { readEffectiveHygiene, syncGitHygiene, DEFAULT_HYGIENE } from './hygiene-hook.js'

type InstallRecord = { manager: 'npm' | 'uv' | 'rustup' | 'go'; packageName: string; prefix?: string }
type Ledger = Record<string, InstallRecord>
const home = resolve(process.env.ACC_HOME ?? join(homedir(), '.config', 'dsh-auto-code-correct'))
const ledgerPath = join(home, 'owned-tools.json')
const readLedger = (): Ledger =>
  existsSync(ledgerPath) ? (JSON.parse(readFileSync(ledgerPath, 'utf8')) as Ledger) : {}
const writeLedger = (ledger: Ledger): void => {
  mkdirSync(dirname(ledgerPath), { recursive: true })
  writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2) + '\n', { mode: 0o600 })
}
function exec(
  command: string,
  args: string[],
  options: { cwd?: string; quiet?: boolean; env?: NodeJS.ProcessEnv } = {},
): void {
  const run = spawnSync(command, args, {
    encoding: 'utf8',
    cwd: options.cwd,
    env: options.env ?? process.env,
    stdio: options.quiet ? 'pipe' : 'inherit',
  })
  if (run.error) throw run.error
  if (run.status !== 0)
    throw new Error(`${command} ${args.join(' ')} failed (exit ${run.status ?? 'unknown'})`)
}
function locate(executable: string, prefix?: string): string | undefined {
  return findTool(executable, {
    prefix,
    cwd: process.cwd(),
    toolDirectories: configuredToolDirectories(),
  }).path
}
function toolId(id: string): string {
  const cap = CAPABILITIES.find((item) => item.id === id)
  if (!cap) throw new Error(`Unknown capability ${id}; use 'list'`)
  return cap.executable
}
const packages: Readonly<
  Record<string, { manager: InstallRecord['manager']; packageName: string; executable?: string }>
> = {
  ruff: { manager: 'uv', packageName: 'ruff' },
  ty: { manager: 'uv', packageName: 'ty' },
  'basedpyright-langserver': { manager: 'npm', packageName: 'basedpyright' },
  rustfmt: { manager: 'rustup', packageName: 'rustfmt' },
  'rust-analyzer': { manager: 'rustup', packageName: 'rust-analyzer' },
  eslint: { manager: 'npm', packageName: 'eslint' },
  prettier: { manager: 'npm', packageName: 'prettier' },
  tsc: { manager: 'npm', packageName: 'typescript' },
  'typescript-language-server': { manager: 'npm', packageName: 'typescript-language-server' },
  'license-checker': { manager: 'npm', packageName: 'license-checker' },
  gitleaks: { manager: 'go', packageName: 'github.com/gitleaks/gitleaks/v8@latest' },
  'cargo-clippy': { manager: 'rustup', packageName: 'clippy' },
}
function install(id: string, prefix: string): void {
  const executable = toolId(id)
  const current = locate(executable, prefix)
  if (current) {
    console.log(`REUSED ${id}: ${current} (no installation performed)`)
    return
  }
  const pkg = packages[executable]
  if (!pkg)
    throw new Error(
      `No native vetted installer for ${executable}. Supply its location via the DSH profile or install using its official package manager.`,
    )
  console.log(`Installing ${pkg.packageName} using ${pkg.manager}; target ${prefix}`)
  if (pkg.manager === 'npm') exec('npm', ['install', '--prefix', prefix, '--save', pkg.packageName])
  else if (pkg.manager === 'uv')
    exec('uv', ['tool', 'install', pkg.packageName], {
      env: { ...process.env, UV_TOOL_DIR: join(prefix, 'uv-tools'), UV_TOOL_BIN_DIR: join(prefix, 'bin') },
    })
  else if (pkg.manager === 'rustup') exec('rustup', ['component', 'add', pkg.packageName])
  else {
    mkdirSync(join(prefix, 'bin'), { recursive: true })
    exec('go', ['install', pkg.packageName], { env: { ...process.env, GOBIN: join(prefix, 'bin') } })
  }
  const installed = locate(executable, prefix)
  if (!installed)
    throw new Error(
      `Installation finished but ${executable} is not discoverable; configure its absolute path before enabling the feature`,
    )
  const ledger = readLedger()
  ledger[executable] = { manager: pkg.manager, packageName: pkg.packageName, prefix }
  writeLedger(ledger)
  console.log(`INSTALLED ${executable}: ${installed}`)
}
function uninstall(id: string): void {
  const executable = toolId(id)
  const ledger = readLedger()
  const record = ledger[executable]
  if (!record) {
    console.log(`RETAINED ${executable}: not installed by ACC`)
    return
  }
  if (record.manager === 'npm')
    exec('npm', ['uninstall', '--prefix', record.prefix ?? home, record.packageName])
  else if (record.manager === 'uv')
    exec('uv', ['tool', 'uninstall', record.packageName], {
      env: {
        ...process.env,
        UV_TOOL_DIR: join(record.prefix ?? home, 'uv-tools'),
        UV_TOOL_BIN_DIR: join(record.prefix ?? home, 'bin'),
      },
    })
  else if (record.manager === 'rustup') exec('rustup', ['component', 'remove', record.packageName])
  else {
    const path = resolve(record.prefix ?? home, 'bin', executable)
    if (existsSync(path)) unlinkSync(path)
  }
  delete ledger[executable]
  writeLedger(ledger)
  console.log(`REMOVED ACC-owned ${executable}`)
}
function git(args: string[], cwd: string): string {
  const out = spawnSync('git', args, { cwd, encoding: 'utf8' })
  if (out.status !== 0) throw new Error(out.stderr || `git ${args.join(' ')} failed`)
  return out.stdout
}
function stagedLargeFiles(cwd: string, sizeLimit = 10 * 1024 * 1024): void {
  const entries = git(['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMRT'], cwd)
    .split('\0')
    .filter(Boolean)
  for (const path of entries) {
    const tree = git(['ls-files', '-s', '--', path], cwd).trim()
    const hash = tree.match(/^[0-7]{6} ([0-9a-f]{40,64}) /)?.[1]
    if (!hash) continue
    const size = Number(git(['cat-file', '-s', hash], cwd).trim())
    if (size > sizeLimit) throw new Error(`Oversized staged blob: ${path} (${size} bytes > ${sizeLimit})`)
  }
}
/** Native DSH profile is the authority. The Git-dir policy is its generated projection. */
function readHygieneSelection(cwd: string): string[] {
  const policy = readEffectiveHygiene(cwd)
  if (!policy.enabled) return []
  const allowed = new Set(CAPABILITIES.filter((c) => c.group === 'hygiene').map((c) => c.id))
  for (const id of policy.checks) {
    if (!allowed.has(id)) throw new Error('Invalid generated ACC Git hygiene capability: ' + id)
  }
  return policy.checks
}
/** Install a Git-native staged-change hook without clobbering an existing hook. */
function installHook(cwd: string): void {
  // Explicit command installs the same managed hook as native ACC startup.
  // It preserves any existing pre-commit hook and its content.
  syncGitHygiene(cwd, { enabled: true, checks: [...DEFAULT_HYGIENE] })
  console.log('ACC native Git pre-commit hook synchronized')
}
/** Check indexed script bytes, not potentially different unstaged working-tree content. */
function stagedShellcheck(cwd: string): void {
  const paths = git(['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMRT'], cwd)
    .split('\0')
    .filter((path) => path.endsWith('.sh'))
  for (const path of paths) {
    const staged = spawnSync('git', ['show', ':' + path], { cwd, encoding: 'utf8' })
    if (staged.status !== 0) throw new Error(`Could not read staged shell script ${path}: ${staged.stderr}`)
    const checked = spawnSync('shellcheck', ['--shell', 'sh', '-'], {
      cwd,
      input: staged.stdout,
      encoding: 'utf8',
    })
    if (checked.error) throw checked.error
    if (checked.status !== 0)
      throw new Error(`ShellCheck failed for staged ${path}: ${checked.stdout} ${checked.stderr}`)
  }
}
function hygiene(ids: string[], cwd: string): void {
  const selected = new Set(ids.length ? ids : readHygieneSelection(cwd))
  if (selected.size === 0) {
    console.log('SKIPPED ACC Git hygiene: disabled')
    return
  }
  for (const id of selected) {
    if (id === 'shellcheck') stagedShellcheck(cwd)
    else if (id === 'git-diff') exec('git', ['diff', '--cached', '--check'], { cwd })
    else if (id === 'gitleaks') exec('gitleaks', ['git', '--pre-commit', '--staged', '--redact'], { cwd })
    else if (id === 'large-files') stagedLargeFiles(cwd)
    else if (id === 'dependency-audit') exec('npm', ['audit', '--audit-level=high'], { cwd })
    else if (id === 'license-audit') exec('license-checker', ['--summary'], { cwd })
    else if (id === 'history-secrets') exec('gitleaks', ['git', '--redact'], { cwd })
    else throw new Error(`Unknown hygiene check: ${id}`)
    console.log(`PASS ${id}`)
  }
}
function main(): void {
  const [action, id, ...rest] = process.argv.slice(2)
  const prefixArg = rest.indexOf('--prefix')
  const prefix = resolve(prefixArg >= 0 ? (rest[prefixArg + 1] ?? home) : home)
  if (action === 'list') {
    for (const item of CAPABILITIES) {
      console.log(
        `${item.language ?? 'repository'} / ${item.group} / ${item.id}: ${locate(item.executable, prefix) ?? 'missing'}`,
      )
    }
  } else if (action === 'status' && id) {
    const executable = toolId(id)
    const found = locate(executable, prefix)
    console.log(
      JSON.stringify({
        capability: id,
        executable,
        status: found ? 'installed' : 'missing',
        path: found ?? null,
        managed: Boolean(readLedger()[executable]),
      }),
    )
  } else if (action === 'find' && id) {
    const executable = toolId(id)
    const explicit = rest[0]
    const result = findTool(executable, {
      explicit,
      prefix,
      cwd: process.cwd(),
      toolDirectories: configuredToolDirectories(),
    })
    console.log(JSON.stringify({ capability: id, executable, ...result }))
    if (result.status !== 'installed') process.exitCode = 1
  } else if (action === 'install' && id) install(id, prefix)
  else if (action === 'uninstall' && id) uninstall(id)
  else if (action === 'hooks' && id === 'install') installHook(process.cwd())
  else if (action === 'hygiene')
    hygiene(
      [id, ...rest].filter(Boolean).filter((x) => x !== '--prefix'),
      process.cwd(),
    )
  else {
    console.log(
      'Usage: acc-tools list | status <capability> | find <capability> [absolute-executable-path] | install <capability> [--prefix DIR] | uninstall <capability> | hooks install | hygiene [check...]',
    )
    process.exitCode = 2
  }
}
try {
  main()
} catch (error) {
  console.error(`ACC: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
