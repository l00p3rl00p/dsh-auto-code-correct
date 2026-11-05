import React, { useMemo, useState, useSyncExternalStore } from 'react'
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


type AccIssue = { line: number; column?: number; code?: string; message: string; fixed: boolean; severity: string }
type AccOp = AccResultMeta['operations'][number]
function parseIssues(op: AccOp): AccIssue[] {
  const issues: AccIssue[] = []
  for (const line of op.output.split('\n')) {
    const ruff = line.match(/^[^:]+:(\d+):(\d+):\s+([A-Z]\d+)\s+(.+)$/)
    if (ruff) {
      issues.push({ line: +ruff[1], column: +ruff[2], code: ruff[3], message: ruff[4],
        severity: ruff[3].startsWith('E') ? 'error' : 'warning',
        fixed: op.kind === 'fixer' && op.status === 'clean' })
      continue
    }
    const ty = line.match(/^[^:]+:(\d+):\s+(error|warning|note):\s+(.+)$/)
    if (ty) {
      issues.push({ line: +ty[1], severity: ty[2], message: ty[3], fixed: false })
      continue
    }
    const eslint = line.match(/^\s+(\d+):(\d+)\s+(error|warning)\s+(.+?)\s{2}(.+)$/)
    if (eslint) issues.push({ line: +eslint[1], column: +eslint[2], code: eslint[5],
      severity: eslint[3], message: eslint[4],
      fixed: op.kind === 'fixer' && op.status === 'clean' })
  }
  return issues
}
function summarize(rows: AccSnapshot) {
  const tools = new Set<string>()
  let fixed = 0, remaining = 0, duration = 0
  for (const row of rows) for (const op of row.data.operations) {
    tools.add(op.name)
    duration += op.endedAt - op.startedAt
    const issues = parseIssues(op)
    if (op.kind === 'fixer' && op.status === 'clean') fixed += issues.filter(i => i.fixed).length
    if (op.status === 'findings') remaining += issues.filter(i => !i.fixed).length || 1
  }
  return { files: rows.length, fixed, remaining, duration, tools: [...tools] }
}
function categoriesFrom(rows: AccSnapshot) {
  const groups = new Map<string, Map<string, { message: string; count: number; fixed: number }>>()
  for (const row of rows) for (const op of row.data.operations) for (const issue of parseIssues(op)) {
    const label = issue.code?.startsWith('E') || issue.code?.startsWith('F')
      ? 'Formatting' : issue.severity === 'error' ? 'Errors' : 'Warnings'
    const group = groups.get(label) ?? new Map()
    const key = issue.code || issue.message
    const value = group.get(key) ?? { message: issue.message, count: 0, fixed: 0 }
    value.count++
    if (issue.fixed) value.fixed++
    group.set(key, value)
    groups.set(label, group)
  }
  return [...groups].map(([label, items]) => ({ label, items: [...items].map(([code, data]) => ({ code, ...data })) }))
}
const pageStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 12, padding: 16, overflow: 'auto' }
const cardStyle: React.CSSProperties = { border: '1px solid var(--dsw-alias-border-l2)',
  borderRadius: 12, background: 'var(--dsw-alias-bg-module-platform)', padding: '14px 16px' }
const mutedStyle: React.CSSProperties = { color: 'var(--dsw-alias-label-secondary)', fontSize: 13, lineHeight: '20px' }
const buttonStyle: React.CSSProperties = { padding: '4px 8px', borderRadius: 6, cursor: 'pointer',
  border: '1px solid var(--dsw-alias-border-l2)', background: 'var(--dsw-alias-bg-module-platform)' }
