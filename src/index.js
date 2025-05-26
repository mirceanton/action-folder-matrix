const core = require('@actions/core');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { execSync } = require('child_process');

async function getChangedFiles(token) {
  const octokit = github.getOctokit(token);
  const { context } = github;
  const event = context.eventName;
  const owner = context.repo.owner;
  const repo = context.repo.repo;

  if (event === 'pull_request') {
    const pull_number = context.payload.pull_request.number;
    const response = await octokit.rest.pulls.listFiles({ owner, repo, pull_number });
    return response.data.map((f) => f.filename);
  }

  if (event === 'push') {
    const base = context.payload.before;
    const head = context.payload.after;
    const response = await octokit.rest.repos.compareCommits({ owner, repo, base, head });
    return response.data.map((f) => f.filename);
  }

  core.warning(`Unsupported event type: ${event}`);
  return [];
}

async function run() {
  try {
    const dirPath = core.getInput('path', { required: true });
    const includeHidden = core.getInput('include_hidden') === 'true';
    const excludeDirs = core.getMultilineInput('exclude') || [];
    const metadataFile = core.getInput('metadata_file');
    const changedOnly = core.getBooleanInput('changed_only');
    let matrixOutput;

    if (!fs.existsSync(dirPath)) {
      throw new Error(`Directory does not exist: ${dirPath}`);
    }

    const subdirectories = fs
      .readdirSync(rootDir, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name)
      .filter((name) => includeHidden || !name.startsWith('.'))
      .filter((name) => !excludeDirs.includes(name));

    let filteredDirs = [];
    if (changedOnly) {
      const changedFiles = await getChangedFiles(githubToken);
      for (const dir of subdirectories) {
        if (changedFiles.some((file) => file.startsWith(`${dir}/`))) {
          filteredDirs.push(dir);
        }
      }
    } else {
      filteredDirs = subdirectories;
    }

    if (metadataFile && metadataFile.trim() !== '') {
      const includeEntries = [];

      for (const dir of filteredDirs) {
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
      matrixOutput = { directory: filteredDirs };
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
