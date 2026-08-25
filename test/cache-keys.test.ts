import assert from 'node:assert/strict'
import test from 'node:test'

import {buildCacheKeys} from '../src/cache-keys.ts'

const baseParts = {
  id: 'coursier',
  job: 'tests',
  matrixHash: '',
  extraSharedKey: '',
  extraKey: '',
  inputHash: 'build-hash'
}

test('default fallbacks include same-job and cross-job prefixes', () => {
  assert.deepEqual(
    buildCacheKeys({...baseParts, disableCrossJobFallback: false}),
    {
      key: 'coursier-tests-build-hash',
      restoreKeys: ['coursier-tests-', 'coursier-']
    }
  )
})

test('cross-job fallback can be disabled without disabling same-job fallback', () => {
  assert.deepEqual(
    buildCacheKeys({...baseParts, disableCrossJobFallback: true}),
    {
      key: 'coursier-tests-build-hash',
      restoreKeys: ['coursier-tests-']
    }
  )
})

test('cross-job fallback option is inert when job keys are ignored', () => {
  assert.deepEqual(
    buildCacheKeys({
      ...baseParts,
      job: '',
      disableCrossJobFallback: true
    }),
    {
      key: 'coursier-build-hash',
      restoreKeys: ['coursier-']
    }
  )
})
