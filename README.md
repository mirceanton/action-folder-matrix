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

| Input            | Description                                                                                       | Required | Default |
| ---------------- | ------------------------------------------------------------------------------------------------- | -------- | ------- |
| `path`           | Path to the directory to scan for subdirectories                                                  | Yes      | `"."`   |
| `include_hidden` | Whether to include hidden directories (starting with .)                                           | No       | `false` |
| `exclude`        | Comma-separated list of directory names to exclude                                                | No       | N/A     |
| `filter`         | Regular expression pattern to filter directory names (only matching directories will be included) | No       | N/A     |
| `metadata_file`  | Path to metadata file within each subdirectory (e.g., `package.json`, `Chart.yaml`)               | No       | N/A     |
| `changed-only`   | Whether to include only directories with changes                                                  | No       | `false` |
| `github-token`   | GitHub token used to get changed files (required when changed-only is true)                       | No       | N/A     |

### Regular Expression Filtering

The `filter` input allows you to include only directories whose names match a regular expression pattern. This is useful
for selecting specific types of directories in complex monorepos.

#### Filter Examples

```yaml
# Include only directories that start with "service-"
- name: Discover Services
  uses: mirceanton/action-folder-matrix@v1
  with:
    path: './packages'
    filter: '^service-.*'

# Include directories that match either "app-" or "lib-" prefix
- name: Discover Apps and Libraries
  uses: mirceanton/action-folder-matrix@v1
  with:
    path: './packages'
    filter: '^(app|lib)-.*'

# Include directories ending with "-api" or "-service"
- name: Discover Backend Services
  uses: mirceanton/action-folder-matrix@v1
  with:
    path: './services'
    filter: '.*(api|service)$'
```

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
          filter: '^service-.*' # Only include service packages

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

### Changed Files Detection

When `changed-only` is set to `true`, the action will only include directories that contain files modified in the
current push or pull request. This requires a GitHub token with repository access.

```yaml
- name: Discover Changed Projects
  uses: mirceanton/action-folder-matrix@v1
  with:
    path: './projects'
    changed-only: true
    github-token: ${{ secrets.GITHUB_TOKEN }}
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

## Combining Multiple Filters

You can combine multiple filtering options for fine-grained control:

```yaml
- name: Discover Filtered Projects
  uses: mirceanton/action-folder-matrix@v1
  with:
    path: './packages'
    include_hidden: false # Exclude hidden directories
    exclude: 'deprecated,old-app' # Exclude specific directories
    filter: '^(service|app)-.*' # Only include service-* and app-* directories
    changed-only: true # Only include directories with changes
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

The filters are applied in this order:

1. Hidden directory check (`include_hidden`)
2. Exclude list (`exclude`)
3. Regular expression filter (`filter`)
4. Changed files check (`changed-only`)

## License

MIT
