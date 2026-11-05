import React, { useMemo, useSyncExternalStore, useState } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type {
  ConversationNodeContext,
  ConversationViewBuilder,
  ConversationViewNode,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { isAccResultMeta, type AccResultMeta, type AccOperationRecord } from '../operation-record.js'

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
  if (event.type === 'plugin:auto-code-correct/operation' || event.type === 'auto-code-correct/operation') {
    const data = (event as { data?: unknown }).data
    return isAccResultMeta(data) ? data : undefined
  }
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

// ============================================================================
// Phase 1 & 2: Enhanced Data Extraction
// ============================================================================

interface ParsedIssue {
  line?: number
  column?: number
  code?: string
  severity: 'error' | 'warning' | 'info'
  message: string
  fixed: boolean
}

/**
 * Parse tool output to extract structured issues.
 * Supports: ruff, ty, eslint, tsc, clippy, rustfmt
 */
function parseIssues(operation: AccOperationRecord): ParsedIssue[] {
  const issues: ParsedIssue[] = []
  const lines = operation.output.split('\n')

  for (const line of lines) {
    // Ruff format: "path/file.py:10:5: E201 whitespace after '('"
    const ruffMatch = line.match(/^[^:]+:(\d+):(\d+):\s+([A-Z]\d+)\s+(.+)$/)
    if (ruffMatch) {
      issues.push({
        line: parseInt(ruffMatch[1], 10),
        column: parseInt(ruffMatch[2], 10),
        code: ruffMatch[3],
        severity: ruffMatch[3].startsWith('E') ? 'error' : 'warning',
        message: ruffMatch[4],
        fixed: operation.kind === 'fixer' && operation.status === 'clean',
      })
      continue
    }

    // ty format: "path/file.py:45: error: Incompatible return type"
    const tyMatch = line.match(/^[^:]+:(\d+):\s+(error|warning|note):\s+(.+)$/)
    if (tyMatch) {
      issues.push({
        line: parseInt(tyMatch[1], 10),
        severity: tyMatch[2] === 'error' ? 'error' : tyMatch[2] === 'warning' ? 'warning' : 'info',
        message: tyMatch[3],
        fixed: false,
      })
      continue
    }

    // ESLint format: "  10:5  error  'x' is assigned a value but never used  no-unused-vars"
    const eslintMatch = line.match(/^\s+(\d+):(\d+)\s+(error|warning)\s+(.+?)\s{2}(.+)$/)
    if (eslintMatch) {
      issues.push({
        line: parseInt(eslintMatch[1], 10),
        column: parseInt(eslintMatch[2], 10),
        code: eslintMatch[5],
        severity: eslintMatch[3] === 'error' ? 'error' : 'warning',
        message: eslintMatch[4],
        fixed: operation.kind === 'fixer' && operation.status === 'clean',
      })
      continue
    }
  }

  return issues
}

interface SessionSummary {
  totalFiles: number
  totalOperations: number
  totalFixed: number
  totalFindings: number
  totalDuration: number
  toolsUsed: Set<string>
}

function computeSummary(rows: AccSnapshot): SessionSummary {
  let totalFiles = 0
  let totalOperations = 0
  let totalFixed = 0
  let totalFindings = 0
  let totalDuration = 0
  const toolsUsed = new Set<string>()

  for (const row of rows) {
    totalFiles++
    for (const operation of row.data.operations) {
      totalOperations++
      toolsUsed.add(operation.name)
      totalDuration += operation.endedAt - operation.startedAt

      const issues = parseIssues(operation)
      const fixed = issues.filter((i) => i.fixed).length
      const findings = issues.filter((i) => !i.fixed).length

      if (operation.kind === 'fixer' && operation.status === 'clean' && issues.length > 0) {
        totalFixed += fixed
      }
      if (operation.status === 'findings') {
        totalFindings += findings > 0 ? findings : 1
      }
    }
  }

  return { totalFiles, totalOperations, totalFixed, totalFindings, totalDuration, toolsUsed }
}

interface IssueCategory {
  category: string
  issues: Array<{ code: string; message: string; count: number; fixed: number }>
}

function categorizeIssues(rows: AccSnapshot): IssueCategory[] {
  const byCategory = new Map<string, Map<string, { message: string; count: number; fixed: number }>>()

  for (const row of rows) {
    for (const operation of row.data.operations) {
      const issues = parseIssues(operation)
      for (const issue of issues) {
        const category =
          issue.code?.startsWith('E') || issue.code?.startsWith('F')
            ? 'Formatting'
            : issue.severity === 'error'
              ? 'Errors'
              : 'Warnings'

        if (!byCategory.has(category)) byCategory.set(category, new Map())
        const categoryMap = byCategory.get(category)!

        const key = issue.code || issue.message
        const existing = categoryMap.get(key) || { message: issue.message, count: 0, fixed: 0 }
        existing.count++
        if (issue.fixed) existing.fixed++
        categoryMap.set(key, existing)
      }
    }
  }

  return Array.from(byCategory.entries()).map(([category, issuesMap]) => ({
    category,
    issues: Array.from(issuesMap.entries())
      .map(([code, data]) => ({ code, ...data }))
      .sort((a, b) => b.count - a.count),
  }))
}

// ============================================================================
// Phase 1: Styles
// ============================================================================

const pageStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  padding: 16,
  overflow: 'auto',
}

