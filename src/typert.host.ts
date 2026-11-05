import { TYPERT_REMOTE } from './typert.remote-client.js'

/** Host descriptor discovered by DSH Typert Loader from this package's ./typert export. */
export const TYPERT = {
  package: 'dsh-auto-code-correct',
  face: 'host' as const,
  schemas: [],
  get invocations() {
    return TYPERT_REMOTE.descriptors
  },
  model: {
    services: [
      {
        description: 'Read-only ACC executable and project-configuration readiness service.',
        summary: 'Projects ACC preflight facts to the native Client.',
        tags: [],
        jsDoc: '/** Read-only ACC executable and project-configuration readiness service. */',
        key: 'accReadiness',
        exportName: 'AccReadinessService',
        members: [
          {
            kind: 'method',
            name: 'snapshot',
            signature: '@Remote snapshot(): AccReadinessSnapshot',
            summary: 'Inspect executable and project configuration readiness without executing tools.',
            jsDoc: '/** Inspect executable and project configuration readiness without executing tools. */',
          },
        ],
        types: [],
      },
    ],
    events: [],
    objects: [],
  },
}
