import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { AccReadinessSnapshot } from './readiness.js'
import { inspectReadiness } from './readiness.js'

export type AccReadinessConfig = {
  languages: { get(): Readonly<Record<'python' | 'rust' | 'typescript', boolean>> }
  capabilities: { get(): Readonly<Record<string, boolean>> }
  languageServers: { get(): Readonly<Record<'python' | 'rust' | 'typescript', boolean>> }
  executables: { get(): Readonly<Record<string, string>> }
}

/** Read-only native Remote projection of ACC's executable/configuration preflight. */
export class AccReadinessService extends TypertRemoteService {
  constructor(
    ctx: Context,
    private readonly config: AccReadinessConfig,
  ) {
    super(ctx, 'accReadiness')
    // tsdown preserves stage-3 decorator syntax for the Node Host target.
    // Register the identical runtime marker explicitly so rc.5's Gateway can
    // discover this independently packaged Remote service on Node 22.
    Remote(this.snapshot, {
      kind: 'method',
      name: 'snapshot',
      static: false,
      private: false,
      access: { has: () => true, get: () => this.snapshot },
      addInitializer: (initializer) => initializer.call(this),
      metadata: undefined,
    } as ClassMethodDecoratorContext<object, (this: object) => AccReadinessSnapshot>)
  }

  /** Return current read-only readiness facts for the Harness working project. */
  snapshot(): AccReadinessSnapshot {
    return inspectReadiness({
      languages: this.config.languages.get(),
      capabilities: this.config.capabilities.get(),
      languageServers: this.config.languageServers.get(),
      executables: this.config.executables.get(),
    })
  }
}
