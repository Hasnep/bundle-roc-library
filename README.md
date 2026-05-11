# bundle-roc-library

A GitHub Action to bundle and release a Roc library.

The action works with both the legacy Roc compiler (which exposes
`roc build --bundle`) and the new Roc compiler (which exposes `roc bundle`).
The CLI is autodetected at runtime by probing for the `roc bundle`
subcommand — no configuration is required.

## Inputs

- `library` (required)
  - Path to the library's entrypoint file.
- `roc-path` (optional)
  - Path to the Roc executable. Defaults to `roc`.
- `bundle-type` (optional)
  - Legacy CLI only. One of `.tar`, `.tar.gz`, `.tar.br`. Ignored with a warning on the new CLI, which always produces `.tar.zst`. Defaults to `.tar.br`.
- `compression` (optional)
  - New CLI only. zstd compression level (1–22). Ignored with a warning on the legacy CLI. If unset, the compiler's default is used.
- `release` (optional)
  - Whether to upload the bundle to the repository's releases. Defaults to `true` on release events, otherwise `false`.
- `tag` (optional)
  - Tag of the release to upload to. Defaults to the current Git tag.
- `token` (optional)
  - GitHub token used to upload the release asset. Defaults to the token provided by GitHub Actions.

## Outputs

- `bundle-path`
  - The absolute path to the bundled library.

## Usage

```yaml
name: Example workflow

on:
  # Run when a release is published
  release:
    types:
      - published

jobs:
  bundle-and-release:
    name: Bundle and release library
    runs-on: ubuntu-latest
    permissions:
      contents: write # Used to upload the bundled library
    steps:
      - name: Check out the repository
        uses: actions/checkout@v3
      - name: Install Roc
        uses: roc-lang/setup-roc@main
        with:
          version: nightly-new-compiler # or e.g. alpha4-rolling for the legacy compiler
      - name: Bundle and release the library
        uses: hasnep/bundle-roc-library@main
        with:
          library: path/to/main.roc # Path to the library's entrypoint
          token: ${{ github.token }}
```
