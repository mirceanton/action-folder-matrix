const core = require('@actions/core');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const github = require('@actions/github');

async function getChangedFiles(octokit, context) {
  const { owner, repo } = context.repo;
  let changedFiles = [];

  core.debug(`Getting changed files for ${context.eventName} event`);

  if (context.eventName === 'push') {
    const commitSha = context.sha;
    core.debug(`Commit SHA: ${commitSha}`);

    try {
      core.debug(`Fetching changed files from commit ${commitSha}`);
      const { data: commit } = await octokit.rest.repos.getCommit({
        owner,
        repo,
        ref: commitSha
      });

      changedFiles = commit.files.map((file) => file.filename);
      core.debug(`Changed files in commit: ${JSON.stringify(changedFiles)}`);
    } catch (error) {
      core.warning(`Error getting commit details: ${error.message}`);
    }
  } else if (context.eventName === 'pull_request' || context.eventName === 'pull_request_target') {
    const pullNumber = context.payload.pull_request.number;
    core.debug(`Pull request number: ${pullNumber}`);

    try {
      core.debug(`Fetching changed files from PR #${pullNumber}`);
      const files = await octokit.paginate(octokit.rest.pulls.listFiles, {
        owner,
        repo,
        pull_number: pullNumber,
        per_page: 100
      });

      changedFiles = files.map((file) => file.filename);
      core.debug(`Changed files in PR: ${JSON.stringify(changedFiles)}`);
    } catch (error) {
      core.warning(`Error getting PR files: ${error.message}`);
    }
  } else {
    core.warning(`Unsupported event type: ${context.eventName}. No changed files will be considered.`);
  }

  core.debug(`Found ${changedFiles.length} changed files`);
  return changedFiles;
}

function directoryHasChanges(basePath, dirName, changedFiles) {
  if (!changedFiles || changedFiles.length === 0) {
    core.debug(`No changed files provided, directory ${dirName} will be excluded`);
    return false;
  }

  const dirPath = path.normalize(path.join(basePath, dirName));
  const dirPathWithSep = dirPath + path.sep;
  core.debug(`Checking if directory ${dirPath} has changes`);

  const hasChanges = changedFiles.some((file) => {
    const normalizedFile = path.normalize(file);
    const isInDir = normalizedFile === dirPath || normalizedFile.startsWith(dirPathWithSep);
    if (isInDir) {
      core.debug(`Found change in directory ${dirName}: ${normalizedFile}`);
    }
    return isInDir;
  });

  if (!hasChanges) {
    core.debug(`No changes found in directory ${dirName}`);
  }

  return hasChanges;
}

