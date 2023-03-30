# bundle-roc-library

A GitHub Action to bundle and release a Roc library.

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
        uses: hasnep/setup-roc@main
        with:
          roc-version: nightly
      - name: Bundle and release the library
        uses: hasnep/bundle-roc-library@main
        with:
          library: path/to/main.roc # Path to the library's entrypoint
          token: ${{ github.token }}
```
