import { describe, expect, it } from 'vitest'
import { capabilityEnabled, languageForExtension } from '../src/capabilities.js'

const languages = { python: true, rust: false, typescript: false } as const

describe('ACC language and capability gating', () => {
  it('recognizes TSX and source extensions', () => {
    expect(languageForExtension('.tsx')).toBe('typescript')
    expect(languageForExtension('.rs')).toBe('rust')
    expect(languageForExtension('.py')).toBe('python')
    expect(languageForExtension('.sh')).toBeUndefined()
  })
  it('does not execute disabled languages despite enabled tool defaults', () => {
    expect(capabilityEnabled('rust', 'rustfmt', languages, {})).toBe(false)
    expect(capabilityEnabled('typescript', 'eslint-fix', languages, {})).toBe(false)
  })
  it('allows Python by default and honors individual off switches', () => {
    expect(capabilityEnabled('python', 'ruff-fix', languages, {})).toBe(true)
    expect(capabilityEnabled('python', 'ruff-fix', languages, { 'ruff-fix': false })).toBe(false)
    expect(capabilityEnabled('python', 'ty', languages, { 'ruff-fix': false })).toBe(true)
  })
  it('never runs unknown file languages', () => {
    expect(capabilityEnabled(undefined, 'gitleaks', languages, {})).toBe(false)
  })
})
