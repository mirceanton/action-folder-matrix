const core = require('@actions/core');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const github = require('@actions/github');

async function getChangedFiles(octokit, context) {
  const { owner, repo } = context.repo;
  let changedFiles = [];

  if (context.eventName === 'push') {
    const commitSha = context.sha;

    try {
      const { data: commit } = await octokit.rest.repos.getCommit({
        owner,
        repo,
        ref: commitSha
      });

      changedFiles = commit.files.map((file) => file.filename);
    } catch (error) {
      console.log(`Error getting commit details: ${error.message}`);
    }
  } else if (context.eventName === 'pull_request' || context.eventName === 'pull_request_target') {
    const pullNumber = context.payload.pull_request.number;

    try {
      const files = await octokit.paginate(octokit.rest.pulls.listFiles, {
        owner,
        repo,
        pull_number: pullNumber,
        per_page: 100
      });

      changedFiles = files.map((file) => file.filename);
    } catch (error) {
      console.log(`Error getting PR files: ${error.message}`);
    }
  }

  console.log(`Found ${changedFiles.length} changed files`);
  return changedFiles;
}

function directoryHasChanges(basePath, dirName, changedFiles) {
  if (!changedFiles || changedFiles.length === 0) {
    return false;
  }

  const dirPath = path.normalize(path.join(basePath, dirName));
  const dirPathWithSep = dirPath + path.sep;

  return changedFiles.some((file) => {
    const normalizedFile = path.normalize(file);
    return (
      normalizedFile === dirPath || // The directory itself changed
      normalizedFile.startsWith(dirPathWithSep) // A file within the directory changed
    );
  });
}

async function run() {
  try {
    const dirPath = core.getInput('path', { required: true });
    const includeHidden = core.getInput('include_hidden') === 'true';
    const excludeInput = core.getInput('exclude');
    const metadataFile = core.getInput('metadata_file');
    const changedOnly = core.getInput('changed-only') === 'true';
    const excludeList = excludeInput ? excludeInput.split(',').map((item) => item.trim()) : [];
    let matrixOutput;

    if (!fs.existsSync(dirPath)) {
      throw new Error(`Directory does not exist: ${dirPath}`);
    }

    let changedFiles = [];
    if (changedOnly) {
      const token = process.env.GITHUB_TOKEN || core.getInput('github-token');
      if (!token) {
        throw new Error('GITHUB_TOKEN is required when changed-only is set to true');
      }

      const octokit = github.getOctokit(token);
      changedFiles = await getChangedFiles(octokit, github.context);
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

        if (changedOnly && !directoryHasChanges(dirPath, dirent.name, changedFiles)) {
          return false;
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
