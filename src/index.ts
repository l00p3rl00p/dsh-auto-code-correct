/**
 * Post-edit diagnostics. After a file-mutating tool succeeds, this plugin runs
 * the checkers configured for that file's extension and attaches their output
 * to the same tool result as model-visible context, so the next model request
 * already carries the type errors or lint findings the edit introduced.
 *
 * It never vetoes and never rewrites a call: it delegates the `tools/post-execute`
 * waterfall first and only folds context onto whatever decision came back.
 * @module dsh-auto-code-correct
 */

import { dirname, isAbsolute, relative, resolve, parse } from 'node:path'
import { existsSync } from 'node:fs'
import { capabilityEnabled, languageForExtension } from './capabilities.js'
import { registerAccCommands } from './commands.js'
import { DEFAULT_HYGIENE, syncGitHygiene } from './hygiene-hook.js'
import { configuredToolDirectories, findTool } from './discovery.js'
import type { Language } from './capabilities.js'
import * as nativeLspStdio from '@deepseek-ai/dsh-lsp-stdio'
import * as lspActions from 'dsh-lsp-actions'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { MessageSource } from '@deepseek-ai/dsh-llm'
import type { UserMessage } from '@deepseek-ai/dsh-session'
import type { SubprocessRuntime } from '@deepseek-ai/dsh-subprocess'
import type { PostToolDecision, ToolExecution, ToolExecutionResult } from '@deepseek-ai/dsh-tools'

export const name = 'auto-code-correct'
export const inject = ['subprocess']

/**
 * One external checker: which files it claims, how to invoke it, and how to
 * read its verdict. Every deployment-varying value is a field here — the
 * plugin holds no built-in command, timeout, or output cap.
 */
export interface CheckerConfig {
  /** Label shown to the model above this checker's output. */
  name: string
  /**
   * Lowercase, leading-dot file extensions this checker claims (`['.ts', '.tsx']`).
   * A file matching no checker produces no diagnostics.
   */
  extensions: string[]
  /**
   * Executable and arguments. `argv[0]` is resolved against the subprocess
   * provider's scrubbed PATH; it is never shell-interpreted. Three
   * placeholders are substituted per run: `{file}` (absolute path of the
   * edited file), `{relFile}` (that path relative to `cwd`), and `{dir}` (its
   * containing directory).
   */
  argv: string[]
  /** Working directory, resolved against the harness process directory (the workspace root). */
  cwd: string
  /** Wall-clock bound for one run; the process tree is terminated when it expires. */
  timeoutMs: number
  /** SIGTERM-to-SIGKILL grace for that termination. */
  graceMs: number
  /** In-memory cap per collected stream; overflow keeps the tail. */
  maxOutputBytes: number
  /** Exit codes meaning "no findings"; any other code reports the collected output. */
  cleanExitCodes: number[]
  /** Which streams carry findings, in the order they are concatenated. */
  streams: ('stdout' | 'stderr')[]
}

/**
 * Plugin config. `checkers` is empty by default: a deployment declares the
 * checkers its toolchain actually has, since a built-in `tsc` or `eslint`
 * invocation would be exactly the hardcoded tunable this repo's conventions
 * forbid.
 */
export interface Config {
  /** Primary language switches: disabled languages are never evaluated. */
  languages: Record<Language, boolean>
  /** Individual named capabilities; false disables one fixer or checker. */
  capabilities: Record<string, boolean>
  /** Native Git pre-commit hygiene runs automatically unless explicitly disabled. */
  hygieneEnabled: boolean
  /** Language-server capability switches; gated by the corresponding language master. */
  languageServers: Record<Language, boolean>
  /** Optional absolute or PATH-resolvable command overrides by executable name. */
  executables: Record<string, string>
  /** Tool names whose successful results are inspected for an edited file. */
  tools: string[]
  /** Checkers, consulted in order; every checker claiming the extension runs. */
  checkers: CheckerConfig[]
  /** Ordered mutating commands, completed before read-only verification. */
  fixers: CheckerConfig[]
  /** Cap on the model-visible diagnostic text per tool result; overflow keeps the head. */
  maxDiagnosticChars: number
}

