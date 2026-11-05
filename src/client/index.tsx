/** Native DSH ConfigForms settings companion for ACC. */
import React, { useEffect, useState, useSyncExternalStore } from 'react'
import type { CSSProperties } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { ConfigPageForm, PluginConfigViewProps } from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import { CAPABILITIES } from '../capabilities.js'
import type { Language } from '../capabilities.js'
import { registerAutoCorrectView } from './autocorrect-view.js'
import { TYPERT_REMOTE } from '../typert.remote-client.js'
import type { AccReadinessSnapshot } from '../readiness.js'

type Settings = {
  languages?: Record<Language, boolean>
  capabilities?: Record<string, boolean>
  languageServers?: Record<Language, boolean>
  hygieneEnabled?: boolean
  executables?: Record<string, string>
}

const FALLBACK_LANGUAGES: Record<Language, boolean> = { python: true, rust: false, typescript: false }
const FALLBACK_SERVERS: Record<Language, boolean> = { python: true, rust: true, typescript: true }
const LABELS: Record<Language, string> = { python: 'Python', rust: 'Rust', typescript: 'TypeScript' }
const LANGUAGE_HINTS: Record<Language, string> = {
  python: 'Run Python correction, verification, and language-server tools.',
  rust: 'Run Rust formatting, lint, build-check, and language-server tools.',
  typescript: 'Run TypeScript formatting, lint, type-check, and language-server tools.',
}
const DEFAULT_HYGIENE = ['git-diff', 'gitleaks', 'shellcheck']

const pageStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 16 }
const cardStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 0,
  padding: '16px 18px',
  border: '1px solid var(--dsw-alias-border-l2)',
  borderRadius: 12,
  background: 'var(--dsw-alias-bg-module-platform)',
}
const titleStyle: CSSProperties = {
  margin: 0,
  color: 'var(--dsw-alias-label-primary)',
  fontSize: 14,
  lineHeight: '20px',
  fontWeight: 600,
}
const groupStyle: CSSProperties = {
  margin: '12px 0 2px',
  color: 'var(--dsw-alias-label-secondary)',
  fontSize: 12,
  lineHeight: '18px',
  fontWeight: 600,
}
const hintStyle: CSSProperties = {
  margin: '4px 0 8px',
  color: 'var(--dsw-alias-label-secondary)',
  fontSize: 13,
  lineHeight: '20px',
}
const rowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 16,
  padding: '8px 0',
}
const copyStyle: CSSProperties = { display: 'flex', minWidth: 0, flexDirection: 'column', gap: 3 }
const labelStyle: CSSProperties = {
  color: 'var(--dsw-alias-label-primary)',
  fontSize: 14,
  lineHeight: '20px',
  fontWeight: 500,
}
const descriptionStyle: CSSProperties = {
  color: 'var(--dsw-alias-label-secondary)',
  fontSize: 13,
  lineHeight: '20px',
}

// Client services must be explicitly declared for the Cordis browser runner.
// `uiConversation` owns the AutoCorrect tab registration.
export const inject = ['slots', 'configForms', 'uiConversation', 'remote']
export const name = 'auto-code-correct-settings'

function createPluginPage(
  scope: ConfigForm<Record<string, unknown>>,
  loadReadiness: (signal: AbortSignal) => Promise<AccReadinessSnapshot>,
) {
  const subscribe = (listener: () => void) => scope.subscribe(listener)
  const getSnapshot = () => scope.getSnapshot()
  const mutate = scope.mutate.bind(scope)

  return function PluginPage({ view }: PluginConfigViewProps): React.JSX.Element {
    const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
    if (view === 'summary') return <span>Language gates, autofix, verification, and Git hygiene.</span>
    return <ConfigPage form={{ state, mutate }} loadReadiness={loadReadiness} />
  }
}

function PreferenceToggle({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string
  checked: boolean
  disabled: boolean
  onChange: (value: boolean) => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        position: 'relative',
        width: 40,
        height: 22,
        flex: '0 0 auto',
        marginTop: 1,
        padding: 0,
        border: 0,
        borderRadius: 999,
        background: checked
          ? 'var(--dsw-alias-button-primary-fill)'
          : 'var(--dsw-alias-bg-layer-2, rgba(127, 127, 127, 0.24))',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'background 120ms ease, opacity 120ms ease',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 3,
          left: checked ? 21 : 3,
          width: 16,
          height: 16,
          borderRadius: '50%',
          background: 'var(--dsw-alias-label-primary-foreground, #fff)',
          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.22)',
          transition: 'left 120ms ease',
        }}
      />
    </button>
  )
}

