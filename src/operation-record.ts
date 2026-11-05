export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }
export type JsonObject = { [key: string]: JsonValue }

export const ACC_RESULT_META_KEY = 'autoCodeCorrect'
export const ACC_RESULT_META_VERSION = 1

export type AccOperationKind = 'fixer' | 'checker'
export type AccOperationStatus = 'clean' | 'findings' | 'failed' | 'unavailable' | 'timeout' | 'cancelled'

export interface AccFileChange extends JsonObject {
  path: string
  beforeText: string
  afterText: string
}

export interface AccOperationRecord extends JsonObject {
  id: string
  kind: AccOperationKind
  name: string
  argv: string[]
  cwd: string
  startedAt: number
  endedAt: number
  status: AccOperationStatus
  exitCode: number | null
  signal: string | null
  output: string
  change: AccFileChange | null
}

export interface AccResultMeta extends JsonObject {
  version: typeof ACC_RESULT_META_VERSION
  parentCallId: string
  parentToolName: string
  filePath: string
  operations: AccOperationRecord[]
}

/**
 * ACC-owned durable session record. It records only operations that ACC actually
 * executed; it is not a synthetic tool or PTC event and it never changes the
 * owning edit result.
 */
declare module '@deepseek-ai/dsh-session/types' {
  interface PluginRecordMap {
    'plugin:auto-code-correct/operation': AccResultMeta
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Validate untrusted durable metadata before a future native presentation reads it. */
export function isAccResultMeta(value: unknown): value is AccResultMeta {
  if (!isRecord(value)) return false
  if (
    value.version !== ACC_RESULT_META_VERSION ||
    typeof value.parentCallId !== 'string' ||
    typeof value.parentToolName !== 'string' ||
    typeof value.filePath !== 'string' ||
    !Array.isArray(value.operations)
  ) {
    return false
  }
  return value.operations.every(
    (operation) =>
      isRecord(operation) &&
      typeof operation.id === 'string' &&
      (operation.kind === 'fixer' || operation.kind === 'checker') &&
      typeof operation.name === 'string' &&
      Array.isArray(operation.argv) &&
      operation.argv.every((argument) => typeof argument === 'string') &&
      typeof operation.cwd === 'string' &&
      typeof operation.startedAt === 'number' &&
      typeof operation.endedAt === 'number' &&
      ['clean', 'findings', 'failed', 'unavailable', 'timeout', 'cancelled'].includes(
        String(operation.status),
      ) &&
      (typeof operation.exitCode === 'number' || operation.exitCode === null) &&
      (typeof operation.signal === 'string' || operation.signal === null) &&
      typeof operation.output === 'string' &&
      (operation.change === null ||
        (isRecord(operation.change) &&
          typeof operation.change.path === 'string' &&
          typeof operation.change.beforeText === 'string' &&
          typeof operation.change.afterText === 'string')),
  )
}
