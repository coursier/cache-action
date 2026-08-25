export interface CacheKeyParts {
  id: string
  job: string
  matrixHash: string
  extraSharedKey: string
  extraKey: string
  inputHash: string
  disableCrossJobFallback: boolean
}

export interface CacheKeys {
  key: string
  restoreKeys: string[]
}

export function buildCacheKeys(parts: CacheKeyParts): CacheKeys {
  let key = parts.id
  const restoreKeys: string[] = []

  if (parts.job.length > 0) {
    if (!parts.disableCrossJobFallback) restoreKeys.push(`${key}-`)
    key = `${key}-${parts.job}`
  }

  if (parts.matrixHash.length > 0) {
    restoreKeys.push(`${key}-`)
    key = `${key}-matrix-${parts.matrixHash}`
  }

  if (parts.extraSharedKey.length > 0) {
    restoreKeys.push(`${key}-`)
    key = `${key}-${parts.extraSharedKey}`
  }

  if (parts.extraKey.length > 0) {
    restoreKeys.push(`${key}-`)
    key = `${key}-${parts.extraKey}`
  }

  if (parts.inputHash.length > 0) {
    restoreKeys.push(`${key}-`)
    key = `${key}-${parts.inputHash}`
  }

  restoreKeys.reverse()
  return {key, restoreKeys}
}
