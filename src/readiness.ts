import { existsSync } from 'node:fs'
import { dirname, isAbsolute, parse, resolve } from 'node:path'
import { CAPABILITIES, type Capability, type Language } from './capabilities.js'
import { configuredToolDirectories, executableVersion, findTool } from './discovery.js'

export type ReadinessState = 'disabled' | 'installed' | 'configured' | 'ready' | 'unavailable' | 'failed'

export interface AccReadinessTool {
  id: string
  label: string
  language: Language | 'hygiene'
  state: ReadinessState
  executable: string
  path?: string
  version?: string
  detail: string
}

export interface AccReadinessSnapshot {
  checkedAt: number
  projectPath: string
  project: Record<'packageJson' | 'tsconfig' | 'eslintConfig' | 'cargoToml' | 'pyproject', boolean>
  tools: AccReadinessTool[]
}

type AccConfigView = {
  languages: Readonly<Record<Language, boolean>>
  capabilities: Readonly<Record<string, boolean>>
  languageServers: Readonly<Record<Language, boolean>>
  executables: Readonly<Record<string, string>>
}

function nearestProject(filePath: string): string {
  let dir = dirname(filePath)
  while (true) {
    if (
      ['package.json', 'tsconfig.json', 'Cargo.toml', 'pyproject.toml'].some((name) =>
        existsSync(resolve(dir, name)),
      )
    ) {
      return dir
    }
    const parent = dirname(dir)
    if (parent === dir || dir === parse(dir).root) return dirname(filePath)
    dir = parent
  }
}

function projectFacts(projectPath: string): AccReadinessSnapshot['project'] {
  return {
    packageJson: existsSync(resolve(projectPath, 'package.json')),
    tsconfig: existsSync(resolve(projectPath, 'tsconfig.json')),
    eslintConfig: [
      'eslint.config.js',
      'eslint.config.mjs',
      'eslint.config.cjs',
      'eslint.config.ts',
      'eslint.config.mts',
      'eslint.config.cts',
    ].some((name) => existsSync(resolve(projectPath, name))),
    cargoToml: existsSync(resolve(projectPath, 'Cargo.toml')),
    pyproject: existsSync(resolve(projectPath, 'pyproject.toml')),
  }
}

function enabled(capability: Capability, config: AccConfigView): boolean {
  if (capability.group === 'hygiene') return config.capabilities[capability.id] === true
  if (capability.language === undefined || !config.languages[capability.language]) return false
  if (capability.group === 'languageServer' && !config.languageServers[capability.language]) return false
  return config.capabilities[capability.id] !== false
}

function configurationDetail(
  capability: Capability,
  project: AccReadinessSnapshot['project'],
): string | undefined {
  if (capability.language === 'typescript' && capability.id.startsWith('eslint') && !project.eslintConfig) {
    return 'ESLint flat config is missing'
  }
  if (capability.id === 'typescript-check' && !project.tsconfig) return 'tsconfig.json is missing'
  if (capability.language === 'rust' && !project.cargoToml) return 'Cargo.toml is missing'
  if (capability.language === 'python' && capability.id === 'ty' && !project.pyproject)
    return 'pyproject.toml is missing'
  return undefined
}

/** Read-only executable and manifest preflight; it never launches or installs tools. */
export function inspectReadiness(config: AccConfigView, requestedPath = process.cwd()): AccReadinessSnapshot {
  const start = isAbsolute(requestedPath) ? requestedPath : resolve(requestedPath)
  const projectPath = nearestProject(start)
  const project = projectFacts(projectPath)
  const tools: AccReadinessTool[] = CAPABILITIES.map((capability) => {
    const language: Language | 'hygiene' = capability.language ?? 'hygiene'
    if (!enabled(capability, config)) {
      return {
        id: capability.id,
        label: capability.label,
        language,
        state: 'disabled',
        executable: capability.executable,
        detail: 'Disabled by ACC settings',
      }
    }
    const found = findTool(capability.executable, {
      explicit: config.executables[capability.executable],
      cwd: projectPath,
      prefix: process.env.ACC_TOOL_ROOT,
      toolDirectories: configuredToolDirectories(),
    })
    if (found.status !== 'installed' || found.path === undefined) {
      return {
        id: capability.id,
        label: capability.label,
        language,
        state: 'unavailable',
        executable: capability.executable,
        detail:
          found.status === 'invalid-override'
            ? 'Configured executable path is invalid'
            : 'Executable was not found',
      }
    }
    const configuration = configurationDetail(capability, project)
    if (configuration) {
      return {
        id: capability.id,
        label: capability.label,
        language,
        state: 'installed',
        executable: capability.executable,
        path: found.path,
        version: executableVersion(found.path),
        detail: configuration,
      }
    }
    return {
      id: capability.id,
      label: capability.label,
      language,
      state: 'ready',
      executable: capability.executable,
      path: found.path,
      version: executableVersion(found.path),
      detail: 'Executable and required project configuration are available',
    }
  })
  return { checkedAt: Date.now(), projectPath, project, tools }
}