function ChangeViewer({ change }: { change: NonNullable<AccOp['change']> }) {
  const lines = useMemo(() => {
    const before = change.beforeText.split('\n')
    const after = change.afterText.split('\n')
    const result: { line: number; before?: string; after?: string }[] = []
    for (let i = 0; i < Math.max(before.length, after.length); i++)
      if (before[i] !== after[i]) result.push({ line: i + 1, before: before[i], after: after[i] })
    return result.slice(0, 10)
  }, [change])
  if (!lines.length) return <span style={mutedStyle}>No changes detected</span>
  return <pre style={{ ...mutedStyle, whiteSpace: 'pre-wrap', padding: 8 }}>
    {lines.map(line => <div key={line.line}>
      {line.before !== undefined && <div style={{ color: 'var(--dsw-alias-state-error-primary)' }}>- {line.before}</div>}
      {line.after !== undefined && <div style={{ color: 'var(--dsw-alias-state-success-primary)' }}>+ {line.after}</div>}
    </div>)}
  </pre>
}
function FileOperationCard({ row }: { row: AccViewNode }) {
  const [expanded, setExpanded] = useState(false)
  const operations = row.data.operations
  const issues = operations.flatMap(parseIssues)
  const fixed = issues.filter(i => i.fixed).length
  const remaining = issues.filter(i => !i.fixed).length
  return <section style={cardStyle}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div>
        <strong>📄 {row.data.filePath}</strong>
        <p style={mutedStyle}>via {row.data.parentToolName} · {operations.length} operation(s)
          {fixed > 0 && ' · ' + fixed + ' fixed'}
          {remaining > 0 && ' · ' + remaining + ' remaining'}
        </p>
      </div>
      <button type="button" style={buttonStyle} onClick={() => setExpanded(!expanded)}>
        {expanded ? 'Collapse ▲' : 'Expand ▼'}
      </button>
    </div>
    {expanded && operations.map(op => {
      const found = parseIssues(op)
      return <div key={op.id} style={{ borderTop: '1px solid var(--dsw-alias-border-l2)', paddingTop: 8, marginTop: 8 }}>
        <strong>{op.status === 'clean' ? '✓' : op.status === 'findings' ? '⚠' : '✗'} {op.name}</strong>
        <span style={mutedStyle}> · {op.kind} · {op.status} · {op.endedAt - op.startedAt}ms</span>
        {found.slice(0, 3).map((issue, idx) => <div key={idx} style={{ ...mutedStyle, marginLeft: 16 }}>
          {issue.fixed ? '✓' : '⚠'} Line {issue.line}: {issue.code ? issue.code + ' - ' : ''}{issue.message}
        </div>)}
        {found.length > 3 && <p style={mutedStyle}>... and {found.length - 3} more</p>}
        {op.change && <details style={{ marginTop: 8 }}>
          <summary style={{ ...mutedStyle, cursor: 'pointer' }}>View diff</summary>
          <ChangeViewer change={op.change} />
        </details>}
        {op.output && !found.length && <pre style={{ ...mutedStyle, whiteSpace: 'pre-wrap' }}>
          {op.output.slice(0, 500)}{op.output.length > 500 ? '...' : ''}
        </pre>}
      </div>
    })}
  </section>
}
function AutoCorrectView(props: { useAutoCodeCorrect: AccSource }): React.ReactElement {
  const rows = useSyncExternalStore(props.useAutoCodeCorrect.subscribe,
    props.useAutoCodeCorrect.getSnapshot, props.useAutoCodeCorrect.getSnapshot)
  const summary = useMemo(() => summarize(rows), [rows])
  const groups = useMemo(() => categoriesFrom(rows), [rows])
  if (!rows.length) return <main style={pageStyle}><section style={cardStyle}>
    <h3>📝 AutoCorrect</h3>
    <p style={mutedStyle}>Automatic code correction results will appear here.</p>
    <p style={mutedStyle}>When you edit files, ACC will fix formatting, run linters and type checkers, and show what was corrected.</p>
    <p style={mutedStyle}>No operations recorded in this session yet.</p>
  </section></main>
  return <main style={pageStyle} aria-label="AutoCorrect operations">
    <section style={{ ...cardStyle, background: 'var(--dsw-alias-bg-module-highlight)', display: 'flex', gap: 16, flexWrap: 'wrap' }}
      aria-label="Session summary">
      <div>Files <strong>{summary.files}</strong></div>
      <div>Fixed <strong>{summary.fixed}</strong></div>
      {summary.remaining > 0 && <div>Remaining <strong>{summary.remaining}</strong></div>}
      <div>Duration <strong>{(summary.duration / 1000).toFixed(1)}s</strong></div>
      <div>Tools: {summary.tools.join(', ')}</div>
    </section>
    {groups.length > 0 && <section style={cardStyle} aria-label="Issue categories">
      <h3>Issues by Category</h3>
      {groups.map(group => <div key={group.label}>
        <strong style={mutedStyle}>{group.label}</strong>
        {group.items.slice(0, 5).map(issue => <div key={issue.code} style={{ ...mutedStyle, marginLeft: 16 }}>
          {issue.fixed ? '✓' : '⚠'} {issue.code}: {issue.message}{issue.count > 1 ? ' (×' + issue.count + ')' : ''}
        </div>)}
      </div>)}
    </section>}
    {rows.map(row => <FileOperationCard key={row.key} row={row} />)}
  </main>
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
