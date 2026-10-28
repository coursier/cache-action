import assert from 'node:assert/strict'
import {afterEach, beforeEach, describe, it} from 'node:test'
import {cacheModeAllowsWrite, setupCacheMode} from '../src/cacheMode.ts'

const envVars = ['INPUT_CACHEMODE', 'ACTIONS_CACHE_MODE']

function setEnv(inputMode: string, workflowMode: string): void {
  process.env['INPUT_CACHEMODE'] = inputMode
  if (workflowMode) process.env['ACTIONS_CACHE_MODE'] = workflowMode
}

describe('setupCacheMode', () => {
  let saved: Record<string, string | undefined> = {}

  beforeEach(() => {
    saved = Object.fromEntries(envVars.map(name => [name, process.env[name]]))
    for (const name of envVars) delete process.env[name]
  })

  afterEach(() => {
    for (const name of envVars) {
      if (saved[name] === undefined) delete process.env[name]
      else process.env[name] = saved[name]
    }
  })

  it('keeps the workflow cache-mode when the input is empty', () => {
    setEnv('', 'read')
    assert.equal(setupCacheMode(), 'read')
    assert.equal(process.env['ACTIONS_CACHE_MODE'], 'read')
  })

  it('is empty when neither the input nor the workflow set a mode', () => {
    setEnv('', '')
    assert.equal(setupCacheMode(), '')
    assert.equal(cacheModeAllowsWrite(), true)
  })

  const cases: [string, string, string][] = [
    // input, workflow, expected
    ['read', '', 'read'],
    ['write-only', '', 'write-only'],
    ['write', 'read', 'read'],
    ['write', 'write-only', 'write-only'],
    ['read', 'write-only', 'none'],
    ['write-only', 'read', 'none'],
    ['none', 'write', 'none'],
    ['Read ', 'WRITE', 'read']
  ]
  for (const [input, workflow, expected] of cases) {
    it(`narrows '${workflow}' to '${expected}' with '${input}'`, () => {
      setEnv(input, workflow)
      assert.equal(setupCacheMode(), expected)
      assert.equal(process.env['ACTIONS_CACHE_MODE'], expected)
      assert.equal(
        cacheModeAllowsWrite(),
        expected === 'write' || expected === 'write-only'
      )
    })
  }

  it('rejects unknown modes', () => {
    setEnv('readonly', '')
    assert.throws(() => setupCacheMode(), /Invalid cacheMode input 'readonly'/)
  })
})
