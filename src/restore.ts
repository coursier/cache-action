import * as cache from '@actions/cache'
import * as core from '@actions/core'
import * as exec from '@actions/exec'
import {readFile, stat, unlink, writeFile} from 'fs'
import globAll from 'glob-all'
import hashFiles from 'hash-files'

let _unameValue = ''

// This should catch some ETIMEDOUT errors seen in the restore cache step.
// Same as https://github.com/actions/cache/blob/0638051e9af2c23d10bb70fa9beffcad6cff9ce3/src/save.ts#L10
process.on('uncaughtException', e => core.info(`[warning] ${e.message}`))

async function uname(): Promise<string> {
  if (!_unameValue) {
    // from https://github.com/c-hive/gha-npm-cache/blob/1d899ca6403e4536a2855679ab78f5b89a870863/src/restore.js#L6-L17
    let output = ''
    const options = {
      silent: true,
      listeners: {
        stdout: (data: unknown) => {
          output += String(data)
        }
      }
    }
    await exec.exec('uname', ['-s'], options)

    _unameValue = output.trim()
  }

  return _unameValue
}

function getOs(unameShort: string): string {
  if (unameShort.startsWith('Darwin')) return 'darwin'
  if (unameShort.startsWith('Linux')) return 'linux'
  if (
    unameShort.startsWith('CYGWIN') ||
    unameShort.startsWith('MINGW') ||
    unameShort.startsWith('MSYS')
  )
    return 'win'
  return 'unknown'
}

function getCachePath(os: string): string {
  if (os === 'win') return '~\\AppData\\Local\\Coursier\\Cache'
  if (os === 'darwin') return '~/Library/Caches/Coursier'
  return '~/.cache/coursier'
}

async function doHashFiles(files0: string[]): Promise<string> {
  const files = files0.filter(Boolean)
  const hashOptions = {
    files,
    algorithm: 'sha1'
  }
  return new Promise<string>((resolve, reject) => {
    hashFiles(hashOptions, (err: Error | null, hash: string) => {
      if (hash) resolve(hash)
      else reject(err)
    })
  })
}

async function doGlob(globs: string[]): Promise<string[]> {
  return new Promise<string[]>((resolve, reject) => {
    globAll(globs, (err: Error | null, files: string[]) => {
      if (files) resolve(files)
      else reject(err)
    })
  })
}

async function hashContent(
  inputFiles: string[],
  hashedContent: string
): Promise<string> {
  let hash = ''
  let allInputFiles = inputFiles

  const tmpFilePath = '.tmp-cs-cache-key'

  if (hashedContent.length !== 0) {
    const writeTmpFile = new Promise<void>((resolve, reject) => {
      writeFile(tmpFilePath, hashedContent, (err: Error | null) => {
        if (err) reject(err)
        else resolve()
      })
    })
    await writeTmpFile

    allInputFiles = inputFiles.concat([tmpFilePath])
  }

  hash = await doHashFiles(allInputFiles)

  if (hashedContent.length !== 0) {
    const removeTmpFile = new Promise<void>((resolve, reject) => {
      unlink(tmpFilePath, (err: Error | null) => {
        if (err) reject(err)
        else resolve()
      })
    })
    await removeTmpFile
  }

  return hash
}

