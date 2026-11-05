import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { DEFAULT_HYGIENE, gitLocations, readEffectiveHygiene, syncGitHygiene } from '../src/hygiene-hook.js'

const roots: string[] = []
function repository(): string {
  const root = mkdtempSync(join(tmpdir(), 'acc-git-hygiene-'))
  roots.push(root)
  const result = spawnSync('git', ['init', '-q', root], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(result.stderr || 'git init failed')
  return root
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('default-on Git hygiene projection and native pre-commit integration', () => {
  it('uses Gitleaks, ShellCheck and staged Git diff checks by default', () => {
    expect(DEFAULT_HYGIENE).toEqual(['git-diff', 'gitleaks', 'shellcheck'])
    const root = repository()
    expect(readEffectiveHygiene(root)).toEqual({
      enabled: true,
      checks: ['git-diff', 'gitleaks', 'shellcheck'],
    })
  })
  it('installs a managed executable hook and a private generated policy', () => {
    const root = repository()
    syncGitHygiene(root, { enabled: true, checks: [...DEFAULT_HYGIENE] })
    const { gitDir, hookDir } = gitLocations(root)!
    const policy = join(gitDir, 'acc-hygiene-effective.json')
    const hook = join(hookDir, 'pre-commit')
    expect(existsSync(policy)).toBe(true)
    expect(readFileSync(policy, 'utf8')).toContain('"gitleaks"')
    expect(readFileSync(hook, 'utf8')).toContain('acc-tools hygiene')
    expect(readEffectiveHygiene(root).enabled).toBe(true)
    const original = readFileSync(hook, 'utf8')
    syncGitHygiene(root, { enabled: true, checks: [...DEFAULT_HYGIENE] })
    expect(readFileSync(hook, 'utf8')).toBe(original)
  })
  it('retains existing hooks and allows a persisted off switch', () => {
    const root = repository()
    const hookDir = gitLocations(root)!.hookDir
    mkdirSync(hookDir, { recursive: true })
    const hook = join(hookDir, 'pre-commit')
    writeFileSync(hook, '#!/bin/sh\necho previous-hook\n', { mode: 0o755 })
    syncGitHygiene(root, { enabled: true, checks: [...DEFAULT_HYGIENE] })
    const content = readFileSync(hook, 'utf8')
    expect(content).toContain('echo previous-hook')
    expect(content.indexOf('acc-tools hygiene')).toBeLessThan(content.indexOf('echo previous-hook'))
    syncGitHygiene(root, { enabled: false, checks: [...DEFAULT_HYGIENE] })
    expect(readEffectiveHygiene(root).enabled).toBe(false)
    expect(readFileSync(hook, 'utf8')).toBe(content)
  }, 30000)
  it('blocks a Git commit when ACC hygiene fails, even if an older hook follows', () => {
    const root = repository()
    const loc = gitLocations(root)!
    mkdirSync(loc.hookDir, { recursive: true })
    writeFileSync(join(loc.hookDir, 'pre-commit'), '#!/bin/sh\necho original > original-ran\n', {
      mode: 0o755,
    })
    syncGitHygiene(root, { enabled: true, checks: [...DEFAULT_HYGIENE] })
    const bin = join(root, '.fake-bin')
    mkdirSync(bin)
    writeFileSync(join(bin, 'acc-tools'), '#!/bin/sh\nexit 23\n', { mode: 0o755 })
    writeFileSync(join(root, 'example.txt'), 'example\n')
    const env = { ...process.env, PATH: bin + ':' + (process.env.PATH ?? '') }
    expect(spawnSync('git', ['add', 'example.txt'], { cwd: root, env }).status).toBe(0)
    const commit = spawnSync(
      'git',
      ['-c', 'user.name=ACC Test', '-c', 'user.email=acc@example.invalid', 'commit', '-m', 'must block'],
      { cwd: root, env, encoding: 'utf8' },
    )
    expect(commit.status).not.toBe(0)
    expect(existsSync(join(root, 'original-ran'))).toBe(false)
  }, 30000)
  it('uses the Git configured hooksPath without discarding hooks', () => {
    const root = repository()
    const configured = spawnSync('git', ['config', 'core.hooksPath', '.custom-hooks'], { cwd: root })
    expect(configured.status).toBe(0)
    syncGitHygiene(root, { enabled: true, checks: [...DEFAULT_HYGIENE] })
    expect(existsSync(join(root, '.custom-hooks', 'pre-commit'))).toBe(true)
  })
})
