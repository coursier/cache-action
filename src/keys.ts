import * as glob from '@actions/glob'
import {createHash} from 'crypto'
import {readFile, stat} from 'fs/promises'
import * as path from 'path'

export function withLfLineEndings(content: Buffer): Buffer {
  if (!content.includes('\r\n')) return content
  // latin1 maps each byte to a single char and back, so that only the CRLFs change
  return Buffer.from(
    content.toString('latin1').replaceAll('\r\n', '\n'),
    'latin1'
  )
}

// Same as glob.hashFiles, except that CRLF line endings are hashed as LF ones, so that
// checking files out with or without converting line endings (core.autocrlf on Windows)
// gives the same keys. Files with LF line endings get the same hash as with glob.hashFiles.
// hashedContent, if non-empty, is hashed as if it were the content of an extra file, coming
// after the matched ones.
export async function hashContent(
  files: string[],
  hashedContent: string
): Promise<string> {
  const workspace = process.env['GITHUB_WORKSPACE'] ?? process.cwd()
  const result = createHash('sha256')
  let hasMatch = false
  const patterns = files.filter(Boolean)
  if (patterns.length > 0) {
    const globber = await glob.create(patterns.join('\n'))
    for await (const file of globber.globGenerator()) {
      if (!file.startsWith(`${workspace}${path.sep}`)) continue
      if ((await stat(file)).isDirectory()) continue
      const content = withLfLineEndings(await readFile(file))
      result.update(createHash('sha256').update(content).digest())
      hasMatch = true
    }
  }
  if (hashedContent.length > 0) {
    const content = withLfLineEndings(Buffer.from(hashedContent))
    result.update(createHash('sha256').update(content).digest())
    hasMatch = true
  }
  return hasMatch ? result.digest('hex') : ''
}

export interface KeyParts {
  job: string
  matrixHashedContent: string
  extraSharedKey: string
  extraKey: string
  inputFiles: string[]
  extraHashedContent: string
}

// Computes the key of a cache, and its restore keys, from the most specific to the least
// specific one. Each part of the key that is set adds a restore key, made of the parts
// before it.
export async function cacheKeys(
  prefix: string,
  parts: KeyParts
): Promise<{key: string; restoreKeys: string[]}> {
  let key = prefix
  const restoreKeys: string[] = []

  if (parts.job.length > 0) {
    restoreKeys.push(`${key}-`)
    key = `${key}-${parts.job}`
  }

  if (parts.matrixHashedContent.length > 0) {
    restoreKeys.push(`${key}-`)
    const matrixHash = await hashContent([], parts.matrixHashedContent)
    key = `${key}-matrix-${matrixHash}`
  }

  if (parts.extraSharedKey.length > 0) {
    restoreKeys.push(`${key}-`)
    key = `${key}-${parts.extraSharedKey}`
  }

  if (parts.extraKey.length > 0) {
    restoreKeys.push(`${key}-`)
    key = `${key}-${parts.extraKey}`
  }

  if (parts.inputFiles.length > 0 || parts.extraHashedContent.length > 0) {
    restoreKeys.push(`${key}-`)
    const hash = await hashContent(parts.inputFiles, parts.extraHashedContent)
    key = `${key}-${hash}`
  }

  restoreKeys.reverse()

  return {key, restoreKeys}
}
