const core = require('@actions/core');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const github = require('@actions/github');

async function hasChanges(token, dirPath) {
  core.debug(`Checking for changes in directory: ${dirPath}`);

  const octokit = github.getOctokit(token);
  const { context } = github;

  const event = context.eventName;
  core.debug(`Event: ${event}`);
  const owner = context.repo.owner;
  core.debug(`Owner: ${owner}`);
  const repo = context.repo.repo;
  core.debug(`Repo: ${repo}`);

  if (event === 'pull_request') {
    const pull_number = context.payload.pull_request.number;
    const response = await octokit.rest.pulls.listFiles({ owner, repo, pull_number });
    const changedFiles = response.data.map((f) => f.filename);
    return changedFiles.some((file) => file.startsWith(dirPath));
  }

  if (event === 'push') {
    const base = context.payload.before;
    core.debug(`Base commit: ${base}`);
    const head = context.payload.after;
    core.debug(`Head commit: ${head}`);

    const response = await octokit.rest.repos.compareCommits({ owner, repo, base, head });

    const changedFiles = response.data.map((f) => f.filename);
    core.debug(`Changed files: ${JSON.stringify(changedFiles)}`);

    return changedFiles.some((file) => file.startsWith(dirPath));
  }

  core.warning(`Unsupported event type: ${event}`);
  return true;
}

async function run() {
  try {
    const dirPath = core.getInput('path', { required: true });
    const includeHidden = core.getInput('include_hidden') === 'true';
    const excludeInput = core.getInput('exclude');
    const metadataFile = core.getInput('metadata_file');
    const excludeList = excludeInput ? excludeInput.split(',').map((item) => item.trim()) : [];

    core.debug(`getinput value: ${core.getInput('include_hidden')}`);
    core.debug(`getbooleaninput value: ${core.getBooleanInput('include_hidden')}`);

    const changedOnly = core.getInput('changed_only') === 'true';
    const token = core.getInput('github-token');
    if (changedOnly && !token) {
      throw new Error('GitHub token is required when "changed_only" is set to true.');
    }
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

        if (changedOnly) {
          return hasChanges(token, path.join(dirPath, dirent.name));
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
    core.info(`Found subdirectories: ${JSON.stringify(matrixOutput, null, 2)}`);
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
