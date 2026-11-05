import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { CAPABILITIES, LANGUAGE_EXTENSIONS } from '../src/capabilities.js'

describe('ACC language configuration', () => {
  const config = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
  it('defaults to Python only', () => {
    expect(config).toContain('python: true')
    expect(config).toContain('rust: false')
    expect(config).toContain('typescript: false')
  })
  it('covers the three supported languages and hygiene options', () => {
    expect(Object.keys(LANGUAGE_EXTENSIONS)).toEqual(['python', 'rust', 'typescript'])
    for (const id of [
      'ruff-fix',
      'ty',
      'rustfmt',
      'clippy-fix',
      'eslint-fix',
      'prettier',
      'typescript-check',
      'git-diff',
      'gitleaks',
      'large-files',
      'dependency-audit',
      'license-audit',
      'history-secrets',
    ]) {
      expect(CAPABILITIES.find((item) => item.id === id)).toBeDefined()
    }
  })
  it('keeps configured commands matched to registry identifiers', () => {
    for (const cap of CAPABILITIES.filter((item) => item.group === 'autoCorrect')) {
      expect(config).toContain('name: ' + cap.id)
    }
  })
})
