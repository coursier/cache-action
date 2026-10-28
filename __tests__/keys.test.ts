import assert from 'node:assert/strict'
import {mkdir, mkdtemp, realpath, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import * as path from 'node:path'
import {after, before, describe, it} from 'node:test'
import {cacheKeys, hashContent, withLfLineEndings} from '../src/keys.ts'

const noParts = {
  job: '',
  matrixHashedContent: '',
  extraSharedKey: '',
  extraKey: '',
  inputFiles: [],
  extraHashedContent: ''
}

describe('withLfLineEndings', () => {
  it('converts CRLF line endings to LF', () => {
    assert.equal(
      withLfLineEndings(Buffer.from('a\r\nb\r\n')).toString(),
      'a\nb\n'
    )
  })

  it('leaves lone CR and non-ASCII bytes alone', () => {
    const content = Buffer.from([0x61, 0x0d, 0x62, 0xe9, 0x0d, 0x0a, 0xff])
    assert.deepEqual(
      withLfLineEndings(content),
      Buffer.from([0x61, 0x0d, 0x62, 0xe9, 0x0a, 0xff])
    )
  })
})

describe('hashContent', () => {
  let tmp = ''
  let workspace = ''
  let previousWorkspace: string | undefined

  before(async () => {
    tmp = await realpath(
      await mkdtemp(path.join(tmpdir(), 'cache-action-test-'))
    )
    workspace = path.join(tmp, 'workspace')
    await mkdir(workspace)
    previousWorkspace = process.env['GITHUB_WORKSPACE']
    process.env['GITHUB_WORKSPACE'] = workspace
    await writeFile(path.join(workspace, 'lf.sbt'), 'a\nb\n')
    await writeFile(path.join(workspace, 'crlf.sbt'), 'a\r\nb\r\n')
    await writeFile(path.join(workspace, 'other.sbt'), 'c\n')
    await writeFile(path.join(tmp, 'outside.sbt'), 'a\n')
  })

  after(async () => {
    if (previousWorkspace === undefined) delete process.env['GITHUB_WORKSPACE']
    else process.env['GITHUB_WORKSPACE'] = previousWorkspace
    await rm(tmp, {recursive: true, force: true})
  })

  it('hashes CRLF files like LF ones', async () => {
    assert.equal(
      await hashContent([path.join(workspace, 'crlf.sbt')], ''),
      await hashContent([path.join(workspace, 'lf.sbt')], '')
    )
  })

  it('depends on the file content', async () => {
    assert.notEqual(
      await hashContent([path.join(workspace, 'lf.sbt')], ''),
      await hashContent([path.join(workspace, 'other.sbt')], '')
    )
  })

  it('depends on the hashed content', async () => {
    const files = [path.join(workspace, 'lf.sbt')]
    assert.notEqual(
      await hashContent(files, 'foo'),
      await hashContent(files, 'bar')
    )
  })

  it('is empty when nothing matches', async () => {
    assert.equal(await hashContent([path.join(workspace, '*.mill')], ''), '')
    assert.equal(await hashContent([], ''), '')
  })

  it('ignores files outside of the workspace', async () => {
    assert.equal(await hashContent([path.join(tmp, 'outside.sbt')], ''), '')
  })

  it('keeps hashing content the same way', async () => {
    // Changing this hash changes the cache keys of all users
    assert.equal(
      await hashContent([], '{"os":"ubuntu-latest","scala":"3"}'),
      'a680f79d90885dce0b12ba3c9a6a126268fed164c5c7585a296e7fe6c5722aa4'
    )
  })
})

describe('cacheKeys', () => {
  it('only has the prefix when no part is set', async () => {
    assert.deepEqual(await cacheKeys('mill', noParts), {
      key: 'mill',
      restoreKeys: []
    })
  })

  it('falls back on less and less specific keys', async () => {
    const matrix = '{"scala":"3"}'
    const matrixHash = await hashContent([], matrix)
    const hash = await hashContent([], 'content')
    const {key, restoreKeys} = await cacheKeys('coursier', {
      job: 'test',
      matrixHashedContent: matrix,
      extraSharedKey: 'shared',
      extraKey: 'extra',
      inputFiles: [],
      extraHashedContent: 'content'
    })
    const base = `coursier-test-matrix-${matrixHash}`
    assert.equal(key, `${base}-shared-extra-${hash}`)
    assert.deepEqual(restoreKeys, [
      `${base}-shared-extra-`,
      `${base}-shared-`,
      `${base}-`,
      'coursier-test-',
      'coursier-'
    ])
  })

  it('leaves out the parts that are not set', async () => {
    assert.deepEqual(
      await cacheKeys('sbt-ivy2-cache-linux-x64', {
        ...noParts,
        extraKey: 'foo'
      }),
      {
        key: 'sbt-ivy2-cache-linux-x64-foo',
        restoreKeys: ['sbt-ivy2-cache-linux-x64-']
      }
    )
  })
})
