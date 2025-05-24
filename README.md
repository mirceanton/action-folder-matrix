# Folder Matrix Action

A GitHub Action that scans a directory and generates a matrix of subdirectories for parallelizing downstream jobs.  
Perfect for monorepos and projects with multiple components.

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

| Input            | Description                                                                         | Required | Default |
| ---------------- | ----------------------------------------------------------------------------------- | -------- | ------- |
| `path`           | Path to the directory to scan for subdirectories                                    | Yes      | `"."`   |
| `include_hidden` | Whether to include hidden directories (starting with .)                             | No       | `false` |
| `exclude`        | Comma-separated list of directory names to exclude                                  | No       | N/A     |
| `metadata_file`  | Path to metadata file within each subdirectory (e.g., `package.json`, `Chart.yaml`) | No       | N/A     |

### Metadata Files

You can specify a metadata file to be read from each subdirectory with the `metadata_file` input parameter. The contents
of this file will be included in the matrix output, allowing you to use values like version, name, or other parameters
in your downstream jobs.

Supported formats:

- JSON (`.json`)
- YAML (`.yaml` or `.yml`)

#### Example with Metadata Files

For a monorepo with Node.js packages, you could use:

```yaml
jobs:
  discover:
    runs-on: ubuntu-latest
    steps:
      - name: Discover Projects with Metadata
        uses: mirceanton/action-folder-matrix@v1
        id: scan
        with:
          path: './packages'
          metadata_file: 'package.json'

  build:
    name: 'Building ${{ matrix.name }} v${{ matrix.version }}'
    needs: discover
    runs-on: ubuntu-latest
    strategy:
      matrix: ${{ fromJson(needs.discover.outputs.matrix) }}
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Build and Publish
        working-directory: ./packages/${{ matrix.directory }}
        run: |
          echo "Building ${{ matrix.name }} version ${{ matrix.version }}"
          npm ci && npm run build
          npm publish --tag=${{ matrix.version }}
```

## Outputs

| Output   | Description                                                 |
| -------- | ----------------------------------------------------------- |
| `matrix` | JSON array of subdirectory names for use in matrix strategy |

### Output Format

The action always outputs a JSON object that can be directly used with a matrix strategy in downstream jobs:

- When not using metadata files (default behavior):

```json
{
  "directory": ["app1", "app2", "lib1", "lib2"]
}
```

- When using metadata files (with the `metadata_file` input):

```json
{
  "include": [
    {
      "directory": "app1",
      "name": "application-one",
      "version": "1.0.0"
    },
    {
      "directory": "app2",
      "name": "application-two",
      "version": "2.3.0"
    }
  ]
}
```

## License

MIT
