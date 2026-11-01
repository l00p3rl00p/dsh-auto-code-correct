/** Native DSH ConfigForms settings companion for ACC. */
import React, { useState, useSyncExternalStore } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import { CAPABILITIES } from '../capabilities.js'
import type { Language } from '../capabilities.js'

type Settings = {
  languages?: Record<Language, boolean>
  capabilities?: Record<string, boolean>
  languageServers?: Record<Language, boolean>
  executables?: Record<string, string>
}
const FALLBACK: Record<Language, boolean> = { python: true, rust: false, typescript: false }
const LABELS: Record<Language, string> = { python: 'Python', rust: 'Rust', typescript: 'TypeScript' }
let form: ConfigForm<Settings> | undefined

export const inject = ['slots', 'configForms']
export const name = 'auto-code-correct-settings'

function PluginPage(): React.JSX.Element {
  const scope = form
  if (!scope) return <div>ACC settings are not available.</div>
  return <ConfigPage scope={scope} />
}
function ConfigPage({ scope }: { scope: ConfigForm<Settings> }): React.JSX.Element {
  const snapshot = useSyncExternalStore(
    (listener) => scope.subscribe(listener),
    () => scope.getSnapshot(),
  )
  const [working, setWorking] = useState<string | null>(null)
  const [error, setError] = useState('')
  const value = snapshot.value ?? {}
  const languages = { ...FALLBACK, ...value.languages }
  const capabilities = value.capabilities ?? {}
  const servers = value.languageServers ?? FALLBACK

  async function change(path: string[], next: boolean): Promise<void> {
    if (snapshot.status !== 'ready' || !snapshot.writable) return
    const id = path.join('.')
    setWorking(id)
    setError('')
    try {
      await scope.mutate([{ op: 'set', path, value: next }], scope.getSnapshot().revision)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setWorking(null)
    }
  }

  const switchRow = (id: string, label: string, enabled: boolean, path: string[], disabled = false) =>
    <label key={id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', gap: 16 }}>
      <span>{label}</span>
      <input type="checkbox" checked={enabled} disabled={disabled || working !== null || !snapshot.writable}
        onChange={(event) => void change(path, event.target.checked)} />
    </label>

  const panel = (title: string, children: React.ReactNode) =>
    <section key={title} style={{ border: '1px solid currentColor', borderRadius: 10, padding: 16, marginBottom: 16 }}>
      <h3 style={{ marginTop: 0 }}>{title}</h3>{children}
    </section>

  const languagePanels: React.ReactNode[] = []
  for (const lang of Object.keys(LABELS) as Language[]) {
    const enabled = languages[lang]
    languagePanels.push(panel(LABELS[lang], <>
      {switchRow(lang, 'Enable ' + LABELS[lang], enabled, ['languages', lang])}
      {enabled ? <>
        <h4>Automatic corrections and verification</h4>
        {CAPABILITIES.filter(cap => cap.language === lang && cap.group === 'autoCorrect').map(cap =>
          switchRow(cap.id, cap.label, capabilities[cap.id] !== false, ['capabilities', cap.id]))}
        <h4>Language server</h4>
        {CAPABILITIES.filter(cap => cap.language === lang && cap.group === 'languageServer').map(cap =>
          switchRow(cap.id, cap.label, servers[lang] !== false && capabilities[cap.id] !== false, ['capabilities', cap.id]))}
      </> : <p>Language disabled; no tools are run or managed.</p>}
    </>))
  }
  return <main style={{ maxWidth: 780, padding: 20 }}>
    <h2>Auto Code Correct</h2>
    <p>Effective DeepSeek Harness configuration. Changes are persisted through native ConfigForms.</p>
    {snapshot.status !== 'ready' ? <p>Settings {snapshot.status}.</p> : null}
    {error ? <p role="alert">{error}</p> : null}
    {panel('1. Languages and tools', <p>Enable only the languages you need. Each language owns its autofix, verification, and LSP controls.</p>)}
    {languagePanels}
    {panel('4. Repository Hygiene', <>
      <p>Checks run at Git boundaries; a history scan is manual. The Git hook uses the same capability identifiers.</p>
      {CAPABILITIES.filter(cap => cap.group === 'hygiene').map(cap => switchRow(cap.id, cap.label, capabilities[cap.id] === true || (capabilities[cap.id] === undefined && ['git-diff','gitleaks','large-files'].includes(cap.id)), ['capabilities', cap.id]))}
    </>)}
    {panel('Dependency installation', <>
      <p>ACC reuses installed tools first. A missing tool must be installed explicitly using its manager; toggling does not silently install or uninstall anything.</p>
      <p>Install and remove operations are available through the package's acc-tools command. Host-side approval and availability controls must be connected before buttons can safely execute installations from this page.</p>
    </>)}
  </main>
}
export function apply(ctx: Context): void {
  const scope = ctx.configForms.get<Settings>('auto-code-correct')
  ctx.slots.inject('settings.plugins.tab', () => {
    form = scope
    const dispose = ctx.slots.register({
      name: 'settings.plugins.tab',
      id: 'auto-code-correct',
      order: 30,
      label: () => 'Auto Code Correct',
    }, PluginPage)
    return () => { dispose(); form = undefined }
  })
}
