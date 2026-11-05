/**
 * Portable, read-only executable discovery.
 * Explicit executable -> chosen tools directory -> project bin -> PATH.
 * No directory crawling, downloads, or installation side effects.
 */
import { accessSync, constants, existsSync, statSync } from 'node:fs'
import { delimiter, dirname, isAbsolute, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

export interface FindOptions {
  explicit?: string
  prefix?: string
  cwd?: string
  path?: string
  toolDirectories?: readonly string[]
  platform?: NodeJS.Platform
}
export interface FoundTool {
  path?: string
  status: 'installed' | 'missing' | 'invalid-override'
  source?: 'explicit' | 'prefix' | 'project' | 'PATH' | 'search-dir'
}
const windowsSuffixes = ['.exe', '.cmd', '.bat', '']
function candidateFiles(directory: string, executable: string, windows: boolean): string[] {
  return (windows ? windowsSuffixes : ['']).map((suffix) => join(directory, executable + suffix))
}
function usable(file: string, platform: NodeJS.Platform): boolean {
  try {
    if (!statSync(file).isFile()) return false
    accessSync(file, platform === 'win32' ? constants.F_OK : constants.X_OK)
    return true
  } catch {
    return false
  }
}
/** Paths are checked, never executed. Explicit broken paths must not silently fall back. */
export function findTool(executable: string, options: FindOptions = {}): FoundTool {
  const platform = options.platform ?? process.platform
  const windows = platform === 'win32'
  if (!/^[a-zA-Z0-9_.+-]+$/.test(executable)) throw new Error('Invalid executable name')
  const explicit = options.explicit
  if (explicit) {
    const path = resolve(explicit)
    return usable(path, platform)
      ? { path, status: 'installed', source: 'explicit' }
      : { status: 'invalid-override' }
  }
  const dirs: { dir: string; source: NonNullable<FoundTool['source']> }[] = []
  if (options.prefix) {
    const root = resolve(options.prefix)
    dirs.push(
      { dir: join(root, 'bin'), source: 'prefix' },
      { dir: join(root, 'node_modules', '.bin'), source: 'prefix' },
      { dir: join(root, 'rust', 'cargo', 'bin'), source: 'prefix' },
    )
  }
  if (options.cwd) {
    let directory = resolve(options.cwd)
    // Bounded ancestor search finds Node tools local to a project without scanning disk.
    while (true) {
      dirs.push({ dir: join(directory, 'node_modules', '.bin'), source: 'project' })
      const parent = dirname(directory)
      if (parent === directory) break
      directory = parent
    }
  }
  for (const directory of options.toolDirectories ?? []) {
    dirs.push(
      { dir: resolve(directory), source: 'search-dir' },
      { dir: resolve(directory, 'bin'), source: 'search-dir' },
      { dir: resolve(directory, 'node_modules', '.bin'), source: 'search-dir' },
      { dir: resolve(directory, 'rust', 'cargo', 'bin'), source: 'search-dir' },
    )
  }
  for (const directory of (options.path ?? process.env.PATH ?? '').split(delimiter).filter(Boolean))
    dirs.push({ dir: directory, source: 'PATH' })
  for (const item of dirs) {
    for (const path of candidateFiles(item.dir, executable, windows)) {
      if (usable(path, platform)) return { path: resolve(path), status: 'installed', source: item.source }
    }
  }
  return { status: 'missing' }
}
export function configuredToolDirectories(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env.ACC_TOOL_PATHS ?? '')
    .split(delimiter)
    .map((s) => s.trim())
    .filter(Boolean)
}
/** Verify the resolved executable works, but do not require all binaries to support --version. */
export function executableVersion(path: string): string | undefined {
  const result = spawnSync(path, ['--version'], { encoding: 'utf8', timeout: 3000 })
  return result.status === 0 ? (result.stdout || result.stderr).trim().split(/\r?\n/)[0] : undefined
}