const summaryCardStyle: React.CSSProperties = {
  border: '1px solid var(--dsw-alias-border-l2)',
  borderRadius: 12,
  background: 'var(--dsw-alias-bg-module-highlight)',
  padding: '12px 16px',
  display: 'flex',
  gap: 16,
  flexWrap: 'wrap',
  alignItems: 'center',
}

const cardStyle: React.CSSProperties = {
  border: '1px solid var(--dsw-alias-border-l2)',
  borderRadius: 12,
  background: 'var(--dsw-alias-bg-module-platform)',
  padding: '14px 16px',
}

const statStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
}

const statLabelStyle: React.CSSProperties = {
  color: 'var(--dsw-alias-label-secondary)',
  fontSize: 12,
  lineHeight: '18px',
}

const statValueStyle: React.CSSProperties = {
  color: 'var(--dsw-alias-label-primary)',
  fontSize: 20,
  lineHeight: '24px',
  fontWeight: 600,
}

const mutedStyle: React.CSSProperties = {
  color: 'var(--dsw-alias-label-secondary)',
  fontSize: 13,
  lineHeight: '20px',
}

const labelStyle: React.CSSProperties = {
  color: 'var(--dsw-alias-label-primary)',
  fontSize: 14,
  lineHeight: '20px',
  fontWeight: 500,
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 8,
}

const buttonStyle: React.CSSProperties = {
  padding: '4px 8px',
  fontSize: 12,
  border: '1px solid var(--dsw-alias-border-l2)',
  borderRadius: 6,
  background: 'var(--dsw-alias-bg-module-platform)',
  color: 'var(--dsw-alias-label-primary)',
  cursor: 'pointer',
}

// ============================================================================
// Phase 1: Session Summary Component
// ============================================================================

function SessionSummaryCard({ summary }: { summary: SessionSummary }): React.ReactElement {
  return (
    <section style={summaryCardStyle} aria-label="Session summary">
      <div style={statStyle}>
        <span style={statLabelStyle}>Files</span>
        <span style={statValueStyle}>{summary.totalFiles}</span>
      </div>
      <div style={statStyle}>
        <span style={statLabelStyle}>Fixed</span>
        <span style={{ ...statValueStyle, color: 'var(--dsw-alias-state-success-primary)' }}>
          {summary.totalFixed}
        </span>
      </div>
      {summary.totalFindings > 0 && (
        <div style={statStyle}>
          <span style={statLabelStyle}>Remaining</span>
          <span style={{ ...statValueStyle, color: 'var(--dsw-alias-state-warning-primary)' }}>
            {summary.totalFindings}
          </span>
        </div>
      )}
      <div style={statStyle}>
        <span style={statLabelStyle}>Duration</span>
        <span style={statValueStyle}>{(summary.totalDuration / 1000).toFixed(1)}s</span>
      </div>
      <div style={{ flex: 1, minWidth: 200 }}>
        <span style={statLabelStyle}>Tools: </span>
        <span style={mutedStyle}>{Array.from(summary.toolsUsed).join(', ')}</span>
      </div>
    </section>
  )
}

