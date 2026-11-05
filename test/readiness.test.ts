import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { inspectReadiness } from '../src/readiness.js'

const created: string[] = []
afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const config = {
  languages: { python: false, rust: false, typescript: true },
  capabilities: { 'eslint-fix': false, prettier: false, 'eslint-verify': false, 'typescript-lsp': false },
  languageServers: { python: false, rust: false, typescript: false },
  executables: {},
}

describe('ACC readiness preflight', () => {
  it('reports a missing tsconfig as installed but not ready before execution', () => {
    const dir = mkdtempSync(join(tmpdir(), 'acc-readiness-'))
    created.push(dir)
    writeFileSync(join(dir, 'package.json'), '{}')
    const snapshot = inspectReadiness(config, join(dir, 'source.ts'))
    const tsc = snapshot.tools.find((tool) => tool.id === 'typescript-check')
    expect(tsc?.state).toBe('installed')
    expect(tsc?.detail).toBe('tsconfig.json is missing')
  })

  it('reports a TypeScript compiler ready only after its project configuration exists', () => {
    const dir = mkdtempSync(join(tmpdir(), 'acc-readiness-'))
    created.push(dir)
    writeFileSync(join(dir, 'package.json'), '{}')
    writeFileSync(join(dir, 'tsconfig.json'), '{"compilerOptions": {}}')
    const snapshot = inspectReadiness(config, join(dir, 'source.ts'))
    const tsc = snapshot.tools.find((tool) => tool.id === 'typescript-check')
    expect(tsc?.state).toBe('ready')
    expect(tsc?.path).toBeTruthy()
  })
})
