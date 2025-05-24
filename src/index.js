const core = require('@actions/core');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { execSync } = require('child_process');

/**
 * Checks if a directory has changes based on the GitHub event type
 * @param {string} dirPath Base directory path
 * @param {string} subDir Subdirectory name
 * @returns {boolean} True if directory has changes, false otherwise
 */
function hasChanges(dirPath, subDir) {
  const fullPath = path.join(dirPath, subDir);
  const relativePath = fullPath.replace(/\\/g, '/');

  try {
    const eventName = process.env.GITHUB_EVENT_NAME;
    let command;

    if (eventName === 'pull_request') {
      // For PRs, compare with the base branch
      const baseRef = process.env.GITHUB_BASE_REF;
      command = `git diff --name-only origin/${baseRef}... -- ${relativePath}`;
    } else {
      // For pushes, check only the current commit
      command = `git diff-tree --no-commit-id --name-only -r HEAD -- ${relativePath}`;
    }

    const output = execSync(command, { encoding: 'utf8' });
    return output.trim().length > 0;
  } catch (error) {
    console.log(`Warning: Error checking changes for ${subDir}: ${error.message}`);
    // If there's an error, we assume there are changes (fail-safe approach)
    return true;
  }
}

async function run() {
  try {
    const dirPath = core.getInput('path', { required: true });
    const includeHidden = core.getInput('include_hidden') === 'true';
    const excludeInput = core.getInput('exclude');
    const metadataFile = core.getInput('metadata_file');
    const filterChanges = core.getInput('filter_changes') === 'true';
    const excludeList = excludeInput ? excludeInput.split(',').map((item) => item.trim()) : [];
    let matrixOutput;

    if (!fs.existsSync(dirPath)) {
      throw new Error(`Directory does not exist: ${dirPath}`);
    }

    const subdirectories = fs
      .readdirSync(dirPath, { withFileTypes: true })
      .filter((dirent) => {
        if (!dirent.isDirectory()) {
          return false;
        }

        if (!includeHidden && dirent.name.startsWith('.')) {
          return false;
        }

        if (excludeList.includes(dirent.name)) {
          return false;
        }

        if (filterChanges) {
          return hasChanges(dirPath, dirent.name);
        }

        return true;
      })
      .map((dirent) => dirent.name);

    if (metadataFile && metadataFile.trim() !== '') {
      const includeEntries = [];

      for (const dir of subdirectories) {
        const entry = { directory: dir };
        const metadataPath = path.join(dirPath, dir, metadataFile);

        if (fs.existsSync(metadataPath)) {
          try {
            const fileContent = fs.readFileSync(metadataPath, 'utf8');
            let metadata;

            switch (path.extname(metadataFile).toLowerCase()) {
              case '.json':
                metadata = JSON.parse(fileContent);
                break;
              case '.yaml':
              case '.yml':
                metadata = yaml.load(fileContent);
                break;
              default:
                console.log(
                  `Warning: Unsupported metadata file format: ${path.extname(metadataFile)}. Skipping metadata for ${dir}.`
                );
                includeEntries.push(entry);
                continue;
            }

            for (const key in metadata) {
              if (key !== 'directory') {
                entry[key] = metadata[key];
              } else {
                console.log(`Warning: 'directory' key found in metadata for ${dir}. It will be ignored.`);
              }
            }
          } catch (error) {
            console.log(`Warning: Failed to parse metadata file for directory ${dir}: ${error.message}`);
          }
        } else {
          console.log(`Warning: Metadata file not found for directory ${dir}`);
        }

        includeEntries.push(entry);
      }

      matrixOutput = { include: includeEntries };
    } else {
      matrixOutput = { directory: subdirectories };
    }

    core.setOutput('matrix', JSON.stringify(matrixOutput));
    console.log(`Found subdirectories: ${JSON.stringify(matrixOutput)}`);
    return matrixOutput;
  } catch (error) {
    core.setFailed(error.message);
    throw error;
  }
}

if (require.main === module) {
  run();
}

module.exports = { run };
