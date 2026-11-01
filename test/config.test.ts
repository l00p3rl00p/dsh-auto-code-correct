import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

describe('ACC language configuration', () => {
  const config = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
  it('routes Python, Rust, and TypeScript files', () => {
    for (const extension of [".py", ".rs", ".ts", ".tsx"]) {
      expect(config).toContain(extension)
    }
  })
  it('configures correction and verification tools', () => {
    for (const tool of ['ruff', 'ty', 'rustfmt', 'cargo', 'clippy', 'eslint', 'prettier', 'tsc']) {
      expect(config).toContain(tool)
    }
  })
})
