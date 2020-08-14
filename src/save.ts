// adapted from https://github.com/c-hive/gha-npm-cache/blob/1d899ca6403e4536a2855679ab78f5b89a870863/src/save.js

import * as cache from '@actions/cache'
import * as core from '@actions/core'

async function run(): Promise<void> {
  const cacheKey = core.getState('COURSIER_CACHE_RESULT')
  const primaryKey = core.getState('COURSIER_CACHE_KEY')
  const cachePaths = JSON.parse(
    core.getState('COURSIER_CACHE_PATHS')
  ) as string[]

  if (cacheKey === primaryKey) {
    core.info(
      `Cache hit occurred on the primary key ${primaryKey}, not saving cache.`
    )
    return
  }

  // https://github.com/actions/cache/blob/9ab95382c899bf0953a0c6c1374373fc40456ffe/src/save.ts#L39-L49
  try {
    await cache.saveCache(cachePaths, primaryKey)
  } catch (error) {
    if (error.name === cache.ValidationError.name) {
      throw error
    } else if (error.name === cache.ReserveCacheError.name) {
      core.info(error.message)
    } else {
      core.info(`[warning] ${error.message}`)
    }
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
