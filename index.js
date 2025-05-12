const core = require('@actions/core');
const fs = require('fs');

try {
  // Get inputs
  const dirPath = core.getInput('path', { required: true });
  const includeHidden = core.getInput('include_hidden') === 'true';
  const excludeInput = core.getInput('exclude');
  const excludeList = excludeInput ? excludeInput.split(',').map(item => item.trim()) : [];

  // Ensure the directory exists
  if (!fs.existsSync(dirPath)) {
    throw new Error(`Directory does not exist: ${dirPath}`);
  }

  // Get subdirectories
  const subdirectories = fs.readdirSync(dirPath, { withFileTypes: true })
    .filter(dirent => {
      // Only include directories
      if (!dirent.isDirectory()) return false;
      
      // Filter hidden directories if not included
      if (!includeHidden && dirent.name.startsWith('.')) return false;
      
      // Filter excluded directories
      if (excludeList.includes(dirent.name)) return false;
      
      return true;
    })
    .map(dirent => dirent.name);

  // Set output for GitHub Actions
  const matrixOutput = {
    directory: subdirectories
  };
  core.setOutput('matrix', JSON.stringify(matrixOutput));
  
  // Log the result
  console.log(`Found subdirectories: ${JSON.stringify(matrixOutput)}`);
  
} catch (error) {
  core.setFailed(error.message);
}
