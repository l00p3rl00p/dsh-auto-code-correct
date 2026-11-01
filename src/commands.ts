/**
 * Native DSH human command for ACC tool operations.
 * The built-in Commands remote supplies an authenticated, session-scoped UI
 * action without opening an unauthenticated installer HTTP endpoint.
 */
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-commands'
import { CAPABILITIES } from './capabilities.js'

const cliPath = fileURLToPath(new URL('./cli.js', import.meta.url))
const actions = new Set(['status', 'install', 'uninstall'])

export function registerAccCommands(ctx: Context): void {
  ctx.inject(['commands', 'subprocess'], commandCtx => {
    commandCtx.commands.register({
      name: 'acc',
      description: 'Inspect, install, or remove an Auto Code Correct dependency',
      input: { hint: 'status|install|uninstall <capability-id> [installation-directory]' },
      handler: async ({ rawInput }) => {
        const input = rawInput.trim()
        const [action = '', id = '', ...directoryParts] = input.split(/\s+/)
        if (!actions.has(action) || !CAPABILITIES.some(cap => cap.id === id)) {
          return { kind: 'error', text: 'Usage: /acc status|install|uninstall <capability-id> [installation-directory]' }
        }
        const directory = directoryParts.join(' ')
        if (directory.includes('\0')) return { kind: 'error', text: 'Invalid installation directory' }
        const argv = [process.execPath, cliPath, action, id, ...directory ? ['--prefix', directory] : []]
        const maxBytes = 16_384
        try {
          const child = commandCtx.subprocess.spawn({
            argv,
            cwd: dirname(cliPath),
            stdio: { stdin: 'ignore', stdout: { maxBytes }, stderr: { maxBytes } },
            graceMs: 2_000,
          })
          const result = await child.done
          const stdout = child.collected.stdout?.readFrom(0).text?.trim() ?? ''
          const stderr = child.collected.stderr?.readFrom(0).text?.trim() ?? ''
          const message = [stdout, stderr].filter(Boolean).join('\n') || `ACC ${action} ${id}: no output`
          if (result.exitCode !== 0) return { kind: 'error', text: message }
          return { kind: 'success', text: message }
        } catch (error) {
          return { kind: 'error', text: error instanceof Error ? error.message : String(error) }
        }
      },
    })
  })
}
