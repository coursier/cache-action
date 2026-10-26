# coursier cache action

A GitHub action that saves and restores the caches of Scala builds: the
[coursier](https://get-coursier.io) cache, and, depending on the build tool your repository uses,
the [sbt](https://www.scala-sbt.org), [mill](https://mill-build.org) and
[Ammonite](https://ammonite.io) caches.

It looks at your build files to decide which caches to handle, and derives the cache keys from
their content, so that the caches are updated when your build (and so, likely, its dependencies)
changes, and only then.

## Usage

Add a `coursier/cache-action@v8` step to your workflow, after checking out your repository and
before running your build:

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: coursier/cache-action@v8
      - run: sbt test
```

The caches are restored when the step runs, and saved at the end of the job, if the job succeeds.

No configuration is needed in most cases. The [inputs](#inputs) let you
- point the action to a build in a sub-directory ([`root`](#root)),
- take more files or values into account in the cache keys ([`extraFiles`](#extrafiles), [`extraKey`](#extrakey), …),
- restrict when caches are restored or saved ([`cacheMode`](#cachemode), [`disableFallback`](#disablefallback)).

## Cached directories

| Cache | Directories | Cached when | Output |
|-------|-------------|-------------|--------|
| [Coursier](#coursier-cache) | `~/.cache/coursier/v1` (Linux), `~/Library/Caches/Coursier/v1` (macOS), `~\AppData\Local\Coursier\Cache\v1` (Windows) | Always | `cache-hit-coursier` |
| [sbt](#sbt-sbt-and-ivy2cache) | `~/.sbt`, `~/.ivy2/cache` | sbt build files are found | `cache-hit-sbt-ivy2-cache` |
| [mill](#mill-cachemill) | `~/.cache/mill` | mill files are found | `cache-hit-mill` |
| [Ammonite](#ammonite-ammonite) | `~/.ammonite` | Ammonite scripts are found | `cache-hit-ammonite` |

Build files are looked for in the [`root`](#root) directory, which is the root of the repository
by default.

### Coursier cache

Always cached. Only the cache itself is (`v1`, in the
[default OS-dependent location](https://get-coursier.io/docs/cache.html#default-location), or
wherever [`path`](#path) points), not the directories next to it, like the archive cache (`arc`,
whose archives get extracted again from the ones in `v1`) or the privileged archive cache (`priv`,
that has files only root can read).

Its key takes into account the build files of all the caches below (sbt, mill, and Ammonite ones,
unless [`ignoreAmmonite`](#ignoreammonite) is set), as well as [`extraFiles`](#extrafiles).

### sbt: `~/.sbt` and `~/.ivy2/cache`

Cached when any of these sbt files are found:
- `*.sbt`
- `project/**.sbt`
- `project/**.scala`
- `project/build.properties`

or when files matching [`extraSbtFiles`](#extrasbtfiles) are found.

Files that sbt and Ivy re-generate on each run (`~/.ivy2/cache/**/ivydata-*.properties`, and
`~/.sbt/**/*.lock`) are removed before saving the cache.

### mill: `~/.cache/mill`

Cached when any of these mill files are found:
- `.mill-version`
- `mill` (the mill launcher script)

or when files matching [`extraMillFiles`](#extramillfiles) are found.

Its key also takes into account the mill build definition files: `*.mill`, `*.mill.yaml`,
`*.mill.scala` and `*.sc` (for older mill versions).

### Ammonite: `~/.ammonite`

Cached when any of these Ammonite scripts are found:
- `*.sc`
- `*/*.sc`

or when files matching [`ammoniteScripts`](#ammonitescripts) are found.

Set [`ignoreAmmonite`](#ignoreammonite) to `true` to never cache it (for example if your `*.sc`
files are mill build files, not Ammonite scripts).

## How cache keys work

Each cache has its own key, made of the following parts, separated by `-`:

1. the cache name (`coursier`, `sbt-ivy2-cache`, `mill` or `ammonite`),
2. the job id (see [`job`](#job) and [`ignoreJob`](#ignorejob)),
3. `matrix-` followed by a hash of the matrix values, if the job uses a matrix (see
   [`matrix`](#matrix) and [`ignoreMatrix`](#ignorematrix)),
4. [`extraKey`](#extrakey), if set,
5. the cache-specific extra key ([`extraSbtKey`](#extrasbtkey-extramillkey-extraammonitekey), …), if set,
6. a hash of the build files [listed above](#cached-directories), of [`extraFiles`](#extrafiles),
   and of [`extraHashedContent`](#extrahashedcontent).

Parts that don't apply are left out. For example, the sbt cache of a `test` job with a matrix
gets a key like
```text
sbt-ivy2-cache-test-matrix-<matrix hash>-<build files hash>
```

When the job starts:
- if a cache with that exact key exists, it is restored, the `cache-hit-…` output is `true`,
  and the cache isn't saved again at the end of the job, as it is up-to-date already,
- else, the action falls back on the most recent cache whose key shares the longest prefix with
  that key, dropping the parts above from the end one by one (`sbt-ivy2-cache-test-matrix-<matrix hash>-`,
  then `sbt-ivy2-cache-test-`, then `sbt-ivy2-cache-`). The `cache-hit-…` output is `false`,
  and, as new dependencies may get downloaded during the job, the cache is saved under the new
  key at the end of the job. Set [`disableFallback`](#disablefallback) to `true` to start from
  an empty cache instead.

Build files are hashed with LF line endings, so that checking them out with CRLF ones
(`core.autocrlf`, on Windows) doesn't change the keys.

Caches are only saved if the job succeeds, and only if the [cache mode](#cache-access-cache-mode)
allows it.

## Inputs

All inputs are optional.

| Input | Default | Description |
|-------|---------|-------------|
| [`root`](#root) | `.` | Directory containing the build definition |
| [`path`](#path) | | Path of the coursier cache, if not the default one |
| [`extraFiles`](#extrafiles) | | Extra files to hash in all cache keys |
| [`extraSbtFiles`](#extrasbtfiles) | | Extra sbt build files |
| [`extraMillFiles`](#extramillfiles) | | Extra mill build files |
| [`ammoniteScripts`](#ammonitescripts) | | Extra Ammonite scripts |
| [`extraKey`](#extrakey) | | Extra value added to all cache keys |
| [`extraSbtKey`, `extraMillKey`, `extraAmmoniteKey`](#extrasbtkey-extramillkey-extraammonitekey) | | Extra value added to a single cache key |
| [`extraHashedContent`](#extrahashedcontent) | | Extra content to hash in all cache keys |
| [`extraSbtHashedContent`, `extraMillHashedContent`, `extraAmmoniteHashedContent`](#extrasbthashedcontent-extramillhashedcontent-extraammonitehashedcontent) | | Extra content to hash in a single cache key |
| [`job`](#job) | `${{ github.job }}` | Job name, added to the cache keys |
| [`matrix`](#matrix) | `${{ toJson(matrix) }}` | Matrix values, hashed in the cache keys |
| [`ignoreJob`](#ignorejob) | `false` | Leave the job name out of the cache keys |
| [`ignoreMatrix`](#ignorematrix) | `false` | Leave the matrix values out of the cache keys |
| [`ignoreAmmonite`](#ignoreammonite) | `false` | Never cache `~/.ammonite` |
| [`disableFallback`](#disablefallback) | `false` | Only restore caches whose key matches exactly |
| [`cacheMode`](#cachemode) | | Restrict cache access for this step (`read`, `write`, `write-only`, `none`) |

### `root`

Directory containing the build definition sources (`build.sbt`, `build.mill`, etc.), relative to
the repository root. Defaults to the repository root.

If the sbt or mill build definition files are in a sub-directory, pass the path to this
sub-directory here:

```yaml
- uses: coursier/cache-action@v8
  with:
    root: backend
```

### `path`

Path of the coursier cache.

By default, the coursier cache is assumed to be in the
[default OS-dependent location](https://get-coursier.io/docs/cache.html#default-location).
Set this input to override that. The action then also sets the `COURSIER_CACHE` environment
variable for the subsequent steps, so that you don't have to set it yourself.

### `extraFiles`

Extra files to take into account in the keys of all caches.

Pass either
- a single path or glob as a string,
- multiple paths or globs in a JSON array, encoded in a string.

Globs are processed by [@actions/glob](https://www.npmjs.com/package/@actions/glob). Paths are
relative to the repository root, not to [`root`](#root).

```yaml
- uses: coursier/cache-action@v8
  with:
    extraFiles: '["dependencies.json", "scripts/*.sh"]'
```

Files can also be listed, one path or glob per line, in a `.github/cs-cache-files` file in your
repository. If that file exists, its entries are added to `extraFiles`.

### `extraSbtFiles`

Extra sbt build files, same format as [`extraFiles`](#extrafiles). They are taken into account in
the sbt and coursier cache keys, and finding any of them enables the sbt cache.

### `extraMillFiles`

Extra mill build files, same format as [`extraFiles`](#extrafiles). They are taken into account in
the mill and coursier cache keys, and finding any of them enables the mill cache.

### `ammoniteScripts`

Extra Ammonite scripts, same format as [`extraFiles`](#extrafiles). They are taken into account in
the Ammonite and coursier cache keys, and finding any of them enables the Ammonite cache.

### `extraKey`

Extra value added as is to the keys of all caches. See [How cache keys work](#how-cache-keys-work).

Use it to have separate caches for jobs that would get the same keys otherwise. For values that
don't fit in a cache key, or that you'd rather not show in the logs, use
[`extraHashedContent`](#extrahashedcontent).

### `extraSbtKey`, `extraMillKey`, `extraAmmoniteKey`

Same as [`extraKey`](#extrakey), but only added to the key of the sbt, mill, or Ammonite cache.

### `extraHashedContent`

Extra content to take into account in the keys of all caches. It is hashed along with the build
files, so changing it gives new caches, initialized from the previous ones
(see [How cache keys work](#how-cache-keys-work)).

### `extraSbtHashedContent`, `extraMillHashedContent`, `extraAmmoniteHashedContent`

Same as [`extraHashedContent`](#extrahashedcontent), but only taken into account in the key of the
sbt, mill, or Ammonite cache, and in the key of the coursier cache.

### `job`

Job name, added to the cache keys, so that each job has its own caches. Defaults to the id of the
current job (`${{ github.job }}`). See also [`ignoreJob`](#ignorejob).

### `matrix`

Matrix values, hashed and added to the cache keys, so that each instance of a matrix job
(one per Scala version, JDK, OS, …) has its own caches, and those caches don't collide.
Defaults to the matrix values of the current job (`${{ toJson(matrix) }}`), so that you don't
need to set it in most cases. See also [`ignoreMatrix`](#ignorematrix).

### `ignoreJob`

Default: `false`

Set to `true` to leave the job name out of the cache keys, so that different jobs share their
caches.

### `ignoreMatrix`

Default: `false`

Set to `true` to leave the matrix values out of the cache keys, so that the instances of a matrix
job share their caches.

### `ignoreAmmonite`

Default: `false`

Set to `true` to skip saving and restoring the Ammonite cache, regardless of whether the repository
contains `.sc` scripts. Ammonite scripts aren't taken into account in the coursier cache key either
then.

### `disableFallback`

Default: `false`

Set to `true` to disable falling back to a less specific cache key when there is no exact cache
hit. By default, if no exact cache match is found, the action restores a cache with a more general
key (e.g. from a different job or build configuration, see
[How cache keys work](#how-cache-keys-work)). Disabling this prevents unintended cache sharing
across jobs or matrix instances that have different dependency sets.

### `cacheMode`

Default: empty (use the workflow / job `cache-mode` as is)

Cache access for this step: one of `read`, `write`, `write-only`, or `none`. This can only narrow
the access granted by the workflow or job [`cache-mode`](#cache-access-cache-mode), never widen it.
For example, pass `read` to restore caches without saving them.

## Outputs

| Output | Description |
|--------|-------------|
| `cache-hit-coursier` | `true` if the coursier cache was restored from an exact key match |
| `cache-hit-sbt-ivy2-cache` | `true` if the sbt cache was restored from an exact key match |
| `cache-hit-mill` | `true` if the mill cache was restored from an exact key match |
| `cache-hit-ammonite` | `true` if the Ammonite cache was restored from an exact key match |

Each output is `false` when no cache or only a [fallback](#how-cache-keys-work) one was restored,
and empty when the corresponding cache isn't handled (no sbt files for `cache-hit-sbt-ivy2-cache`,
for example).

### Skipping steps based on cache-hit

Using the `cache-hit-…` outputs, subsequent steps can be skipped when a cache was restored from an
exact key match. Give the action step an `id`, and refer to it in the `if` condition of the steps
to skip:

```yaml
steps:
  - uses: actions/checkout@v7

  - uses: coursier/cache-action@v8
    id: coursier-cache

  - name: Fetch dependencies
    if: steps.coursier-cache.outputs.cache-hit-coursier != 'true'
    run: sbt +update
```

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
      - uses: actions/checkout@v7
      - uses: coursier/cache-action@v8
      - run: sbt test
```

To restrict only this action, and leave other caching steps of the job unaffected, use the
[`cacheMode`](#cachemode) input instead:

```yaml
steps:
  - uses: actions/checkout@v7
  - uses: coursier/cache-action@v8
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
      - uses: actions/checkout@v7
      - uses: coursier/cache-action@v8
        with:
          cacheMode: ${{ github.ref == 'refs/heads/main' && 'write' || 'read' }}
      - run: sbt test
```

On `main`, the caches are restored, then saved if their key changed. In pull requests (`github.ref` is
`refs/pull/<number>/merge` there), the caches of `main` are restored, but nothing is saved. Pull requests whose build
files differ from `main` fall back on the closest cache from `main`, as described in
[How cache keys work](#how-cache-keys-work).

GitHub doesn't document `${{ … }}` expressions as supported in the `cache-mode` key, so getting the same behavior with
it means separate workflows, such as one triggered on `push` to `main` (where the default is `write`) and another one
triggered on `pull_request` that sets `cache-mode: read` at the top level.

## Cache invalidation

To force the caches to be saved again without changing your build files, set the
`COURSIER_CACHE_ACTION_CACHE_VERSION` environment variable in your workflow. Changing its value
changes the keys of all caches, so that they're saved under new keys at the end of the job.

Like for any other key change, the previous caches are still restored as a
[fallback](#how-cache-keys-work) when the job starts. To start from empty caches, also set
[`disableFallback`](#disablefallback) to `true` for one run.

The variable can be set at the workflow level so that it applies to every step:

```yaml
env:
  COURSIER_CACHE_ACTION_CACHE_VERSION: 1   # increment this value to invalidate the caches

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: coursier/cache-action@v8
```

Or it can be scoped to only the `coursier/cache-action` step:

```yaml
steps:
  - uses: actions/checkout@v7
  - uses: coursier/cache-action@v8
    env:
      COURSIER_CACHE_ACTION_CACHE_VERSION: 1   # increment this value to invalidate the caches
```

This is equivalent to passing the version as [`extraHashedContent`](#extrahashedcontent), but more
convenient, as it can be set for the whole workflow (or even as a repository variable or secret)
without touching the individual steps.