async function run() {
  try {
    const dirPath = core.getInput('path', { required: true });
    const includeHidden = core.getInput('include_hidden') === 'true';
    const excludeInput = core.getInput('exclude');
    const filterInput = core.getInput('filter');
    const metadataFile = core.getInput('metadata_file');
    const changedOnly = core.getInput('changed-only') === 'true';
    const excludeList = excludeInput ? excludeInput.split(',').map((item) => item.trim()) : [];
    let matrixOutput;

    // Validate and compile regex filter if provided
    let filterRegex = null;
    if (filterInput && filterInput.trim() !== '') {
      try {
        filterRegex = new RegExp(filterInput.trim());
        core.debug(`Compiled regex filter: ${filterInput.trim()}`);
      } catch (error) {
        const errorMsg = `Invalid regex pattern in filter: ${filterInput.trim()}. Error: ${error.message}`;
        core.error(errorMsg);
        throw new Error(errorMsg);
      }
    }

    core.info(`Configuration: {`);
    core.info(`  path: ${dirPath}`);
    core.info(`  include_hidden: ${includeHidden}`);
    core.info(`  exclude: ${excludeList.join(', ') || 'none'}`);
    core.info(`  filter: ${filterInput || 'none'}`);
    core.info(`  metadata_file: ${metadataFile || 'none'}`);
    core.info(`  changed-only: ${changedOnly}`);
    core.info(`}`);

    if (!fs.existsSync(dirPath)) {
      const errorMsg = `Directory does not exist: ${dirPath}`;
      core.error(errorMsg);
      throw new Error(errorMsg);
    }

    let changedFiles = [];
    if (changedOnly) {
      core.debug('Changed-only mode enabled, fetching changed files...');
      const token = process.env.GITHUB_TOKEN || core.getInput('github-token');
      if (!token) {
        const errorMsg = 'GITHUB_TOKEN is required when changed-only is set to true';
        core.error(errorMsg);
        throw new Error(errorMsg);
      }

      const octokit = github.getOctokit(token);
      changedFiles = await getChangedFiles(octokit, github.context);

      if (changedFiles.length === 0) {
        core.warning('No changed files were found. All directories will be excluded when using changed-only mode.');
      }
    }

    core.info(`Scanning directory ${dirPath} for subdirectories`);
    const allEntries = fs.readdirSync(dirPath, { withFileTypes: true });
    core.info(`Found ${allEntries.length} entries in directory`);

    const subdirectories = allEntries
      .filter((dirent) => {
        if (!dirent.isDirectory()) {
          core.info(`Skipping ${dirent.name}: not a directory`);
          return false;
        }

        if (!includeHidden && dirent.name.startsWith('.')) {
          core.info(`Skipping ${dirent.name}: hidden directory`);
          return false;
        }

        if (excludeList.includes(dirent.name)) {
          core.info(`Skipping ${dirent.name}: excluded by exclude list`);
          return false;
        }

        if (filterRegex && !filterRegex.test(dirent.name)) {
          core.info(`Skipping ${dirent.name}: does not match filter pattern`);
          return false;
        }

        if (changedOnly) {
          const hasChanges = directoryHasChanges(dirPath, dirent.name, changedFiles);
          if (!hasChanges) {
            core.info(`Skipping ${dirent.name}: no changes detected`);
            return false;
          } else {
            core.info(`Including ${dirent.name}: changes detected`);
          }
        }

        return true;
      })
      .map((dirent) => dirent.name);

    core.debug(`Found ${subdirectories.length} subdirectories after filtering`);

    if (metadataFile && metadataFile.trim() !== '') {
      core.debug(`Reading metadata from ${metadataFile} in each subdirectory`);
      const includeEntries = [];

      for (const dir of subdirectories) {
        const entry = { directory: dir };
        const metadataPath = path.join(dirPath, dir, metadataFile);
        core.debug(`Checking for metadata file at ${metadataPath}`);

        if (fs.existsSync(metadataPath)) {
          try {
            const fileContent = fs.readFileSync(metadataPath, 'utf8');
            let metadata;
            const fileExt = path.extname(metadataFile).toLowerCase();
            core.debug(`Parsing metadata file with extension ${fileExt}`);

            switch (fileExt) {
              case '.json':
                metadata = JSON.parse(fileContent);
                break;
              case '.yaml':
              case '.yml':
                metadata = yaml.load(fileContent);
                break;
              default:
                core.warning(`Unsupported metadata file format: ${fileExt}. Skipping metadata for ${dir}.`);
                includeEntries.push(entry);
                continue;
            }

            for (const key in metadata) {
              if (key !== 'directory') {
                entry[key] = metadata[key];
              } else {
                core.warning(`'directory' key found in metadata for ${dir}. It will be ignored.`);
              }
            }
            core.debug(`Successfully parsed metadata for ${dir}`);
          } catch (error) {
            core.warning(`Failed to parse metadata file for directory ${dir}: ${error.message}`);
          }
        } else {
          core.warning(`Metadata file not found for directory ${dir}: ${metadataPath}`);
        }

        includeEntries.push(entry);
      }

      matrixOutput = { include: includeEntries };
      core.debug(`Created matrix with metadata: ${JSON.stringify(matrixOutput)}`);
    } else {
      matrixOutput = { directory: subdirectories };
      core.debug(`Created simple matrix: ${JSON.stringify(matrixOutput)}`);
    }

    core.setOutput('matrix', JSON.stringify(matrixOutput));

    if (subdirectories.length === 0) {
      if (changedOnly) {
        core.warning('No directories with changes were found. Matrix will be empty.');
      } else {
        core.warning('No directories were found after filtering. Matrix will be empty.');
      }
    } else {
      core.info(`Successfully created matrix with ${subdirectories.length} directories`);
    }

    return matrixOutput;
  } catch (error) {
    core.error(`Action failed: ${error.message}`);
    core.setFailed(error.message);
    throw error;
  }
}

if (require.main === module) {
  run();
}

module.exports = { run };