async function restoreCache(
  id: string,
  paths: string[],
  inputFiles: string[],
  job: String,
  extraSharedKey: string,
  extraKey: string,
  matrixHashedContent: string,
  extraHashedContent: string
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

  core.info(`${id} cache keys:`)
  core.info(`  ${key}`)
  for (const restoreKey of restoreKeys) {
    core.info(`  ${restoreKey}`)
  }

  core.saveState(`${upperId}_CACHE_PATHS`, JSON.stringify(paths))
  core.saveState(`${upperId}_CACHE_KEY`, key)

  let restoreKey: string | undefined = undefined

  try {
    restoreKey = await cache.restoreCache(paths, key, restoreKeys)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    core.info(`[warning] ${msg}`)
  }

  if (!restoreKey) {
    core.setOutput(cacheHitId, 'false')
    core.info(`${id} cache not found.`)
    core.info(`${id} cache will be saved in post run job.`)
    return
  }

  if (restoreKey === key) {
    core.setOutput(cacheHitId, 'true')
    core.info(`${id} cache hit.`)
    core.info(`${id} cache will not be saved in post run job.`)
  } else {
    core.setOutput(cacheHitId, 'false')
    core.info(`${id} cache miss, fell back on ${restoreKey}.`)
    core.info(`${id} cache will be saved in post run job.`)
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
  extraHashedContent: string
): Promise<void> {
  let paths: string[] = []

  const userSpecifiedCachePath = core.getInput('path')
  if (userSpecifiedCachePath) {
    paths = [userSpecifiedCachePath]
    core.exportVariable('COURSIER_CACHE', userSpecifiedCachePath)
  } else {
    paths = [getCachePath(getOs(await uname()))]
  }

  await restoreCache(
    'coursier',
    paths,
    inputFiles,
    job,
    extraSharedKey,
    extraKey,
    matrixHashedContent,
    extraHashedContent
  )
}

async function restoreSbtCache(
  inputFiles: string[],
  job: string,
  extraSharedKey: string,
  extraKey: string,
  matrixHashedContent: string,
  extraHashedContent: string
): Promise<void> {
  await restoreCache(
    'sbt-ivy2-cache',
    ['~/.sbt', '~/.ivy2/cache'],
    inputFiles,
    job,
    extraSharedKey,
    extraKey,
    matrixHashedContent,
    extraHashedContent
  )
}

async function restoreMillCache(
  inputFiles: string[],
  job: string,
  extraSharedKey: string,
  extraKey: string,
  matrixHashedContent: string,
  extraHashedContent: string
): Promise<void> {
  await restoreCache(
    'mill',
    ['~/.cache/mill'],
    inputFiles,
    job,
    extraSharedKey,
    extraKey,
    matrixHashedContent,
    extraHashedContent
  )
}

async function restoreAmmoniteCache(
  inputFiles: string[],
  job: string,
  extraSharedKey: string,
  extraKey: string,
  matrixHashedContent: string,
  extraHashedContent: string
): Promise<void> {
  await restoreCache(
    'ammonite',
    ['~/.ammonite'],
    inputFiles,
    job,
    extraSharedKey,
    extraKey,
    matrixHashedContent,
    extraHashedContent
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
  let extraFilesStr = core.getInput(variableName)
  if (!extraFilesStr) extraFilesStr = ''
  return extraFilesStr
}

function readExtraBoolean(variableName: string): boolean {
  return core.getBooleanInput(variableName, {required: false})
}

async function run(): Promise<void> {
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
      const readPromise = new Promise<string>((resolve, reject) => {
        readFile('.github/cs-cache-files', (err, content) => {
          if (err) reject(err)
          else resolve(content.toString())
        })
      })
      const content = await readPromise
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

  const extraKey = readExtraKeys('extraKey')
  const extraCoursierKey = readExtraKeys('extraCoursierKey')
  const extraSbtKey = readExtraKeys('extraSbtKey')
  const extraMillKey = readExtraKeys('extraMillKey')
  const extraAmmoniteKey = readExtraKeys('extraAmmoniteKey')

  const ignoreJobAsPartCacheKey = readExtraBoolean('ignoreJob')
  const ignoreMatrixAsPartCacheKey = readExtraBoolean('ignoreMatrix')

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

  const millSpecificGlobs = [`${root}.mill-version`, `${root}mill`].concat(
    extraMillFiles
  )
  const millGlobs = [`${root}*.sc`]
    .concat(millSpecificGlobs)
    .concat(extraMillFiles)

  const ammoniteGlobs = [`${root}*.sc`, `${root}*/*.sc`].concat(
    extraAmmoniteFiles
  )

  const hasSbtFiles = (await doGlob(sbtGlobs)).length > 0
  const hasMillFiles = (await doGlob(millSpecificGlobs)).length > 0
  const hasAmmoniteFiles = (await doGlob(ammoniteGlobs)).length > 0

  await restoreCoursierCache(
    sbtGlobs.concat(millGlobs).concat(ammoniteGlobs).concat(extraFiles),
    job,
    extraKey,
    extraCoursierKey,
    matrix,
    JSON.stringify({
      sbt: extraSbtHashedContent,
      mill: extraMillHashedContent,
      amm: extraAmmoniteHashedContent,
      other: extraHashedContent,
      coursier: extraCoursierHashedContent
    })
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
        other: extraHashedContent
      })
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
        other: extraHashedContent
      })
    )
  }

  if (hasAmmoniteFiles) {
    await restoreAmmoniteCache(
      ammoniteGlobs.concat(extraFiles),
      job,
      extraKey,
      extraAmmoniteKey,
      matrix,
      JSON.stringify({
        amm: extraAmmoniteHashedContent,
        other: extraHashedContent
      })
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