const CheckerSchema: z<CheckerConfig> = z.object({
  name: z.string().required(),
  extensions: z.array(z.string()).required(),
  argv: z.array(z.string()).required(),
  cwd: z.string().default('.'),
  timeoutMs: z.number().default(30000),
  graceMs: z.number().default(2000),
  maxOutputBytes: z.number().default(65536),
  cleanExitCodes: z.array(z.number()).default([0]),
  streams: z.array(z.union(['stdout', 'stderr'] as const)).default(['stdout', 'stderr']),
})

export const Config: z<Config> = z.object({
  languages: z.object({ python: z.boolean().default(true), rust: z.boolean().default(false), typescript: z.boolean().default(false) }).default({ python: true, rust: false, typescript: false }),
  capabilities: z.dict(z.boolean()).default({}),
  hygieneEnabled: z.boolean().default(true),
  languageServers: z.object({ python: z.boolean().default(true), rust: z.boolean().default(true), typescript: z.boolean().default(true) }).default({ python: true, rust: true, typescript: true }),
  executables: z.dict(z.string()).default({}),
  tools: z.array(z.string()).default(['write', 'edit', 'str_replace_editor']),
  checkers: z.array(CheckerSchema).default([]),
  fixers: z.array(CheckerSchema).default([]),
  maxDiagnosticChars: z.number().default(4000),
})

/**
 * The source stamped on every context this plugin injects. The `plugin` label
 * is load-bearing: an unlabeled context renders as a user prompt in derived
 * history.
 */
declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'auto-code-correct': { kind: 'auto-code-correct' }
  }
}
const PLUGIN_SOURCE: MessageSource = { kind: 'auto-code-correct' }

/** One checker's verdict for one file. */
interface Finding {
  checker: string
  /** Collected text from the checker's declared streams, already trimmed. */
  output: string
}

/**
 * Normalize one extension to the lowercase leading-dot form used for matching,
 * so `TS`, `.TS`, and `.ts` all claim the same files.
 * @param extension - extension as written in config or derived from a path.
 * @returns the normalized form.
 */
function normalizeExtension(extension: string): string {
  const lower = extension.toLowerCase()
  return lower.startsWith('.') ? lower : `.${lower}`
}

/**
 * Final extension of a path, in normalized form.
 * @param filePath - path to inspect.
 * @returns the extension including its dot, or an empty string when the base name has none.
 */
