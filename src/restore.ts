import * as cache from '@actions/cache'
import * as core from '@actions/core'
import * as exec from '@actions/exec'
const hashFiles = require('hash-files')
const glob = require('glob-all')

let _unameValue = ''

async function uname(): Promise<string> {
  if (!_unameValue) {
    // from https://github.com/c-hive/gha-npm-cache/blob/1d899ca6403e4536a2855679ab78f5b89a870863/src/restore.js#L6-L17
    let output = ''
    const options = {
      listeners: {
        stdout: (data: any) => {
          output += data.toString()
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

async function doHashFiles(files: string[]): Promise<string> {
  const hashOptions = {
    files,
    algorithm: 'sha1'
  }
  return new Promise<string>((resolve, reject) => {
    hashFiles(hashOptions, (error: any, hash: string) => {
      if (hash) resolve(hash)
      else reject(error)
    })
  })
}

async function doGlob(globs: string[]): Promise<string[]> {
  return new Promise<string[]>((resolve, reject) => {
    glob(globs, (error: any, files: string[]) => {
      if (files) resolve(files)
      else reject(error)
    })
  })
}

async function restoreCache(
  id: string,
  paths: string[],
  inputFiles: string[]
): Promise<void> {
  const os = await uname()

  const upperId = id.toLocaleUpperCase('en-US')

  const hash = await doHashFiles(inputFiles)

  const key = `${os}-${id}-${hash}`
  const restoreKeys = [`${os}-${id}-`]

  core.saveState(`${upperId}_CACHE_PATHS`, JSON.stringify(paths))
  core.saveState(`${upperId}_CACHE_KEY`, key)

  const cacheHitKey = await cache.restoreCache(paths, key, restoreKeys)

  if (!cacheHitKey) {
    core.info(`${id} cache not found`)
    return
  }

  core.info(`${id} cache restored from key ${cacheHitKey}`)
  core.saveState(`${upperId}_CACHE_RESULT`, cacheHitKey)
}

async function restoreCoursierCache(inputFiles: string[]): Promise<void> {
  let paths: string[] = []

  const userSpecifiedCachePath = core.getInput('path')
  if (userSpecifiedCachePath) {
    paths = [userSpecifiedCachePath]
    core.exportVariable('COURSIER_CACHE', userSpecifiedCachePath)
  } else {
    paths = [getCachePath(getOs(await uname()))]
  }

  await restoreCache('coursier', paths, inputFiles)
}

async function restoreSbtCache(inputFiles: string[]): Promise<void> {
  await restoreCache('sbt', ['~/.sbt'], inputFiles)
}

async function restoreMillCache(inputFiles: string[]): Promise<void> {
  await restoreCache('mill', ['~/.mill'], inputFiles)
}

async function restoreAmmoniteCache(inputFiles: string[]): Promise<void> {
  await restoreCache('ammonite', ['~/.ammonite'], inputFiles)
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

async function run(): Promise<void> {
  let root = core.getInput('root')
  if (!root.endsWith('/')) {
    root = `${root}/`
  }

  const extraFiles = readExtraFiles('extraFiles')
  const extraSbtFiles = readExtraFiles('extraSbtFiles')
  const extraMillFiles = readExtraFiles('extraMillFiles')
  const extraAmmoniteFiles = readExtraFiles('ammoniteScripts')

  const sbtGlobs = [
    `${root}*.sbt`,
    `${root}project/**.sbt`,
    `${root}project/build.properties`,
    `${root}project/**.scala`
  ].concat(extraSbtFiles)

  const millGlobs = [`${root}*.sc`, `${root}mill`].concat(extraMillFiles)

  const ammoniteGlobs = [`${root}*.sc`, `${root}*/*.sc`].concat(
    extraAmmoniteFiles
  )

  const hasSbtFiles = (await doGlob(sbtGlobs)).length > 0
  const hasMillFiles = (await doGlob(millGlobs)).length > 0
  const hasAmmoniteFiles = (await doGlob(ammoniteGlobs)).length > 0

  await restoreCoursierCache(
    sbtGlobs.concat(millGlobs).concat(ammoniteGlobs).concat(extraFiles)
  )

  if (hasSbtFiles) {
    await restoreSbtCache(sbtGlobs.concat(extraFiles))
  }

  if (hasMillFiles) {
    await restoreMillCache(millGlobs.concat(extraFiles))
  }

  if (hasAmmoniteFiles) {
    await restoreAmmoniteCache(ammoniteGlobs.concat(extraFiles))
  }
}

async function doRun(): Promise<void> {
  try {
    await run()
  } catch (err) {
    core.setFailed(err.toString())
  }
}

doRun()
