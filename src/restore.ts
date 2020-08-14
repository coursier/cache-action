import * as cache from '@actions/cache'
import * as core from '@actions/core'
import * as exec from '@actions/exec'
const hashFiles = require('hash-files')

// from https://github.com/c-hive/gha-npm-cache/blob/1d899ca6403e4536a2855679ab78f5b89a870863/src/restore.js#L6-L17
async function uname(short: boolean): Promise<string> {
  let output = ''
  const options = {
    listeners: {
      stdout: (data: any) => {
        output += data.toString()
      }
    }
  }
  const args: string[] = []
  if (short) args.push('-s')

  await exec.exec('uname', args, options)

  return output.trim()
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

async function run(): Promise<void> {

  let paths: string[] = []

  const userSpecifiedCachePath = core.getInput('path')
  if (userSpecifiedCachePath) {
    paths = [userSpecifiedCachePath]
    core.exportVariable('COURSIER_CACHE', userSpecifiedCachePath)
  } else {
    paths = [getCachePath(getOs(await uname(true)))]
  }

  const os = await uname(false)

  let root = core.getInput('root')
  if (!root.endsWith('/')) {
    root = `${root}/`
  }

  const extraFilesStr = core.getInput('extraFiles')
  let extraFiles: string[] = []
  if (extraFilesStr) {
    if (extraFilesStr.startsWith('[')) {
      extraFiles = JSON.parse(extraFilesStr) as string[]
    } else {
      extraFiles = [extraFilesStr]
    }
  }

  const hashOptions = {
    files: [
      // sbt
      `${root}*.sbt`,
      `${root}project/**.sbt`,
      `${root}project/build.properties`,
      `${root}project/**.scala`,
      // mill / Ammonite scripts
      `${root}*.sc`,
      `${root}mill`
    ].concat(extraFiles),
    algorithm: 'sha1'
  }

  const hashPromise = new Promise<string>((resolve, reject) => {
    hashFiles(hashOptions, (error: any, hash: string) => {
      if (hash) resolve(hash)
      else reject(error)
    })
  })
  const hash = await hashPromise

  const key = `${os}-coursier-${hash}`
  const restoreKeys = [`${os}-coursier-`]

  core.saveState('COURSIER_CACHE_PATHS', JSON.stringify(paths))
  core.saveState('COURSIER_CACHE_KEY', key)

  const cacheHitKey = await cache.restoreCache(paths, key, restoreKeys)

  if (!cacheHitKey) {
    core.info('Cache not found')
    return
  }

  core.info(`Cache restored from key ${cacheHitKey}`)
  core.setOutput('COURSIER_CACHE_RESULT', cacheHitKey)
}

async function doRun(): Promise<void> {
  try {
    await run()
  } catch (err) {
    core.setFailed(err.toString())
  }
}

doRun()