// ============================================================================
// Phase 2: Issue Categories Component
// ============================================================================

function IssueCategoriesCard({ categories }: { categories: IssueCategory[] }): React.ReactElement | null {
  if (categories.length === 0 || categories.every((cat) => cat.issues.length === 0)) return null

  return (
    <section style={cardStyle} aria-label="Issue categories">
      <h3 style={labelStyle}>Issues by Category</h3>
      {categories.map((category) =>
        category.issues.length === 0 ? null : (
          <div key={category.category} style={{ marginTop: 12 }}>
            <strong style={mutedStyle}>{category.category}</strong>
            {category.issues.slice(0, 5).map((issue) => (
              <div key={issue.code} style={{ ...mutedStyle, marginLeft: 16, marginTop: 4 }}>
                {issue.fixed > 0 ? '✓' : '⚠'} {issue.code}: {issue.message}{' '}
                {issue.count > 1 && `(×${issue.count})`}
                {issue.fixed > 0 && issue.fixed < issue.count && ` - ${issue.fixed} fixed`}
              </div>
            ))}
          </div>
        ),
      )}
    </section>
  )
}

// ============================================================================
// Phase 2: Diff Viewer Component
// ============================================================================

function DiffViewer({
  beforeText,
  afterText,
}: {
  beforeText: string
  afterText: string
}): React.ReactElement {
  const lines = useMemo(() => {
    const before = beforeText.split('\n')
    const after = afterText.split('\n')
    const maxLen = Math.max(before.length, after.length)
    const diffs: Array<{ line: number; before?: string; after?: string; changed: boolean }> = []

    for (let i = 0; i < maxLen; i++) {
      const b = before[i]
      const a = after[i]
      if (b !== a) {
        diffs.push({ line: i + 1, before: b, after: a, changed: true })
      }
    }

    return diffs.slice(0, 10) // Limit to first 10 changes
  }, [beforeText, afterText])

  if (lines.length === 0) return <span style={mutedStyle}>No changes detected</span>

  return (
    <div style={{ marginTop: 8 }}>
      <pre
        style={{
          ...mutedStyle,
          whiteSpace: 'pre-wrap',
          background: 'var(--dsw-alias-bg-layer-1)',
          padding: 8,
          borderRadius: 6,
          margin: 0,
        }}
      >
        {lines.map((diff) => (
          <div key={diff.line}>
            {diff.before !== undefined && (
              <div style={{ color: 'var(--dsw-alias-state-error-primary)' }}>- {diff.before}</div>
            )}
            {diff.after !== undefined && (
              <div style={{ color: 'var(--dsw-alias-state-success-primary)' }}>+ {diff.after}</div>
            )}
          </div>
        ))}
      </pre>
    </div>
  )
}

// ============================================================================
// Phase 1 & 2: Enhanced File Card
// ============================================================================

