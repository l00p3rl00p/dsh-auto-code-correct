import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { findTool, configuredToolDirectories } from '../src/discovery.js'
import { CAPABILITIES } from '../src/capabilities.js'

describe('portable reuse-first tool discovery', () => {
  const root = mkdtempSync(join(tmpdir(), 'acc-discovery-'))
  const bin = join(root, 'bin')
  mkdirSync(bin, { recursive: true })
  const ruff = join(bin, 'ruff')
  writeFileSync(ruff, '#!/bin/sh\necho ruff\n')
  chmodSync(ruff, 0o755)

  it('reuses PATH tools without installing anything', () => {
    expect(findTool('ruff', { path: bin, cwd: root })).toMatchObject({
      status: 'installed',
      path: ruff,
      source: 'PATH',
    })
  })
  it('finds known tool directory instead of assuming a Docker mount', () => {
    expect(findTool('ruff', { path: '', toolDirectories: [root] })).toMatchObject({
      status: 'installed',
      path: ruff,
      source: 'search-dir',
    })
  })
  it('honors an absolute executable link above PATH', () => {
    expect(findTool('ruff', { explicit: ruff, path: '/nonexistent' })).toMatchObject({
      status: 'installed',
      path: ruff,
      source: 'explicit',
    })
  })
  it('invalid explicit link never silently falls through to another binary', () => {
    expect(findTool('ruff', { explicit: join(root, 'missing'), path: bin }).status).toBe('invalid-override')
  })
  it('locates project-local Node tool installations', () => {
    const project = join(root, 'project')
    const localBin = join(project, 'node_modules', '.bin')
    mkdirSync(localBin, { recursive: true })
    const eslint = join(localBin, 'eslint')
    writeFileSync(eslint, '#!/bin/sh\nexit 0\n')
    chmodSync(eslint, 0o755)
    expect(findTool('eslint', { cwd: join(project, 'src'), path: '' })).toMatchObject({
      path: eslint,
      source: 'project',
    })
  })
  it('exposes configurable tool directories and no hard-coded Docker path', () => {
    expect(configuredToolDirectories({ ACC_TOOL_PATHS: [root, bin].join(delimiter) })).toEqual([root, bin])
    expect(configuredToolDirectories({})).toEqual([])
  })
})

describe('Docker installer ↔ ACC capability coverage', () => {
  // Exact executables installed by QDev Code-and-Quality; checked against its canonical shell installer.
  const dockerTools = [
    'ruff',
    'ty',
    'cargo',
    'rustfmt',
    'cargo-clippy',
    'rust-analyzer',
    'eslint',
    'prettier',
    'tsc',
    'typescript-language-server',
    'shellcheck',
    'gitleaks',
  ]
  const accTools = new Set(CAPABILITIES.map((cap) => cap.executable))
  const sourcePath = process.env.ACC_DOCKER_INSTALLER
  const source = sourcePath ? readFileSync(sourcePath, 'utf8') : undefined
  it('the real Docker installer still declares the exact tool inventory', () => {
    if (!source) return
    for (const tool of dockerTools) expect(source, `Docker installer changed: ${tool}`).toContain(tool)
    expect(source).toContain('ROOT=/home/qdev/llm-runtime')
  })
  it('ACC accounts for all Docker-installed helper executables', () => {
    expect(dockerTools.filter((tool) => !accTools.has(tool))).toEqual([])
  })
  it('identifies ACC hygiene extras not installed by Docker', () => {
    expect(
      CAPABILITIES.filter((cap) => cap.group === 'hygiene' && !dockerTools.includes(cap.executable)).map(
        (cap) => cap.id,
      ),
    ).toContain('license-audit')
  })
})
