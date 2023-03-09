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
      # Used to upload the bundled library
      contents: write
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
          # Path to the folder containing the library's main.roc
          library-path: path/to/src
          token: ${{ github.token }}
```