function extensionOf(filePath: string): string {
  const base = filePath.slice(Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\')) + 1)
  const dot = base.lastIndexOf('.')
  return dot > 0 ? normalizeExtension(base.slice(dot)) : ''
}

/**
 * Resolve the file a completed tool call mutated. The canonical value is
 * authoritative — `write` and `edit` both return the backend-resolved `path`,
 * which is the path that was actually touched — and the model-supplied
 * `file_path` argument is the fallback for a tool that declares no such value.
 * @param exec - the completed execution.
 * @param result - its successful result.
 * @returns the edited path, or undefined when neither source carries one.
 */
function editedPath(exec: ToolExecution, result: Readonly<ToolExecutionResult>): string | undefined {
  if (!result.isError) {
    const value: unknown = result.value
    if (typeof value === 'object' && value !== null && 'path' in value) {
      const path = (value as { path: unknown }).path
      if (typeof path === 'string' && path.length > 0) return path
    }
  }
  const args: unknown = exec.arguments
  if (typeof args === 'object' && args !== null && 'file_path' in args) {
    const filePath = (args as { file_path: unknown }).file_path
    if (typeof filePath === 'string' && filePath.length > 0) return filePath
  }
  return undefined
}

/**
 * Substitute the per-run placeholders in one checker's argv.
 * @param argv - the configured argument vector.
 * @param filePath - absolute path of the edited file.
 * @param cwd - the checker's resolved working directory.
 * @returns the argv with `{file}`, `{relFile}`, and `{dir}` replaced.
 */
function substitute(argv: readonly string[], filePath: string, cwd: string): string[] {
  const replacements: Record<string, string> = {
    '{file}': filePath,
    '{relFile}': relative(cwd, filePath),
    '{dir}': dirname(filePath),
  }
  return argv.map(argument =>
    argument.replaceAll(/\{file\}|\{relFile\}|\{dir\}/g, match => replacements[match] as string))
}

/**
 * Head-truncate model-visible diagnostic text, marking what was dropped. The
 * head is kept because compilers and linters emit their first errors first,
 * and the first error is usually the cause of the rest.
 * @param text - the concatenated findings.
 * @param cap - maximum characters to keep.
 * @returns the text, ellipsized with a count when it exceeds the cap.
 */
function boundText(text: string, cap: number): string {
  if (text.length <= cap) return text
  return `${text.slice(0, cap)}\n… (+${text.length - cap} more chars truncated)`
}

/**
 * Validate the load-time invariants the schema cannot express, so an unusable
 * checker fails at plugin load rather than after the first edit.
 * @param checkers - the schema-validated checker list.
 * @throws when a checker has an empty argv, no extensions, no streams, or a non-positive bound.
 */
function validateCheckers(checkers: readonly CheckerConfig[]): void {
  const seen = new Set<string>()
  for (const checker of checkers) {
    const label = checker.name
    if (label.length === 0) throw new Error('auto-code-correct: every checker needs a non-empty `name`')
    if (seen.has(label)) throw new Error(`auto-code-correct: duplicate checker name ${label}`)
    seen.add(label)
    if (checker.argv.length === 0) throw new Error(`auto-code-correct: checker ${label} has an empty \`argv\``)
    if (checker.extensions.length === 0) throw new Error(`auto-code-correct: checker ${label} claims no \`extensions\``)
    if (checker.streams.length === 0) throw new Error(`auto-code-correct: checker ${label} reads no \`streams\``)
    for (const [field, value] of [
      ['timeoutMs', checker.timeoutMs], ['graceMs', checker.graceMs], ['maxOutputBytes', checker.maxOutputBytes],
    ] as const) {
      if (!Number.isInteger(value) || value < 1) {
        throw new Error(`auto-code-correct: checker ${label} has invalid ${field} ${value} — must be an integer >= 1`)
      }
    }
  }
}

/**
 * Install the post-edit diagnostic listener.
 * @param ctx - plugin context; the listener is disposed with it.
 * @param config - validated {@link Config}; checker invariants are re-checked fail-loud here.
 */
export function apply(ctx: Context, config: Config): void {
  registerAccCommands(ctx)
  validateCheckers([...config.fixers, ...config.checkers])
  const effectiveEnabled = (extension: string, name: string): boolean => {
    return capabilityEnabled(languageForExtension(extension), name, config.languages, config.capabilities)
  }
  if (!Number.isInteger(config.maxDiagnosticChars) || config.maxDiagnosticChars < 1) {
    throw new Error(`auto-code-correct: invalid maxDiagnosticChars ${config.maxDiagnosticChars} — must be an integer >= 1`)
  }

  if (config.checkers.length === 0 && config.fixers.length === 0) {
    // Not misconfiguration — the plugin is installed but not yet told what the
    // deployment's toolchain is, and silence would look like a broken plugin.
    console.warn('[auto-code-correct] no checkers configured; this plugin will not run anything. See its README for examples.')
  }

  // Use DSH's native LSP stdio provider, not a parallel LSP implementation.
  // If this deployment has no LSP service, the nested injection stays dormant.
  ctx.inject(['fs', 'lsp', 'subprocess'], async scoped => {
    const entries: Record<string, { command: string; args: string[]; extensionToLanguage: Record<string, string> }> = {}
    const requested = [
      { language: 'python' as const, id: 'ty-lsp', command: 'ty', args: ['server'], mapping: { '.py': 'python' } },
      { language: 'rust' as const, id: 'rust-analyzer', command: 'rust-analyzer', args: [], mapping: { '.rs': 'rust' } },
      { language: 'typescript' as const, id: 'typescript-lsp', command: 'typescript-language-server', args: ['--stdio'], mapping: { '.ts': 'typescript', '.tsx': 'typescriptreact' } },
    ]
    for (const item of requested) {
      if (!config.languages[item.language] || !config.languageServers[item.language] || config.capabilities[item.id] === false) continue
      const command = findTool(item.command, { explicit: config.executables[item.command], prefix: process.env.ACC_TOOL_ROOT, toolDirectories: configuredToolDirectories() }).path ?? (config.executables[item.command] ?? item.command)
      try {
        await scoped.subprocess.resolveExecutable(command)
        entries[item.language] = { command, args: item.args, extensionToLanguage: Object.fromEntries(Object.entries(item.mapping).filter(([, v]) => typeof v === 'string')) as Record<string, string> }
      } catch (error) {
        console.warn(`[auto-code-correct] ${item.id} unavailable; install it and reload ACC: ${errorMessage(error)}`)
      }
    }
    if (Object.keys(entries).length) scoped.plugin(nativeLspStdio, { servers: entries })
  })

  // Reuse the existing multi-language LSP actions plugin. It accepts an arbitrary
  // table of language servers; no fork or three copies of its client are needed.
  // Already-registered action tools remain authoritative and are not duplicated.
  ctx.inject(['fs', 'tools', 'subprocess'], async scoped => {
    const actionNames = ['lsp_diagnostics', 'lsp_format', 'lsp_completion', 'lsp_code_action']
    if (actionNames.some(action => scoped.tools.get(action))) {
      console.info('[auto-code-correct] existing LSP action tools detected; retaining them')
      return
    }
    const entries: Record<string, { command: string; args: string[]; extensionToLanguage: Record<string, string>; projectMarkers: string[] }> = {}
    for (const option of [
      { language: 'python' as const, id: 'ty-lsp', command: 'ty', args: ['server'], mapping: { '.py': 'python' }, markers: ['pyproject.toml'] },
      { language: 'rust' as const, id: 'rust-analyzer', command: 'rust-analyzer', args: [], mapping: { '.rs': 'rust' }, markers: ['Cargo.toml'] },
      { language: 'typescript' as const, id: 'typescript-lsp', command: 'typescript-language-server', args: ['--stdio'], mapping: { '.ts': 'typescript', '.tsx': 'typescriptreact' }, markers: ['tsconfig.json', 'package.json'] },
    ]) {
      if (!config.languages[option.language] || !config.languageServers[option.language] || config.capabilities[option.id] === false) continue
      const command = findTool(option.command, { explicit: config.executables[option.command], prefix: process.env.ACC_TOOL_ROOT, toolDirectories: configuredToolDirectories() }).path ?? (config.executables[option.command] ?? option.command)
      try {
        await scoped.subprocess.resolveExecutable(command)
        entries[option.language] = { command, args: option.args, extensionToLanguage: Object.fromEntries(Object.entries(option.mapping).filter(([, v]) => typeof v === 'string')) as Record<string, string>, projectMarkers: option.markers }
      } catch (error) {
        console.warn(`[auto-code-correct] LSP actions for ${option.language} unavailable: ${errorMessage(error)}`)
      }
    }
    if (Object.keys(entries).length > 0) scoped.plugin(lspActions, { servers: entries, editor: { enabled: false } })
  })

  const hygienePolicy = () => ({
    enabled: config.hygieneEnabled,
    checks: [...DEFAULT_HYGIENE, 'large-files', 'dependency-audit', 'license-audit', 'history-secrets']
      .filter(id => config.capabilities[id] === true || (config.capabilities[id] !== false && DEFAULT_HYGIENE.some(value => value === id))),
  })
  // Install the repository-local Git pre-commit integration on plugin activation
  // when the Harness starts inside a repository, then for each edited repository.
  try { syncGitHygiene(process.cwd(), hygienePolicy()) }
  catch (error) { console.warn('[auto-code-correct] Git hygiene setup: ' + errorMessage(error)) }

  const watchedTools = new Set(config.tools)
  // Extension → checkers, precomputed once so a hot post-execute path does no
  // per-call scanning of the checker list.
  const byExtension = new Map<string, CheckerConfig[]>()
  const fixersByExtension = new Map<string, CheckerConfig[]>()
  for (const fixer of config.fixers) {
    for (const extension of fixer.extensions.map(normalizeExtension)) {
      const bucket = fixersByExtension.get(extension)
      if (bucket) bucket.push(fixer)
      else fixersByExtension.set(extension, [fixer])
    }
  }
  for (const checker of config.checkers) {
    for (const extension of checker.extensions.map(normalizeExtension)) {
      const bucket = byExtension.get(extension)
      if (bucket) bucket.push(checker)
      else byExtension.set(extension, [checker])
    }
  }


  /** Project-scoped tools must execute from the nearest actual project root. */
  function workingDirectory(filePath: string, checker: CheckerConfig): string {
    const extension = extensionOf(filePath)
    const markers = extension === '.rs' ? ['Cargo.toml']
      : extension === '.ts' || extension === '.tsx' ? (checker.name === 'typescript-check' ? ['tsconfig.json'] : ['package.json', 'tsconfig.json'])
      : []
    if (markers.length === 0) return resolve(checker.cwd)
    let dir = dirname(filePath)
    while (true) {
      if (markers.some(marker => existsSync(resolve(dir, marker)))) return dir
      const parent = dirname(dir)
      if (parent === dir || dir === parse(dir).root) break
      dir = parent
    }
    throw new Error(`no project root found for ${filePath} (expected ${markers.join(' or ')})`)
  }

  /**
   * Run one checker over one file and return its findings.
   * @param checker - the checker to run.
   * @param filePath - absolute path of the edited file.
   * @param signal - the tool call's cancellation signal.
   * @returns the finding, or undefined when the checker was clean, cancelled, or unavailable.
   */
  async function runChecker(
    checker: CheckerConfig, filePath: string, signal: AbortSignal,
  ): Promise<Finding | undefined> {
    const subprocess: SubprocessRuntime = ctx.subprocess
    let cwd: string
    try {
      cwd = workingDirectory(filePath, checker)
    } catch (error) {
      return { checker: checker.name, output: errorMessage(error) }
    }
    const argv = substitute(checker.argv, filePath, cwd)
    const requested = argv[0] as string
    const localExecutable = resolve(cwd, 'node_modules', '.bin', requested)
    // Respect a user-specified executable first, then project dependencies, then PATH.
    argv[0] = findTool(requested, { explicit: config.executables[requested], prefix: process.env.ACC_TOOL_ROOT, cwd, toolDirectories: configuredToolDirectories() }).path ?? (config.executables[requested] ?? (existsSync(localExecutable) ? localExecutable : requested))

    let executable: string
    try {
      executable = await subprocess.resolveExecutable(argv[0] as string, undefined, signal)
    } catch (error) {
      // An unresolvable executable is an environment fact, not config the
      // schema could have rejected: report it once as a finding so the person
      // reading the transcript sees why diagnostics stopped, then stay quiet.
      return { checker: checker.name, output: `checker unavailable: ${errorMessage(error)}` }
    }

    const timeout = new AbortController()
    const timer = setTimeout(() => timeout.abort(), checker.timeoutMs)
    const collect = { maxBytes: checker.maxOutputBytes }
    try {
      const handle = subprocess.spawn({
        argv: [executable, ...argv.slice(1)],
        cwd,
        stdio: { stdin: 'ignore', stdout: collect, stderr: collect },
        graceMs: checker.graceMs,
        signal: AbortSignal.any([signal, timeout.signal]),
      })
      const outcome = await handle.done
      if (timeout.signal.aborted) {
        return { checker: checker.name, output: `checker timed out after ${checker.timeoutMs}ms` }
      }
      if (signal.aborted) return undefined
      if (outcome.exitCode !== null && checker.cleanExitCodes.includes(outcome.exitCode)) return undefined
      const output = checker.streams
        .map(stream => handle.collected[stream]?.readFrom(0).text ?? '')
        .join('')
        .trim()
      return { checker: checker.name, output: output || `exited with code ${outcome.exitCode ?? 'unknown'} without diagnostic output` }
    } catch (error) {
      // `done` rejects only for spawn-level failures. The call itself
      // succeeded, so this cannot fail the edit — it becomes a finding.
      return { checker: checker.name, output: `checker failed to start: ${errorMessage(error)}` }
    } finally {
      clearTimeout(timer)
    }
  }

  /**
   * Run every checker claiming the edited file and render one context message.
   * @param filePath - the edited path, as reported by the tool.
   * @param signal - the tool call's cancellation signal.
   * @returns the context to attach, or undefined when nothing was found.
   */
  async function diagnose(filePath: string, signal: AbortSignal): Promise<UserMessage | undefined> {
    const absolute = isAbsolute(filePath) ? filePath : resolve(filePath)
    const ext = extensionOf(absolute)
    const language = languageForExtension(ext)
    if (!language || !config.languages[language]) return undefined
    const fixers = (fixersByExtension.get(ext) ?? []).filter(item => effectiveEnabled(ext, item.name))
    const checkers = (byExtension.get(ext) ?? []).filter(item => effectiveEnabled(ext, item.name))
    if (!fixers.length && !checkers.length) return undefined
    const fixFindings: Finding[] = []
    for (const fixer of fixers) {
      if (signal.aborted) break
      const finding = await runChecker(fixer, absolute, signal)
      if (finding) {
        fixFindings.push(finding)
        // A failing mutation must not be followed by further mutations.
        break
      }
    }
    const findings = [...fixFindings, ...(await Promise.all(checkers.map(checker => runChecker(checker, absolute, signal))))
      .filter((finding): finding is Finding => finding !== undefined)]
    if (findings.length === 0) return undefined

    const body = findings.map(finding => `## ${finding.checker}\n${finding.output}`).join('\n\n')
    const text = `Auto Code Correct results for ${absolute} after your edit:\n\n${boundText(body, config.maxDiagnosticChars)}\n\n`
      + 'Automatic fixes have run where configured. Address remaining findings if caused by your edit. '
      + 'Pre-existing findings unrelated to your change do not need to be fixed.'
    return createUserMessage({
      content: [{ type: 'text', text }],
      source: {
        ...PLUGIN_SOURCE,
        form: 'notice',
        summary: `${findings.length} checker finding(s) on ${absolute.slice(absolute.lastIndexOf('/') + 1)}`,
      },
    })
  }

  ctx.on('tools/post-execute', async (exec, result, next): Promise<PostToolDecision> => {
    const downstream = await next()
    // A blocked call is already an error the model must react to; linting the
    // file it wrote would bury that feedback under unrelated findings.
    if (downstream.kind === 'block') return downstream
    if (!watchedTools.has(exec.name) || result.isError) return downstream
    const filePath = editedPath(exec, result)
    if (filePath === undefined) return downstream

    let hookIssue: UserMessage | undefined
    try {
      syncGitHygiene(isAbsolute(filePath) ? dirname(filePath) : dirname(resolve(filePath)), hygienePolicy())
    } catch (error) {
      hookIssue = createUserMessage({
        content: [{ type: 'text', text: 'ACC Git pre-commit setup failed: ' + errorMessage(error) }],
        source: { ...PLUGIN_SOURCE, form: 'notice', summary: 'ACC Git hygiene setup failure' },
      })
    }
    const diagnostics = await diagnose(filePath, exec.signal)
    if (!diagnostics && !hookIssue) return downstream
    return {
      ...downstream,
      additionalContexts: [...downstream.additionalContexts ?? [], ...hookIssue ? [hookIssue] : [], ...diagnostics ? [diagnostics] : []],
    }
  })
}

/**
 * Best-effort message from an arbitrary thrown value.
 * @param error - the caught value.
 * @returns its message when it has one, otherwise its string form.
 */
function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}
