import { describe, expect, it } from 'vitest'
import { routeFile } from 'dsh-lsp-actions'

const entries = [
  {
    serverId: 'python',
    entry: { extensionToLanguage: { '.py': 'python' }, fileGlobs: [], projectMarkers: [] },
  },
  { serverId: 'rust', entry: { extensionToLanguage: { '.rs': 'rust' }, fileGlobs: [], projectMarkers: [] } },
  {
    serverId: 'typescript',
    entry: {
      extensionToLanguage: { '.ts': 'typescript', '.tsx': 'typescriptreact' },
      fileGlobs: [],
      projectMarkers: [],
    },
  },
] as unknown as Parameters<typeof routeFile>[0]

describe('upstream multi-language LSP action routing', () => {
  it.each([
    ['src/main.py', 'python'],
    ['src/lib.rs', 'rust'],
    ['src/main.ts', 'typescript'],
    ['src/main.tsx', 'typescript'],
  ])('routes %s to %s without a fork or custom LSP client', (file, expected) => {
    expect(routeFile(entries, file)?.server.serverId).toBe(expected)
  })
  it('returns no server for unsupported extensions', () => {
    expect(routeFile(entries, 'script.sh')).toBeUndefined()
  })
})
