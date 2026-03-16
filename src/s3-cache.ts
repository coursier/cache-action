import * as core from '@actions/core'
import * as exec from '@actions/exec'
import {
  S3Client,
  HeadObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  type S3ClientConfig
} from '@aws-sdk/client-s3'
import {Upload} from '@aws-sdk/lib-storage'
import {createReadStream, createWriteStream} from 'fs'
import {mkdtemp, rm, stat} from 'fs/promises'
import {Readable} from 'stream'
import {pipeline} from 'stream/promises'
import * as os from 'os'
import * as path from 'path'

export function isS3BackendEnabled(): boolean {
  return Boolean(core.getInput('s3-bucket'))
}

function createS3Client(): S3Client {
  const endpoint = core.getInput('s3-endpoint') || undefined
  const region = core.getInput('s3-region') || 'us-east-1'
  const accessKeyId = core.getInput('s3-access-key-id') || undefined
  const secretAccessKey = core.getInput('s3-secret-access-key') || undefined
  const forcePathStyle = core.getBooleanInput('s3-path-style', {
    required: false
  })

  const config: S3ClientConfig = {
    region,
    endpoint,
    forcePathStyle
  }

  if (accessKeyId && secretAccessKey) {
    config.credentials = {accessKeyId, secretAccessKey}
  }

  return new S3Client(config)
}

function expandHome(p: string): string {
  if (p.startsWith('~/') || p === '~') {
    return os.homedir() + p.slice(1)
  }
  if (p.startsWith('~\\')) {
    return os.homedir() + p.slice(1)
  }
  return p
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

async function createTar(paths: string[]): Promise<string> {
  const expandedPaths = paths.map(expandHome)
  const existingPaths: string[] = []
  for (const p of expandedPaths) {
    if (await pathExists(p)) {
      existingPaths.push(p)
    } else {
      core.info(`Cache path does not exist, skipping: ${p}`)
    }
  }

  if (existingPaths.length === 0) {
    throw new Error('No cache paths exist to save')
  }

  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'cs-s3-cache-'))
  const tarPath = path.join(tmpDir, 'cache.tar.gz')

  // Create archive with paths relative to filesystem root, so they restore
  // to the exact same absolute locations on extraction with -C /.
  // Normalize each relative path to prevent directory traversal (e.g. ../).
  const relPaths = existingPaths.map(p => {
    const rel = p.startsWith('/') ? p.slice(1) : p
    const normalized = path.normalize(rel)
    if (normalized.startsWith('..')) {
      throw new Error(
        `Cache path "${p}" resolves outside the filesystem root and cannot be archived`
      )
    }
    return normalized
  })
  await exec.exec('tar', ['-czf', tarPath, '-C', '/', ...relPaths])

  return tarPath
}

async function extractTar(tarPath: string): Promise<void> {
  // Archives are always created by this action itself and stored in a bucket
  // controlled by the user, so the content is trusted. Extracting to / restores
  // files to exactly the same absolute paths they were archived from.
  await exec.exec('tar', ['-xzf', tarPath, '-C', '/'])
}

async function downloadToFile(
  s3Client: S3Client,
  bucket: string,
  objectKey: string,
  destPath: string
): Promise<void> {
  const response = await s3Client.send(
    new GetObjectCommand({Bucket: bucket, Key: objectKey})
  )
  if (!response.Body) {
    throw new Error(`Empty response body from S3 for key: ${objectKey}`)
  }
  await pipeline(response.Body as Readable, createWriteStream(destPath))
}

export async function restoreCacheS3(
  paths: string[],
  key: string,
  restoreKeys: string[]
): Promise<string | undefined> {
  const s3Client = createS3Client()
  const bucket = core.getInput('s3-bucket')
  const objectKey = `${key}.tar.gz`

  // Try exact key first
  try {
    await s3Client.send(new HeadObjectCommand({Bucket: bucket, Key: objectKey}))
    core.info(`Found exact S3 cache key: ${key}`)
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'cs-s3-cache-'))
    const tarPath = path.join(tmpDir, 'cache.tar.gz')
    try {
      await downloadToFile(s3Client, bucket, objectKey, tarPath)
      await extractTar(tarPath)
    } finally {
      await rm(tmpDir, {recursive: true, force: true})
    }
    return key
  } catch (err: unknown) {
    const errName = (err as {name?: string}).name ?? ''
    if (errName !== 'NotFound' && errName !== 'NoSuchKey') {
      throw err
    }
  }

  // Try restore keys (prefix-based, most specific first)
  for (const restoreKey of restoreKeys) {
    const response = await s3Client.send(
      new ListObjectsV2Command({Bucket: bucket, Prefix: restoreKey})
    )
    const contents = response.Contents ?? []
    if (contents.length > 0) {
      // Sort by last modified descending — take the most recently saved entry
      contents.sort(
        (a, b) =>
          (b.LastModified?.getTime() ?? 0) - (a.LastModified?.getTime() ?? 0)
      )
      const matchedObjectKey = contents[0].Key ?? ''
      const matchedKey = matchedObjectKey.endsWith('.tar.gz')
        ? matchedObjectKey.slice(0, -7)
        : matchedObjectKey
      core.info(
        `Found S3 cache with restore key prefix "${restoreKey}": ${matchedKey}`
      )
      const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'cs-s3-cache-'))
      const tarPath = path.join(tmpDir, 'cache.tar.gz')
      try {
        await downloadToFile(s3Client, bucket, matchedObjectKey, tarPath)
        await extractTar(tarPath)
      } finally {
        await rm(tmpDir, {recursive: true, force: true})
      }
      return matchedKey
    }
  }

  return undefined
}

export async function saveCacheS3(paths: string[], key: string): Promise<void> {
  const s3Client = createS3Client()
  const bucket = core.getInput('s3-bucket')
  const objectKey = `${key}.tar.gz`

  let tmpDir: string | undefined

  try {
    const tarPath = await createTar(paths)
    tmpDir = path.dirname(tarPath)

    core.info(`Uploading cache to s3://${bucket}/${objectKey}`)
    const upload = new Upload({
      client: s3Client,
      params: {
        Bucket: bucket,
        Key: objectKey,
        Body: createReadStream(tarPath)
      }
    })

    await upload.done()
    core.info(`Saved cache to s3://${bucket}/${objectKey}`)
  } finally {
    if (tmpDir) {
      await rm(tmpDir, {recursive: true, force: true})
    }
  }
}
