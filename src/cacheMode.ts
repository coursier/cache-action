import * as core from '@actions/core'

// See https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching
// The runner exposes the effective workflow / job cache-mode via ACTIONS_CACHE_MODE,
// and @actions/cache skips the operations that mode doesn't allow.
const knownCacheModes = ['none', 'read', 'write', 'write-only']

function normalize(mode: string | undefined): string {
  return (mode ?? '').trim().toLowerCase()
}

function isReadable(mode: string): boolean {
  return !knownCacheModes.includes(mode) || mode === 'read' || mode === 'write'
}

function isWritable(mode: string): boolean {
  return (
    !knownCacheModes.includes(mode) || mode === 'write' || mode === 'write-only'
  )
}

function fromAccess(readable: boolean, writable: boolean): string {
  if (readable && writable) return 'write'
  if (readable) return 'read'
  if (writable) return 'write-only'
  return 'none'
}

// Combines the cacheMode input with the cache-mode of the workflow / job, and
// exports the result as ACTIONS_CACHE_MODE, so that @actions/cache honors it.
// The cacheMode input can only narrow the access granted by the workflow / job.
// Returns the effective mode ('' if neither is set).
export function setupCacheMode(): string {
  const inputMode = normalize(core.getInput('cacheMode'))
  if (inputMode && !knownCacheModes.includes(inputMode)) {
    throw new Error(
      `Invalid cacheMode input '${inputMode}', expected one of ${knownCacheModes.join(', ')}`
    )
  }

  const workflowMode = normalize(process.env['ACTIONS_CACHE_MODE'])
  if (!inputMode) return workflowMode

  const mode = fromAccess(
    isReadable(inputMode) && isReadable(workflowMode),
    isWritable(inputMode) && isWritable(workflowMode)
  )
  process.env['ACTIONS_CACHE_MODE'] = mode
  return mode
}

export function cacheModeAllowsRead(): boolean {
  return isReadable(normalize(process.env['ACTIONS_CACHE_MODE']))
}

export function cacheModeAllowsWrite(): boolean {
  return isWritable(normalize(process.env['ACTIONS_CACHE_MODE']))
}
