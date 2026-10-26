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

Always cached. Only the cache itself is (`v1`, like `~/.cache/coursier/v1` on Linux), not the
directories next to it, like the archive cache (`arc`, whose archives get extracted again from
the ones in `v1`) or the privileged archive cache (`priv`, that has files only root can read).

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

### `disableFallback`

*Optional*

Default: `false`

Set `true` to disable falling back to a less specific cache key when there is no exact cache hit. By default, if no exact cache match is found, the action will restore from a more general cache key (e.g. from a different job or build configuration). Disabling this prevents unintended cache sharing across jobs or matrix instances that have different dependency sets.

### `cacheMode`

*Optional*

Default: empty (use the workflow / job `cache-mode` as is)

Cache access for this step: one of `read`, `write`, `write-only`, or `none`. This can only narrow the access
granted by the workflow or job [`cache-mode`](#cache-access-cache-mode), never widen it. For example, pass `read`
to restore caches without saving them.

## Cache access (`cache-mode`)

GitHub Actions lets workflows restrict their access to the cache with the
[`cache-mode` key](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching),
set at the workflow level, at the job level, or both (a job-level value overrides the workflow-level one).
This action honors it, like `actions/cache` does:

| `cache-mode` | Caches restored | Caches saved |
|--------------|-----------------|--------------|
| `write`      | Yes             | Yes          |
| `read`       | Yes             | No           |
| `write-only` | No              | Yes          |
| `none`       | No              | No           |

When `cache-mode` isn't set, GitHub picks `write` for trusted triggers (`push`, `schedule`, `workflow_dispatch`, …)
and `read` for low-trust ones (`pull_request_target`, `issue_comment`, `workflow_run`, …).

When the mode doesn't permit an operation, the action logs a message and moves on, and the job doesn't fail.
A skipped restore counts as a cache miss, so the `cache-hit-…` outputs are `false`. A skipped save just doesn't
happen.

For example, to have a job restore caches without ever saving them:

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    cache-mode: read
    steps:
      - uses: actions/checkout@v5
      - uses: coursier/cache-action@v7
      - run: sbt test
```

To restrict only this action, and leave other caching steps of the job unaffected, use the
[`cacheMode`](#cachemode) input instead:

```yaml
steps:
  - uses: actions/checkout@v5
  - uses: coursier/cache-action@v7
    with:
      cacheMode: read   # restore the coursier / sbt / mill / Ammonite caches, but never save them
```

`cacheMode` can only narrow what the workflow or job grants. Combining `cacheMode: read` with a job
`cache-mode: write-only`, for example, gives `none`. The input also works on runners that don't support
the `cache-mode` key, such as older GitHub Enterprise Server releases.

### Read-only caches in pull requests, read / write on `main`

Caches saved by `pull_request` runs are only visible to that pull request, but they still count towards the
repository cache quota, and can get caches from `main` evicted. To have pull requests reuse the caches of `main`
without saving their own, while `main` keeps updating them, compute `cacheMode` from the branch:

```yaml
on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: coursier/cache-action@v7
        with:
          cacheMode: ${{ github.ref == 'refs/heads/main' && 'write' || 'read' }}
      - run: sbt test
```

On `main`, the caches are restored, then saved if their key changed. In pull requests (`github.ref` is
`refs/pull/<number>/merge` there), the caches of `main` are restored, but nothing is saved. Pull requests whose build
files differ from `main` fall back on the closest cache from `main`, as described in [`extraFiles`](#extrafiles).

GitHub doesn't document `${{ … }}` expressions as supported in the `cache-mode` key, so getting the same behavior with
it means separate workflows, such as one triggered on `push` to `main` (where the default is `write`) and another one
triggered on `pull_request` that sets `cache-mode: read` at the top level.

## Cache invalidation

To manually invalidate the cache without changing your build files, set the `COURSIER_CACHE_ACTION_CACHE_VERSION`
environment variable in your workflow. Changing its value produces a different cache key across all
cache types, so the old cache is ignored and a fresh one is created.

The variable can be set at the workflow level so that it applies to every step:

```yaml
env:
  COURSIER_CACHE_ACTION_CACHE_VERSION: 1   # increment this value to invalidate the cache

steps:
  - uses: actions/checkout@v5
  - uses: coursier/cache-action@v7
```

Or it can be scoped to only the `coursier/cache-action` step:

```yaml
steps:
  - uses: actions/checkout@v5
  - uses: coursier/cache-action@v7
    env:
      COURSIER_CACHE_ACTION_CACHE_VERSION: 1   # increment this value to invalidate the cache
```

This is equivalent to passing the version as `extraHashedContent`, but more convenient because it
can be set globally for the whole workflow (or even as a repository variable / secret) without
touching the individual step configuration.

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