function ConfigPage({
  form,
  loadReadiness,
}: {
  form: ConfigPageForm
  loadReadiness: (signal: AbortSignal) => Promise<AccReadinessSnapshot>
}): React.JSX.Element {
  const snapshot = form.state
  const [working, setWorking] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [readiness, setReadiness] = useState<AccReadinessSnapshot | null>(null)
  const [readinessError, setReadinessError] = useState('')
  const [refreshingReadiness, setRefreshingReadiness] = useState(false)
  const value = (snapshot.value ?? {}) as Settings
  const languages = { ...FALLBACK_LANGUAGES, ...value.languages }
  const capabilities = value.capabilities ?? {}
  const servers = { ...FALLBACK_SERVERS, ...value.languageServers }

  async function refreshReadiness(signal: AbortSignal): Promise<void> {
    setRefreshingReadiness(true)
    setReadinessError('')
    try {
      setReadiness(await loadReadiness(signal))
    } catch (err) {
      if (!signal.aborted) setReadinessError(err instanceof Error ? err.message : String(err))
    } finally {
      if (!signal.aborted) setRefreshingReadiness(false)
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    void refreshReadiness(controller.signal)
    return () => controller.abort()
  }, [snapshot.revision])

  async function change(path: string[], next: boolean): Promise<void> {
    if (snapshot.status !== 'ready' || !snapshot.writable) return
    const id = path.join('.')
    setWorking(id)
    setError('')
    try {
      const accepted = await form.mutate([{ op: 'set', path, value: next }], snapshot.revision)
      if (!accepted) setError('The setting changed elsewhere. Review the refreshed value and try again.')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setWorking(null)
    }
  }

  const switchRow = (
    id: string,
    label: string,
    description: string,
    enabled: boolean,
    path: string[],
    disabled = false,
  ) => (
    <div key={id} style={rowStyle}>
      <span style={copyStyle}>
        <span style={labelStyle}>{label}</span>
        <span style={descriptionStyle}>{description}</span>
      </span>
      <PreferenceToggle
        label={label}
        checked={enabled}
        disabled={disabled || working !== null || !snapshot.writable}
        onChange={(next) => void change(path, next)}
      />
    </div>
  )

  const languagePanels = (Object.keys(LABELS) as Language[]).map((lang) => {
    const enabled = languages[lang]
    return (
      <section key={lang} style={cardStyle}>
        <h3 style={titleStyle}>{LABELS[lang]}</h3>
        <p style={hintStyle}>{LANGUAGE_HINTS[lang]}</p>
        {switchRow(
          `${lang}-enabled`,
          `Enable ${LABELS[lang]}`,
          `Master switch for every ${LABELS[lang]} correction, check, and language-server operation.`,
          enabled,
          ['languages', lang],
        )}
        <h4 style={groupStyle}>Automatic correction and verification</h4>
        {CAPABILITIES.filter((cap) => cap.language === lang && cap.group === 'autoCorrect').map((cap) =>
          switchRow(
            cap.id,
            cap.label,
            `${cap.description}. Uses the existing ${cap.executable} executable.`,
            capabilities[cap.id] !== false,
            ['capabilities', cap.id],
            !enabled,
          ),
        )}
        <h4 style={groupStyle}>Language server</h4>
        {switchRow(
          `${lang}-language-server`,
          `Enable ${LABELS[lang]} language server`,
          'Controls native DSH diagnostics, formatting, code actions, symbols, completion, and navigation.',
          servers[lang],
          ['languageServers', lang],
          !enabled,
        )}
        {CAPABILITIES.filter((cap) => cap.language === lang && cap.group === 'languageServer').map((cap) =>
          switchRow(
            cap.id,
            cap.label,
            `${cap.description}. Uses the existing ${cap.executable} executable.`,
            capabilities[cap.id] !== false,
            ['capabilities', cap.id],
            !enabled || !servers[lang],
          ),
        )}
      </section>
    )
  })

  return (
    <main style={pageStyle}>
      {snapshot.status !== 'ready' ? <p style={hintStyle}>Settings are {snapshot.status}.</p> : null}
      {error ? (
        <p role="alert" style={{ ...hintStyle, color: 'var(--dsw-alias-state-error-primary)' }}>
          {error}
        </p>
      ) : null}
      <section style={cardStyle} aria-label="Environment readiness">
        <div style={{ ...rowStyle, paddingTop: 0 }}>
          <span style={copyStyle}>
            <h3 style={titleStyle}>Environment readiness</h3>
            <span style={descriptionStyle}>
              {readiness
                ? `Last checked ${new Date(readiness.checkedAt).toLocaleTimeString()} · ${readiness.projectPath}`
                : 'Checking executable and project configuration readiness…'}
            </span>
          </span>
          <button
            type="button"
            disabled={refreshingReadiness}
            onClick={() => void refreshReadiness(new AbortController().signal)}
          >
            {refreshingReadiness ? 'Checking…' : 'Refresh'}
          </button>
        </div>
        {readinessError ? (
          <p role="alert" style={{ ...hintStyle, color: 'var(--dsw-alias-state-error-primary)' }}>
            {readinessError}
          </p>
        ) : null}
        {readiness?.tools.map((tool) => {
          const isWarning = tool.state === 'unavailable' || tool.state === 'failed'
          const isInfo = tool.state === 'installed' || tool.state === 'configured'
          const warningColor = 'var(--dsw-alias-state-warning-primary)'
          const errorColor = 'var(--dsw-alias-state-error-primary)'
          const successColor = 'var(--dsw-alias-state-success-primary)'
          const stateColor =
            tool.state === 'ready'
              ? successColor
              : tool.state === 'disabled'
                ? 'var(--dsw-alias-label-secondary)'
                : isWarning
                  ? tool.state === 'failed'
                    ? errorColor
                    : warningColor
                  : 'var(--dsw-alias-label-primary)'

          return (
            <div key={tool.id} style={{ ...rowStyle, borderTop: '1px solid var(--dsw-alias-border-l2)' }}>
              <span style={copyStyle}>
                <span style={labelStyle}>
                  {tool.state === 'ready' && '✓ '}
                  {isWarning && '⚠ '}
                  {tool.state === 'failed' && '✗ '}
                  {tool.label}
                </span>
                <span style={{ ...descriptionStyle, color: isWarning ? warningColor : undefined }}>
                  {tool.state === 'unavailable' && '⚠ Tool not found. Please install or configure path.'}
                  {tool.state === 'failed' && '✗ Tool configuration failed. Check settings.'}
                  {tool.state !== 'unavailable' && tool.state !== 'failed' && tool.detail}
                  {tool.version ? ` · ${tool.version}` : ''}
                </span>
              </span>
              <strong style={{ ...descriptionStyle, textTransform: 'capitalize', color: stateColor }}>
                {tool.state}
              </strong>
            </div>
          )
        })}
      </section>
      <section style={cardStyle}>
        <h3 style={titleStyle}>Languages and tools</h3>
        <p style={hintStyle}>
          Changes save immediately through DSH ConfigForms and persist in the active profile after reload or
          restart.
        </p>
      </section>
      {languagePanels}
      <section style={cardStyle}>
        <h3 style={titleStyle}>Repository hygiene</h3>
        <p style={hintStyle}>Run the enabled checks from ACC&apos;s chained pre-commit hook.</p>
        {switchRow(
          'hygieneEnabled',
          'Enable automatic Git pre-commit hygiene',
          'Master switch for staged-change checks. Existing repository hooks are preserved and run afterward.',
          value.hygieneEnabled !== false,
          ['hygieneEnabled'],
        )}
        {CAPABILITIES.filter((cap) => cap.group === 'hygiene').map((cap) =>
          switchRow(
            cap.id,
            cap.label,
            `${cap.description}. Uses ${cap.executable}${DEFAULT_HYGIENE.includes(cap.id) ? ' and is enabled by default' : '; optional checks can block a commit when selected'}.`,
            capabilities[cap.id] === true ||
              (capabilities[cap.id] === undefined && DEFAULT_HYGIENE.includes(cap.id)),
            ['capabilities', cap.id],
            value.hygieneEnabled === false,
          ),
        )}
      </section>
      <section style={cardStyle}>
        <h3 style={titleStyle}>Tool resolution</h3>
        <p style={{ ...hintStyle, marginBottom: 0 }}>
          ACC reuses project-local tools and executables already available to DSH. A toggle never installs or
          removes software. Use <code>/acc status &lt;capability-id&gt;</code> to inspect availability and{' '}
          <code>/acc link &lt;capability-id&gt; /absolute/path</code> to save an existing executable path.
        </p>
      </section>
    </main>
  )
}

export async function apply(ctx: Context): Promise<() => Promise<void>> {
  // Mount creates remote.accReadiness, but the mounting fiber cannot read
  // its own newly-created service. Cordis grants that access only to a child
  // fiber explicitly injecting the namespace (DSH native Remote pattern).
  const disposeRemote = await ctx.remote.$mount(TYPERT_REMOTE)
  ctx.inject(['slots', 'configForms', 'uiConversation', 'remote.accReadiness'], (scope) => {
    registerAutoCorrectView(scope)
    const config = scope.configForms.get<Record<string, unknown>>('auto-code-correct')
    const PluginPage = createPluginPage(config, async (signal) => {
      const result = await scope.remote.accReadiness.snapshot(signal)
      if (!result.ok) throw result.error
      return result.value
    })
    scope.effect(
      () =>
        scope.configForms.whileServed(['auto-code-correct'], () =>
          scope.slots.inject('plugins.bundle.config', () =>
            scope.slots.register(
              {
                name: 'plugins.bundle.config',
                key: 'dsh-auto-code-correct',
              },
              PluginPage,
            ),
          ),
        ),
      'auto-code-correct: plugin detail configuration',
    )
  })
  return disposeRemote
}
