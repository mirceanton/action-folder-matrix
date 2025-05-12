# Folder Matrix Action

A GitHub Action that scans a directory and generates a matrix of subdirectories for parallelizing downstream jobs.
Perfect for monorepos and projects with multiple components.

## Features

- 🔍 Scans specified directories for subdirectories
- 🚀 Generates matrix output for parallel job execution
- 🎯 Configurable inclusion/exclusion of directories
- 👻 Optional hidden directory support
- 📦 Zero runtime dependencies

## Example Usage

```yaml
---
name: Build All Projects
permissions: { contents: read }

on:
  push: {}

jobs:
  discover:
    runs-on: ubuntu-latest
    outputs:
      matrix: ${{ steps.scan.outputs.matrix }}
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Discover Projects
        uses: mirceanton/action-folder-matrix@v1
        id: scan
        with:
          path: './projects'

  build:
    name: 'Building ${{ matrix.directory }}'
    needs: discover
    runs-on: ubuntu-latest
    strategy:
      matrix: ${{ fromJson(needs.discover.outputs.matrix) }}
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Build
        working-directory: ./projects/${{ matrix.directory }}
        run: npm ci && npm run build
```

## Inputs

| Input            | Description                                             | Required | Default |
| ---------------- | ------------------------------------------------------- | -------- | ------- |
| `path`           | Path to the directory to scan for subdirectories        | Yes      | `"."`   |
| `include_hidden` | Whether to include hidden directories (starting with .) | No       | `false` |
| `exclude`        | Comma-separated list of directory names to exclude      | No       | N/A     |

## Outputs

| Output   | Description                                                 |
| -------- | ----------------------------------------------------------- |
| `matrix` | JSON array of subdirectory names for use in matrix strategy |

### Output Format

The action outputs a JSON object that can be used directly in a matrix strategy:

```json
{
  "directory": ["app1", "app2", "lib1", "lib2"]
}
```

## Tips and Tricks

### Filtering Empty Directories

If you want to skip empty directories, you can add a check in your job:

```yaml
---
# yaml-language-server: $schema=https://json.schemastore.org/github-workflow.json
name: Build
permissions: { contents: read }

on:
  workflow_dispatch: {}
  push:
    paths: ['projects/**']

jobs:
  discover-projects:
    runs-on: ubuntu-latest
    outputs:
      projects: ${{ steps.discover.outputs.matrix }}
    steps:
      - name: Checkout
        uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2

      - name: Find Projects
        id: discover
        uses: mirceanton/action-folder-matrix@v1
        with: { path: ./projects }

  build:
    needs: discover-projects
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix: ${{ fromJson(needs.discover-projects.outputs.projects) }}
    steps:
      - name: Check if directory has files
        id: check
        run: |
          if [ -n "$(ls -A projects/${{ matrix.directory }})" ]; then
              echo "has_files=true" >> $GITHUB_OUTPUT
          else
              echo "has_files=false" >> $GITHUB_OUTPUT
          fi

      - name: Build
        if: steps.check.outputs.has_files == 'true'
        working-directory: projects/${{ matrix.directory }}
        run: npm run build
```

### Running Only In Directories Where Changes Were Made

If you want to skip directories in which no changes were pushed (either at commit or PR scope), I recommend checking out
the [`bjw-s-labs/action-changed-files` action](https://github.com/bjw-s-labs/action-changed-files)

```yaml
---
# yaml-language-server: $schema=https://json.schemastore.org/github-workflow.json
name: Helm Lint
permissions: { contents: read }

on:
  workflow_dispatch: {}
  push:
    paths: ['charts/**']

jobs:
  discover-charts:
    runs-on: ubuntu-latest
    outputs:
      charts: ${{ steps.discover.outputs.matrix }}
    steps:
      - name: Checkout
        uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2

      - name: Find Helm Charts
        id: discover
        uses: mirceanton/action-folder-matrix@v1
        with: { path: ./charts }

  helm-lint:
    needs: discover-charts
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix: ${{ fromJson(needs.discover-charts.outputs.charts) }}
    steps:
      - name: Checkout
        uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2

      - name: Get Changed Files
        id: changed-files
        uses: bjw-s-labs/action-changed-files@main # !you should pin this to a specific sha!
        with:
          patterns: './charts/${{ matrix.directory }}/**/*'

      - name: Helm lint
        if: steps.changed-files.outputs.changed_files != '[]'
        working-directory: ./charts/${{ matrix.directory }}
        run: helm lint .
```

### Dynamic Exclusions

You can dynamically set exclusions based on environment:

```yaml
- uses: mirceanton/action-folder-matrix@v1
  with:
    path: './apps'
    exclude: ${{ github.event_name == 'pull_request' && 'prod-app' || '' }}
```

## License

MIT
