import { describe, expect, it } from 'vitest'
import { capabilityEnabled, languageForExtension } from '../src/capabilities.js'
import { editedPath } from '../src/index.js'
import type { ToolExecution, ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import { ACC_RESULT_META_VERSION, isAccResultMeta } from '../src/operation-record.js'

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

describe('ACC edited-path admission', () => {
  const success = { isError: false, value: 'ok', content: [] } as unknown as ToolExecutionResult

  it('recognizes mutating str_replace_editor path arguments', () => {
    const exec = {
      name: 'str_replace_editor',
      arguments: { command: 'str_replace', path: '/workspace/example.py' },
    } as unknown as ToolExecution
    expect(editedPath(exec, success)).toBe('/workspace/example.py')
  })

  it('does not run after read-only str_replace_editor views', () => {
    const exec = {
      name: 'str_replace_editor',
      arguments: { command: 'view', path: '/workspace/example.py' },
    } as unknown as ToolExecution
    expect(editedPath(exec, success)).toBeUndefined()
  })
})

describe('ACC durable result metadata', () => {
  const metadata = {
    version: ACC_RESULT_META_VERSION,
    parentCallId: 'call-1',
    parentToolName: 'edit',
    filePath: '/workspace/example.py',
    operations: [
      {
        id: '0:ruff-fix',
        kind: 'fixer',
        name: 'ruff-fix',
        argv: ['ruff', 'check', '--fix'],
        cwd: '/workspace',
        startedAt: 10,
        endedAt: 20,
        status: 'clean',
        exitCode: 0,
        signal: null,
        output: '',
        change: null,
      },
    ],
  }

  it('accepts versioned operation identity, outcome, timing, and result fields', () => {
    expect(isAccResultMeta(metadata)).toBe(true)
  })

  it('rejects malformed operation metadata before presentation', () => {
    expect(isAccResultMeta({ ...metadata, operations: [{ ...metadata.operations[0], name: 7 }] })).toBe(false)
  })
})
