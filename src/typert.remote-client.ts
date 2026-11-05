import { z } from 'zod'
// The published rc.5 package's runtime leaf is the pure JS factory.
// Import its local JS file for bundling; the package subpath resolves externally
// in tsdown's current CJS Web build and DSH does not register that browser module.
import { createTypertRemoteInfo } from '../node_modules/@deepseek-ai/dsh-typert-protocol/lib/types/remote-info.js'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { AccReadinessSnapshot } from './readiness.js'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteNamespaceMap {
    accReadiness: {
      snapshot(signal?: AbortSignal): Promise<RemoteResult<AccReadinessSnapshot>>
    }
  }
}

const readinessTool = z.object({
  id: z.string(),
  label: z.string(),
  language: z.enum(['python', 'rust', 'typescript', 'hygiene']),
  state: z.enum(['disabled', 'installed', 'configured', 'ready', 'unavailable', 'failed']),
  executable: z.string(),
  path: z.string().optional(),
  version: z.string().optional(),
  detail: z.string(),
})

const readinessSnapshot = z.object({
  checkedAt: z.number(),
  projectPath: z.string(),
  project: z.object({
    packageJson: z.boolean(),
    tsconfig: z.boolean(),
    eslintConfig: z.boolean(),
    cargoToml: z.boolean(),
    pyproject: z.boolean(),
  }),
  tools: z.array(readinessTool),
})

/** Generated-equivalent client contract for ACC's read-only Remote service. */
export const TYPERT_REMOTE = createTypertRemoteInfo(
  {
    package: 'dsh-auto-code-correct',
    methods: {
      'accReadiness/snapshot': {
        service: 'accReadiness',
        description:
          'Inspect ACC executable and project-configuration readiness without running or installing tools.',
        invocation: { kind: 'direct' },
        parameters: [],
        result: {
          mode: 'strict',
          typeSymbol: 'dsh-auto-code-correct#accReadiness/snapshot:result',
          create: () => readinessSnapshot,
          jsonSchema: { type: 'object' },
        },
        sourceLocation: { file: 'src/readiness-service.ts', line: 24, column: 3 },
      },
    },
  },
  z,
)
