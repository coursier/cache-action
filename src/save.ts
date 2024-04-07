// adapted from https://github.com/c-hive/gha-npm-cache/blob/1d899ca6403e4536a2855679ab78f5b89a870863/src/save.js

import * as cache from '@actions/cache'
import * as core from '@actions/core'

async function saveCache(id: string): Promise<void> {
  const upperId = id.toLocaleUpperCase('en-US')
  const primaryKey = core.getState(`${upperId}_CACHE_KEY`)

  if (!primaryKey) {
    return
  }

  const cacheKey = core.getState(`${upperId}_CACHE_RESULT`)
  const cachePaths = JSON.parse(
    core.getState(`${upperId}_CACHE_PATHS`)
  ) as string[]

  core.info(`${id} cache key:`)
  core.info(`  ${primaryKey}`)
  if (cacheKey.length > 0) {
    core.info(`${id} cache restored from:`)
    core.info(`  ${cacheKey}`)
  }

  if (cacheKey === primaryKey) {
    core.info(`${id} cache hit, not saving cache.`)
    return
  }

  // https://github.com/actions/cache/blob/9ab95382c899bf0953a0c6c1374373fc40456ffe/src/save.ts#L39-L49
  try {
    core.info(`Saving ${id} cache`)
    await cache.saveCache(cachePaths, primaryKey)
  } catch (err: unknown) {
    if (err instanceof cache.ValidationError) {
      throw err
    } else if (err instanceof cache.ReserveCacheError) {
      core.info(err.message)
    } else {
      const msg = err instanceof Error ? err.message : String(err)
      core.info(`[warning] ${msg}`)
    }
  }
  core.info('  ')
}

// This should catch some EBADF errors seen in the post cache step.
// Same as https://github.com/actions/cache/blob/0638051e9af2c23d10bb70fa9beffcad6cff9ce3/src/save.ts#L10
process.on('uncaughtException', e => core.info(`[warning] ${e.message}`))

async function run(): Promise<void> {
  await saveCache('coursier')
  await saveCache('sbt-ivy2-cache')
  await saveCache('mill')
  await saveCache('ammonite')
}

async function doRun(): Promise<void> {
  try {
    await run()
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    core.info(`[warning] Caught ${msg}, ignoring it`)
  }

  // Explicit termination to make sure we don't hang with some dangling promises.
  // Same as https://github.com/actions/cache/blob/0c45773b623bea8c8e75f6c82b208c3cf94ea4f9/src/saveImpl.ts#L116-L123
  core.info('All caches saved')
  process.exit(0)
}

doRun()