function FileOperationCard({ row }: { row: AccViewNode }): React.ReactElement {
  const [expanded, setExpanded] = useState(false)

  const summary = useMemo(() => {
    let fixed = 0
    let findings = 0
    for (const op of row.data.operations) {
      const issues = parseIssues(op)
      fixed += issues.filter((i) => i.fixed).length
      findings += issues.filter((i) => !i.fixed && op.status === 'findings').length
    }
    return { fixed, findings }
  }, [row.data.operations])

  return (
    <section key={row.key} style={cardStyle}>
      <div style={headerStyle}>
        <div>
          <strong style={labelStyle}>📄 {row.data.filePath}</strong>
          <p style={mutedStyle}>
            via {row.data.parentToolName} · {row.data.operations.length} operation(s)
            {summary.fixed > 0 && ` · ${summary.fixed} fixed`}
            {summary.findings > 0 && ` · ${summary.findings} remaining`}
          </p>
        </div>
        <button type="button" style={buttonStyle} onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Collapse ▲' : 'Expand ▼'}
        </button>
      </div>

      {expanded &&
        row.data.operations.map((operation) => {
          const issues = parseIssues(operation)
          const statusIcon = operation.status === 'clean' ? '✓' : operation.status === 'findings' ? '⚠' : '✗'

          return (
            <div
              key={operation.id}
              style={{ borderTop: '1px solid var(--dsw-alias-border-l2)', paddingTop: 8, marginTop: 8 }}
            >
              <div style={headerStyle}>
                <span>
                  <strong>
                    {statusIcon} {operation.name}
                  </strong>
                  <span style={mutedStyle}>
                    {' '}
                    · {operation.kind} · {operation.status} · {operation.endedAt - operation.startedAt}ms
                  </span>
                </span>
              </div>

              {issues.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <span style={mutedStyle}>
                    {issues.filter((i) => i.fixed).length > 0 &&
                      `Fixed ${issues.filter((i) => i.fixed).length} issues`}
                    {issues.filter((i) => !i.fixed).length > 0 &&
                      ` · ${issues.filter((i) => !i.fixed).length} remaining`}
                  </span>
                  {issues.slice(0, 3).map((issue, idx) => (
                    <div key={idx} style={{ ...mutedStyle, marginLeft: 16, marginTop: 4 }}>
                      {issue.fixed ? '✓' : '⚠'} Line {issue.line}: {issue.code && `${issue.code} - `}
                      {issue.message}
                    </div>
                  ))}
                  {issues.length > 3 && <span style={mutedStyle}>... and {issues.length - 3} more</span>}
                </div>
              )}

              {operation.change && (
                <details style={{ marginTop: 8 }}>
                  <summary style={{ ...mutedStyle, cursor: 'pointer' }}>View diff</summary>
                  <DiffViewer
                    beforeText={operation.change.beforeText}
                    afterText={operation.change.afterText}
                  />
                </details>
              )}

              {operation.output && issues.length === 0 && (
                <pre style={{ ...mutedStyle, whiteSpace: 'pre-wrap', margin: '8px 0 0', fontSize: 12 }}>
                  {operation.output.slice(0, 500)}
                  {operation.output.length > 500 && '...'}
                </pre>
              )}
            </div>
          )
        })}
    </section>
  )
}

// ============================================================================
// Main Enhanced View
// ============================================================================

function AutoCorrectView(props: { useAutoCodeCorrect: AccSource }): React.ReactElement {
  const rows = useSyncExternalStore(
    props.useAutoCodeCorrect.subscribe,
    props.useAutoCodeCorrect.getSnapshot,
    props.useAutoCodeCorrect.getSnapshot,
  )

  const summary = useMemo(() => computeSummary(rows), [rows])
  const categories = useMemo(() => categorizeIssues(rows), [rows])

  if (rows.length === 0) {
    return (
      <main style={pageStyle}>
        <section style={cardStyle}>
          <h3 style={labelStyle}>📝 AutoCorrect</h3>
          <p style={mutedStyle}>Automatic code correction results will appear here.</p>
          <p style={mutedStyle}>
            When you edit files, ACC will:
            <br />• Fix formatting issues automatically
            <br />• Run linters and type checkers
            <br />• Show what was corrected
          </p>
          <p style={mutedStyle}>No operations recorded in this session yet.</p>
        </section>
      </main>
    )
  }

  return (
    <main style={pageStyle} aria-label="AutoCorrect operations">
      <SessionSummaryCard summary={summary} />
      <IssueCategoriesCard categories={categories} />
      {rows.map((row) => (
        <FileOperationCard key={row.key} row={row} />
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
    isActive: () => true,
  })
  ctx.uiConversation.events.register({
    kind: 'auto-code-correct',
    target,
    match: {
      'plugin:auto-code-correct/operation': (event) => {
        const metadata = metaFromEvent(event)
        return metadata === undefined ? null : { id: metadata.parentCallId, role: 'start' }
      },
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
