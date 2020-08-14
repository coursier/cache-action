# coursier cache action

A GitHub action to save / restore the coursier cache of your build.

## Usage

Add a `coursier/cache-action@v1` step to your YAML workflow, like
```yaml
    steps:
      - uses: actions/checkout@v2
      - uses: coursier/cache-action@v1
```

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
