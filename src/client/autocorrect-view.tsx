import React, { useSyncExternalStore } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type {
  ConversationNodeContext,
  ConversationViewBuilder,
  ConversationViewNode,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { isAccResultMeta, type AccResultMeta } from '../operation-record.js'

type AccViewNode = ConversationViewNode & { data: AccResultMeta }
type AccSnapshot = readonly AccViewNode[]
type AccSource = {
  getSnapshot(): AccSnapshot
  subscribe(listener: () => void): () => void
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SessionStandardProps {
    useAutoCodeCorrect: AccSource
  }
}

declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
  interface ConversationViewSnapshotMap {
    'auto-code-correct': AccSnapshot
  }
}

function metaFromEvent(event: unknown): AccResultMeta | undefined {
  if (typeof event !== 'object' || event === null || !('type' in event)) return undefined
  if (event.type === 'auto-code-correct/operation') {
    const data = (event as { data?: unknown }).data
    return isAccResultMeta(data) ? data : undefined
  }
  // Retain compatibility with pre-session-event records from a future DSH
  // metadata seam, but do not rely on result metadata in rc.5.
  if (event.type !== 'tool/result') return undefined
  const data = (event as { data?: unknown }).data
  if (typeof data !== 'object' || data === null || !('meta' in data)) return undefined
  const meta = (data as { meta?: unknown }).meta
  if (typeof meta !== 'object' || meta === null || !('autoCodeCorrect' in meta)) return undefined
  const value = (meta as { autoCodeCorrect?: unknown }).autoCodeCorrect
  return isAccResultMeta(value) ? value : undefined
}

class AutoCorrectViewBuilder implements ConversationViewBuilder<ConversationViewNode, AccSnapshot> {
  empty: AccSnapshot = []
  private nodes = new Map<string, AccViewNode>()

  replace(input: { nodes: readonly ConversationViewNode[] }): AccSnapshot {
    this.nodes = new Map(
      input.nodes
        .filter((node): node is AccViewNode => isAccResultMeta(node.data))
        .map((node) => [node.key, node]),
    )
    return [...this.nodes.values()]
  }

  apply(input: { upserts: readonly ConversationViewNode[] }): AccSnapshot {
    for (const node of input.upserts)
      if (isAccResultMeta(node.data)) this.nodes.set(node.key, node as AccViewNode)
    return [...this.nodes.values()]
  }
}

const pageStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  padding: 16,
  overflow: 'auto',
}
const cardStyle: React.CSSProperties = {
  border: '1px solid var(--dsw-alias-border-l2)',
  borderRadius: 12,
  background: 'var(--dsw-alias-bg-module-platform)',
  padding: '14px 16px',
}
const mutedStyle: React.CSSProperties = {
  color: 'var(--dsw-alias-label-secondary)',
  fontSize: 13,
  lineHeight: '20px',
}

function AutoCorrectView(props: { useAutoCodeCorrect: AccSource }): React.ReactElement {
  const rows = useSyncExternalStore(
    props.useAutoCodeCorrect.subscribe,
    props.useAutoCodeCorrect.getSnapshot,
    props.useAutoCodeCorrect.getSnapshot,
  )
  if (rows.length === 0) {
    return (
      <main style={pageStyle}>
        <p style={mutedStyle}>No Auto Code Correct operations are recorded in this session.</p>
      </main>
    )
  }
  return (
    <main style={pageStyle} aria-label="AutoCorrect operations">
      {rows.map((row) => (
        <section key={row.key} style={cardStyle}>
          <strong>{row.data.filePath}</strong>
          <p style={mutedStyle}>
            {row.data.parentToolName} · {row.data.operations.length} operation(s)
          </p>
          {row.data.operations.map((operation) => (
            <div
              key={operation.id}
              style={{ borderTop: '1px solid var(--dsw-alias-border-l2)', paddingTop: 8, marginTop: 8 }}
            >
              <strong>{operation.name}</strong>
              <span style={mutedStyle}>
                {' '}
                · {operation.kind} · {operation.status} · {operation.endedAt - operation.startedAt}ms
              </span>
              {operation.output ? (
                <pre style={{ ...mutedStyle, whiteSpace: 'pre-wrap', margin: '8px 0 0' }}>
                  {operation.output}
                </pre>
              ) : null}
              {operation.change ? <p style={mutedStyle}>Changed {operation.change.path}</p> : null}
            </div>
          ))}
        </section>
      ))}
    </main>
  )
}

/** Register an ACC-owned session view; it projects only ACC's durable result metadata. */
export function registerAutoCorrectView(ctx: Context): void {
  const target = 'auto-code-correct'
  ctx.uiConversation.views.register({
    target,
    create: () => new AutoCorrectViewBuilder(),
    // Keep the tab discoverable even before the first edit; an empty state explains
    // where ACC results will appear instead of hiding the control entirely.
    isActive: () => true,
  })
  ctx.uiConversation.events.register({
    kind: 'auto-code-correct',
    target,
    match: {
      'tool/result': (event) => {
        const metadata = metaFromEvent(event)
        return metadata === undefined ? null : { id: metadata.parentCallId, role: 'start' }
      },
    },
    start: (_context, match) => metaFromEvent(match.event) as AccResultMeta,
    update: (context) => context.state,
    buildViewNode: (context: ConversationNodeContext<AccResultMeta>) => ({
      key: context.key,
      kind: 'auto-code-correct',
      id: context.id,
      target,
      data: context.state as AccResultMeta,
    }),
  })
  ctx.slots.inject('conversation.view', () =>
    ctx.slots.register(
      {
        name: 'conversation.view',
        id: target,
        order: 20,
        label: () => 'AutoCorrect',
        inject: (sessionId) => ({
          useAutoCodeCorrect: ctx.uiConversation.binding(sessionId).target(target) as AccSource,
        }),
      },
      AutoCorrectView,
    ),
  )
}
