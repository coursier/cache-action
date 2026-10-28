import * as cache from '@actions/cache'
import * as core from '@actions/core'
import * as glob from '@actions/glob'
import {createHash} from 'crypto'
import {stat} from 'fs'
import {readFile, stat as statFile} from 'fs/promises'
import * as path from 'path'
import {cacheModeAllowsWrite, setupCacheMode} from './cacheMode.js'

// This should catch some ETIMEDOUT errors seen in the restore cache step.
// Same as https://github.com/actions/cache/blob/0638051e9af2c23d10bb70fa9beffcad6cff9ce3/src/save.ts#L10
process.on('uncaughtException', e => core.info(`[warning] ${e.message}`))

// The cache itself (v1), not the directory containing it, that also holds the archive
// cache (arc, whose extracted archives can be extracted again from the archives in v1), and
// the privileged archive cache (priv, which has files only root can read, and which tar fails
// to save then)
function getCachePath(): string {
  if (process.platform === 'win32')
    return '~\\AppData\\Local\\Coursier\\Cache\\v1'
  if (process.platform === 'darwin') return '~/Library/Caches/Coursier/v1'
  return '~/.cache/coursier/v1'
}

function withLfLineEndings(content: Buffer): Buffer {
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
async function hashContent(
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
      if ((await statFile(file)).isDirectory()) continue
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

async function doGlob(globs: string[]): Promise<string[]> {
  const globber = await glob.create(globs.join('\n'))
  return globber.glob()
}

async function restoreCache(
  id: string,
  paths: string[],
  inputFiles: string[],
  job: string,
  extraSharedKey: string,
  extraKey: string,
  matrixHashedContent: string,
  extraHashedContent: string,
  disableFallback: boolean
): Promise<void> {
  const upperId = id.toLocaleUpperCase('en-US')
  const cacheHitId = `cache-hit-${id}`

  let key = id
  const restoreKeys: string[] = []

  if (job.length > 0) {
    restoreKeys.push(`${key}-`)
    key = `${key}-${job}`
  }

  if (matrixHashedContent.length > 0) {
    restoreKeys.push(`${key}-`)
    const matrixHash = await hashContent([], matrixHashedContent)
    key = `${key}-matrix-${matrixHash}`
  }

  if (extraSharedKey.length > 0) {
    restoreKeys.push(`${key}-`)
    key = `${key}-${extraSharedKey}`
  }

  if (extraKey.length > 0) {
    restoreKeys.push(`${key}-`)
    key = `${key}-${extraKey}`
  }

  if (inputFiles.length > 0 || extraHashedContent.length > 0) {
    restoreKeys.push(`${key}-`)
    const hash = await hashContent(inputFiles, extraHashedContent)
    key = `${key}-${hash}`
  }

  restoreKeys.reverse()

  core.info(`${id} cache keys${disableFallback ? ' (fallback disabled)' : ''}:`)
  core.info(`  ${key}`)
  for (const restoreKey of restoreKeys) {
    core.info(`  ${restoreKey}`)
  }

  core.saveState(`${upperId}_CACHE_PATHS`, JSON.stringify(paths))
  core.saveState(`${upperId}_CACHE_KEY`, key)

  let restoreKey: string | undefined = undefined

  try {
    restoreKey = await cache.restoreCache(
      paths,
      key,
      disableFallback ? [] : restoreKeys
    )
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    core.info(`[warning] ${msg}`)
  }

  const saveMessage = cacheModeAllowsWrite()
    ? `${id} cache will be saved in post run job.`
    : `${id} cache will not be saved in post run job (cache-mode doesn't permit writes).`

  if (!restoreKey) {
    core.setOutput(cacheHitId, 'false')
    core.info(`${id} cache not found.`)
    core.info(saveMessage)
    return
  }

  if (restoreKey === key) {
    core.setOutput(cacheHitId, 'true')
    core.info(`${id} cache hit.`)
    core.info(`${id} cache will not be saved in post run job.`)
  } else {
    core.setOutput(cacheHitId, 'false')
    core.info(`${id} cache miss, fell back on ${restoreKey}.`)
    core.info(saveMessage)
  }
  core.info('  ')
  core.saveState(`${upperId}_CACHE_RESULT`, restoreKey)
}

async function restoreCoursierCache(
  inputFiles: string[],
  job: string,
  extraSharedKey: string,
  extraKey: string,
  matrixHashedContent: string,
  extraHashedContent: string,
  disableFallback: boolean
): Promise<void> {
  let paths: string[] = []

  const userSpecifiedCachePath = core.getInput('path')
  if (userSpecifiedCachePath) {
    paths = [userSpecifiedCachePath]
    core.exportVariable('COURSIER_CACHE', userSpecifiedCachePath)
  } else if (process.env['COURSIER_CACHE']) {
    paths = [process.env['COURSIER_CACHE']]
  } else {
    paths = [getCachePath()]
  }

  await restoreCache(
    'coursier',
    paths,
    inputFiles,
    job,
    extraSharedKey,
    extraKey,
    matrixHashedContent,
    extraHashedContent,
    disableFallback
  )
}

async function restoreSbtCache(
  inputFiles: string[],
  job: string,
  extraSharedKey: string,
  extraKey: string,
  matrixHashedContent: string,
  extraHashedContent: string,
  disableFallback: boolean
): Promise<void> {
  await restoreCache(
    'sbt-ivy2-cache',
    ['~/.sbt', '~/.ivy2/cache'],
    inputFiles,
    job,
    extraSharedKey,
    extraKey,
    matrixHashedContent,
    extraHashedContent,
    disableFallback
  )
}

async function restoreMillCache(
  inputFiles: string[],
  job: string,
  extraSharedKey: string,
  extraKey: string,
  matrixHashedContent: string,
  extraHashedContent: string,
  disableFallback: boolean
): Promise<void> {
  await restoreCache(
    'mill',
    ['~/.cache/mill'],
    inputFiles,
    job,
    extraSharedKey,
    extraKey,
    matrixHashedContent,
    extraHashedContent,
    disableFallback
  )
}

async function restoreAmmoniteCache(
  inputFiles: string[],
  job: string,
  extraSharedKey: string,
  extraKey: string,
  matrixHashedContent: string,
  extraHashedContent: string,
  disableFallback: boolean
): Promise<void> {
  await restoreCache(
    'ammonite',
    ['~/.ammonite'],
    inputFiles,
    job,
    extraSharedKey,
    extraKey,
    matrixHashedContent,
    extraHashedContent,
    disableFallback
  )
}

function readExtraFiles(variableName: string): string[] {
  const extraFilesStr = core.getInput(variableName)
  let extraFiles: string[] = []
  if (extraFilesStr) {
    if (extraFilesStr.startsWith('[')) {
      extraFiles = JSON.parse(extraFilesStr) as string[]
    } else {
      extraFiles = [extraFilesStr]
    }
  }
  return extraFiles
}

function readExtraKeys(variableName: string): string {
  return core.getInput(variableName)
}

function readExtraBoolean(variableName: string): boolean {
  return core.getBooleanInput(variableName, {required: false})
}

async function run(): Promise<void> {
  const cacheMode = setupCacheMode()
  if (cacheMode.length > 0) {
    core.info(`Effective cache-mode: ${cacheMode}`)
  }

  let root = core.getInput('root')
  if (!root.endsWith('/')) {
    root = `${root}/`
  }

  let extraFiles = readExtraFiles('extraFiles')

  if (core.getInput('read-cs-cache-files') !== 'false') {
    const isFilePromise = new Promise<boolean>((resolve, reject) => {
      stat('.github/cs-cache-files', (err, stats) => {
        if (err && err.code === 'ENOENT') resolve(false)
        else if (err) reject(err)
        else resolve(stats.isFile())
      })
    })
    const isFile = await isFilePromise
    if (isFile) {
      const content = (await readFile('.github/cs-cache-files')).toString()
      extraFiles = extraFiles.concat(content.split(/\r?\n/))
    }
  }

  const extraSbtFiles = readExtraFiles('extraSbtFiles')
  const extraMillFiles = readExtraFiles('extraMillFiles')
  const extraAmmoniteFiles = readExtraFiles('ammoniteScripts')

  const extraHashedContent = readExtraKeys('extraHashedContent')
  const extraCoursierHashedContent = readExtraKeys('extraCoursierHashedContent')
  const extraSbtHashedContent = readExtraKeys('extraSbtHashedContent')
  const extraMillHashedContent = readExtraKeys('extraMillHashedContent')
  const extraAmmoniteHashedContent = readExtraKeys('extraAmmoniteHashedContent')

  const cacheVersion = process.env['COURSIER_CACHE_ACTION_CACHE_VERSION'] ?? ''
  if (cacheVersion.length > 0) {
    core.info(
      `Cache invalidation: COURSIER_CACHE_ACTION_CACHE_VERSION is set to '${cacheVersion}', appending to all cache keys.`
    )
  }

  const effectiveExtraHashedContent =
    cacheVersion.length > 0
      ? `${extraHashedContent}\n${cacheVersion}`
      : extraHashedContent

  const extraKey = readExtraKeys('extraKey')
  const extraCoursierKey = readExtraKeys('extraCoursierKey')
  const extraSbtKey = readExtraKeys('extraSbtKey')
  const extraMillKey = readExtraKeys('extraMillKey')
  const extraAmmoniteKey = readExtraKeys('extraAmmoniteKey')

  const ignoreJobAsPartCacheKey = readExtraBoolean('ignoreJob')
  const ignoreMatrixAsPartCacheKey = readExtraBoolean('ignoreMatrix')
  const ignoreAmmonite = readExtraBoolean('ignoreAmmonite')
  const disableFallback = readExtraBoolean('disableFallback')

  const job = ignoreJobAsPartCacheKey ? '' : readExtraKeys('job')
  let matrix = readExtraKeys('matrix')
  if (
    matrix === 'null' ||
    matrix === 'undefined' ||
    matrix === '{}' ||
    ignoreMatrixAsPartCacheKey
  ) {
    matrix = ''
  }

  const sbtGlobs = [
    `${root}*.sbt`,
    `${root}project/**.sbt`,
    `${root}project/build.properties`,
    `${root}project/**.scala`
  ].concat(extraSbtFiles)

  // Files whose presence uniquely identifies a Mill project
  // (unlike *.sc files, which can be plain Ammonite scripts)
  const millSpecificGlobs = [
    `${root}build.mill`,
    `${root}build.mill.yaml`,
    `${root}build.mill.scala`,
    `${root}mill-build/build.mill`,
    `${root}mill-build/build.mill.yaml`,
    `${root}.mill-*`,
    `${root}.config/mill-*`,
    `${root}mill`,
    `${root}mill.bat`,
    `${root}millw`
  ].concat(extraMillFiles)
  const millLegacyGlobs = [`${root}*.sc`, `${root}*.mill.scala`]
  const millGlobs = [
    `${root}*.mill`,
    `${root}*.mill.yaml`,
    `${root}**/package.mill`,
    `${root}**/package.mill.yaml`,
    `${root}**/package.mill.scala`
  ]
    .concat(millLegacyGlobs)
    .concat(millSpecificGlobs)

  const ammoniteGlobs = [`${root}*.sc`, `${root}*/*.sc`].concat(
    extraAmmoniteFiles
  )

  const [hasSbtFiles, hasMillFiles, hasAmmoniteFiles] = await Promise.all([
    doGlob(sbtGlobs).then(files => files.length > 0),
    doGlob(millSpecificGlobs).then(files => files.length > 0),
    doGlob(ammoniteGlobs).then(files => files.length > 0)
  ])

  const coursierInputFiles = sbtGlobs
    .concat(millGlobs)
    .concat(ignoreAmmonite ? [] : ammoniteGlobs)
    .concat(extraFiles)

  const coursierHashedContent: Record<string, string> = {
    sbt: extraSbtHashedContent,
    mill: extraMillHashedContent,
    other: effectiveExtraHashedContent,
    coursier: extraCoursierHashedContent
  }
  if (!ignoreAmmonite) {
    coursierHashedContent.amm = extraAmmoniteHashedContent
  }

  await restoreCoursierCache(
    coursierInputFiles,
    job,
    extraKey,
    extraCoursierKey,
    matrix,
    JSON.stringify(coursierHashedContent),
    disableFallback
  )

  if (hasSbtFiles) {
    await restoreSbtCache(
      sbtGlobs.concat(extraFiles),
      job,
      extraKey,
      extraSbtKey,
      matrix,
      JSON.stringify({
        sbt: extraSbtHashedContent,
        other: effectiveExtraHashedContent
      }),
      disableFallback
    )
  }

  if (hasMillFiles) {
    await restoreMillCache(
      millGlobs.concat(extraFiles),
      job,
      extraKey,
      extraMillKey,
      matrix,
      JSON.stringify({
        mill: extraMillHashedContent,
        other: effectiveExtraHashedContent
      }),
      disableFallback
    )
  }

  if (ignoreAmmonite && hasAmmoniteFiles) {
    core.info(
      'Ammonite scripts found but ignoreAmmonite is set — skipping Ammonite cache.'
    )
  } else if (ignoreAmmonite && !hasAmmoniteFiles) {
    core.info(
      'ignoreAmmonite is set but no Ammonite scripts were found — nothing to skip.'
    )
  } else if (hasAmmoniteFiles) {
    await restoreAmmoniteCache(
      ammoniteGlobs.concat(extraFiles),
      job,
      extraKey,
      extraAmmoniteKey,
      matrix,
      JSON.stringify({
        amm: extraAmmoniteHashedContent,
        other: effectiveExtraHashedContent
      }),
      disableFallback
    )
  }
}

async function doRun(): Promise<void> {
  try {
    await run()
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    core.setFailed(msg)
  }
}

doRun()
