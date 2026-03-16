# coursier cache action

A GitHub action to save / restore the coursier / sbt / mill / Ammonite caches of your build.

## Usage

Add a `coursier/cache-action@v7` step to your YAML workflow, like
```yaml
    steps:
      - uses: actions/checkout@v5
      - uses: coursier/cache-action@v7
```

## Cached directories

### Coursier cache

Always cached.

Add files to take into account in its cache key via [`extraFiles`](#extrafiles).

### `~/.sbt` and `~/.ivy2/cache`

Cached when sbt files are found (any of `*.sbt`, `project/**.scala`, `project/**.sbt`, `project/build.properties`).

Add files to take into account in its cache key via [`extraSbtFiles`](#extrasbtfiles).

### `~/.cache/mill`

Cached when mill files are found (any of `.mill-version`, `./mill`).

Add files to take into account in its cache key via [`extraMillFiles`](#extramillfiles).

### `~/.ammonite`

Cached when Ammonite scripts are found (any of `*.sc`, `*/*.sc`).

Add files to take into account in its cache key via [`ammoniteScripts`](#ammonitescripts).

## S3 caching backend

For self-hosted runners, the action can use an S3-compatible object store (AWS S3, MinIO, etc.)
as the caching backend instead of the default GitHub Actions cache.

Set the `s3-bucket` input to enable this. All caches (coursier, sbt, mill, Ammonite) will then
be stored in and restored from that bucket.

### Example — AWS S3

```yaml
    steps:
      - uses: actions/checkout@v5
      - uses: coursier/cache-action@v7
        with:
          s3-bucket: my-ci-cache-bucket
          s3-region: eu-west-1
          s3-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          s3-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
```

### Example — MinIO (self-hosted S3-compatible)

```yaml
    steps:
      - uses: actions/checkout@v5
      - uses: coursier/cache-action@v7
        with:
          s3-bucket: ci-cache
          s3-endpoint: http://minio.internal:9000
          s3-region: us-east-1
          s3-path-style: 'true'
          s3-access-key-id: ${{ secrets.MINIO_ACCESS_KEY }}
          s3-secret-access-key: ${{ secrets.MINIO_SECRET_KEY }}
```

> **Note:** The S3 backend requires `tar` to be available on the runner.
> It is supported on Linux and macOS runners. Windows is not currently supported.

## Parameters

### `root`

*Optional* Root directory containing build definition sources (`build.sbt`, `build.sc`, etc.)

If the sbt or mill build definition files are in a sub-directory, pass the path to this
sub-directory here.

### `path`

*Optional* Override for the path of the coursier cache.

By default, the coursier cache is assumed to be in the [default OS-dependent location](https://get-coursier.io/docs/cache.html#default-location).
Set this input to override that. Note that this action will also set the `COURSIER_CACHE` environment variable
if an override is specified, so that you don't have to set it yourself.

### `extraFiles`

*Optional* Extra files to take into account in the cache key.

By default, sbt build definition files (`*.sbt`, `project/**.{scala,sbt}`, `project/build.properties`) and
mill build definition files (`*.sc`, `./mill`) are hashed to uniquely identify the cached data. Upon
cache restoration, if an exact match is found, the cache is not saved again at the end of the job.
In case of no exact match, it is assumed new files may have been fetched; the previous cache for the
current OS, if any, is restored, but a new cache is persisted with a new key at the end of the job.

To take into account extra files in the cache key, pass via `extraFiles` either
- a single path as a string
- multiple paths in a JSON array, encoded in a string

Blobs are accepted (processed by [@actions/glob](https://www.npmjs.com/package/@actions/glob)).

### `extraSbtFiles`

*Optional* Extra sbt files to take into account in the sbt cache key. Same format as extraFiles.

### `extraMillFiles`

*Optional* Extra mill files to take into account in the mill cache key. Same format as extraFiles.

### `ammoniteScripts`

*Optional* Extra Ammonite scripts to take into account in the Ammonite cache key. Same format as extraFiles.

### `extraKey`

*Optional*

Extra value to be appended to the coursier cache key.

See `extraFiles` for more details.

### `extraHashedContent`

*Optional*

Extra content to take into account in the cache key.

See `extraFiles` for more details.

The content of `extraHashedContent` is taken into account in the hash for the coursier cache key.

### `ignoreJob`

*Optional*

Default: `false`

Set `true` if you don't want to use a job id as part of cache key.

### `ignoreMatrix`

*Optional*

Default: `false`

Set `true` if you don't want to use a matrix jobs as part of cache key.

### `ignoreAmmonite`

*Optional*

Default: `false`

Set `true` to skip saving and restoring the Ammonite cache, regardless of whether the repository contains `.sc` scripts.

### `s3-bucket`

*Optional*

Name of the S3 bucket to use as the caching backend. When set, all caches are stored in and retrieved from this S3 bucket instead of the GitHub Actions cache.

### `s3-endpoint`

*Optional*

Custom S3 endpoint URL. Use this to point to an S3-compatible service such as MinIO (e.g. `http://minio:9000`). Leave empty to use the default AWS S3 endpoint.

### `s3-region`

*Optional* Default: `us-east-1`

AWS region for the S3 bucket.

### `s3-access-key-id` / `s3-secret-access-key`

*Optional*

AWS credentials for authenticating with S3. If not set, the AWS SDK falls back to its default credential chain (environment variables, instance profile, etc.).

### `s3-path-style`

*Optional* Default: `false`

Set `true` to force path-style addressing (required for MinIO and most self-hosted S3-compatible services).

## Outputs

* `cache-hit-coursier` - A boolean value to indicate a match was found for the coursier cache
* `cache-hit-sbt-ivy2-cache` - A boolean value to indicate a match was found for the sbt-ivy2-cache cache
* `cache-hit-mill` - A boolean value to indicate a match was found for the mill cache
* `cache-hit-ammonite` - A boolean value to indicate a match was found for the ammonite cache

> See [Skipping steps based on cache-hit](#Skipping-steps-based-on-cache-hit) for info on using this output

## Skipping steps based on cache-hit

Using the `cache-hit-...` outputs above, subsequent steps can be skipped when a cache hit occurs on a given key.

Example:
```yaml
steps:
  - uses: actions/checkout@v5

  - uses: coursier/cache-action@v7
    id: coursier-cache

  - name: Fetch Dependencies
    if: steps.coursier-cache.outputs.cache-hit-coursier != 'true'
    run: sbt +update
```

> Note: The `id` defined in `coursier/cache-action` must match the `id` in the `if` statement (i.e. `steps.[ID].outputs.cache-hit-coursier`)
