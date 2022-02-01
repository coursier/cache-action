# coursier cache action

A GitHub action to save / restore the coursier / sbt / mill / Ammonite caches of your build.

## Usage

Add a `coursier/cache-action@v6` step to your YAML workflow, like
```yaml
    steps:
      - uses: actions/checkout@v2
      - uses: coursier/cache-action@v6
```

## Cached directories

### Coursier cache

Always cached.

Add files to take into account in its cache key via [`extraFiles`](#extrafiles).

### `~/.sbt`

Cached when sbt files are found (any of `*.sbt`, `project/**.scala`, `project/**.sbt`, `project/build.properties`).

Add files to take into account in its cache key via [`extraSbtFiles`](#extrasbtfiles).

### `~/.mill`

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

Blobs are accepted (processed by [glob-all](https://www.npmjs.com/package/glob-all)).

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
