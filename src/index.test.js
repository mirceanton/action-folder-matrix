const mockFs = require('mock-fs');
const core = require('@actions/core');
const fs = require('fs');
const path = require('path');
const { run } = require('./index');

// Mock the @actions/core module
jest.mock('@actions/core');

// Save original implementation to restore later
const originalConsoleLog = console.log;

describe('Folder Matrix Action', () => {
  // Setup and teardown for each test
  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Mock console.log to avoid cluttering test output
    console.log = jest.fn();

    // Setup inputs
    core.getInput = jest.fn().mockImplementation((name) => {
      switch (name) {
        case 'path':
          return './test-repo';
        case 'include_hidden':
          return 'false';
        case 'exclude':
          return '';
        case 'metadata_file':
          return '';
        default:
          return '';
      }
    });

    // Setup core.setOutput mock
    core.setOutput = jest.fn();
    core.setFailed = jest.fn();
  });

  afterEach(() => {
    // Restore filesystem
    mockFs.restore();

    // Restore console.log
    console.log = originalConsoleLog;
  });

  // Basic directory scanning tests
  test('should find subdirectories and create matrix output', async () => {
    // Setup mock filesystem
    mockFs({
      'test-repo': {
        dir1: {},
        dir2: {},
        dir3: {},
        'file1.txt': 'content'
      }
    });

    // Execute the function
    await run();

    // Verify setOutput was called with the expected matrix
    expect(core.setOutput).toHaveBeenCalledWith(
      'matrix',
      JSON.stringify({
        directory: ['dir1', 'dir2', 'dir3']
      })
    );
  });

  test('should exclude hidden directories by default', async () => {
    // Setup mock filesystem
    mockFs({
      'test-repo': {
        dir1: {},
        '.hidden': {},
        dir2: {}
      }
    });

    // Execute the function
    await run();

    // Verify setOutput was called with the expected matrix
    expect(core.setOutput).toHaveBeenCalledWith(
      'matrix',
      JSON.stringify({
        directory: ['dir1', 'dir2']
      })
    );
  });

  test('should include hidden directories when include_hidden is true', async () => {
    // Setup inputs with include_hidden = true
    core.getInput = jest.fn().mockImplementation((name) => {
      switch (name) {
        case 'path':
          return './test-repo';
        case 'include_hidden':
          return 'true';
        default:
          return '';
      }
    });

    // Setup mock filesystem
    mockFs({
      'test-repo': {
        dir1: {},
        '.hidden': {},
        dir2: {}
      }
    });

    // Execute the function
    await run();

    // Verify setOutput was called with the expected matrix
    expect(core.setOutput).toHaveBeenCalledWith(
      'matrix',
      JSON.stringify({
        directory: ['.hidden', 'dir1', 'dir2']
      })
    );
  });

  test('should exclude directories specified in exclude parameter', async () => {
    // Setup inputs with exclude = dir2
    core.getInput = jest.fn().mockImplementation((name) => {
      switch (name) {
        case 'path':
          return './test-repo';
        case 'exclude':
          return 'dir2,dir3';
        default:
          return '';
      }
    });

    // Setup mock filesystem
    mockFs({
      'test-repo': {
        dir1: {},
        dir2: {},
        dir3: {},
        dir4: {}
      }
    });

    // Execute the function
    await run();

    // Verify setOutput was called with the expected matrix
    expect(core.setOutput).toHaveBeenCalledWith(
      'matrix',
      JSON.stringify({
        directory: ['dir1', 'dir4']
      })
    );
  });

  test('should handle error when directory does not exist', async () => {
    // Setup inputs with a non-existent directory
    core.getInput = jest.fn().mockImplementation((name) => {
      switch (name) {
        case 'path':
          return './non-existent';
        default:
          return '';
      }
    });

    // Setup minimal mock filesystem
    mockFs({});

    // Execute the function and expect it to throw
    await expect(run()).rejects.toThrow('Directory does not exist: ./non-existent');

    // Verify setFailed was called with the expected error message
    expect(core.setFailed).toHaveBeenCalledWith('Directory does not exist: ./non-existent');
  });

  // Metadata file tests
  test('should read JSON metadata files and include in matrix', async () => {
    // Setup inputs
    core.getInput = jest.fn().mockImplementation((name) => {
      switch (name) {
        case 'path':
          return './test-repo';
        case 'metadata_file':
          return 'package.json';
        default:
          return '';
      }
    });

    // Setup mock filesystem with metadata files
    mockFs({
      'test-repo': {
        project1: {
          'package.json': JSON.stringify({
            name: 'project-one',
            version: '1.0.0',
            description: 'Project One'
          })
        },
        project2: {
          'package.json': JSON.stringify({
            name: 'project-two',
            version: '2.0.0',
            description: 'Project Two'
          })
        },
        project3: {} // No metadata file
      }
    });

    // Execute the function
    await run();

    // Verify setOutput was called with the expected matrix
    expect(core.setOutput).toHaveBeenCalledWith(
      'matrix',
      JSON.stringify({
        include: [
          {
            directory: 'project1',
            name: 'project-one',
            version: '1.0.0',
            description: 'Project One'
          },
          {
            directory: 'project2',
            name: 'project-two',
            version: '2.0.0',
            description: 'Project Two'
          },
          {
            directory: 'project3'
          }
        ]
      })
    );
  });

  test('should read YAML metadata files and include in matrix', async () => {
    // Setup inputs
    core.getInput = jest.fn().mockImplementation((name) => {
      switch (name) {
        case 'path':
          return './test-repo';
        case 'metadata_file':
          return 'Chart.yaml';
        default:
          return '';
      }
    });

    // Setup mock filesystem with YAML metadata files
    mockFs({
      'test-repo': {
        chart1: {
          'Chart.yaml': 'name: chart-one\nversion: 1.0.0\nappVersion: 2.3.4'
        },
        chart2: {
          'Chart.yaml': 'name: chart-two\nversion: 0.5.0\nappVersion: 1.2.3'
        },
        chart3: {} // No metadata file
      }
    });

    // Execute the function
    await run();

    // Verify setOutput was called with the expected matrix
    expect(core.setOutput).toHaveBeenCalledWith(
      'matrix',
      JSON.stringify({
        include: [
          {
            directory: 'chart1',
            name: 'chart-one',
            version: '1.0.0',
            appVersion: '2.3.4'
          },
          {
            directory: 'chart2',
            name: 'chart-two',
            version: '0.5.0',
            appVersion: '1.2.3'
          },
          {
            directory: 'chart3'
          }
        ]
      })
    );
  });

  test('should handle invalid JSON metadata gracefully', async () => {
    // Setup inputs
    core.getInput = jest.fn().mockImplementation((name) => {
      switch (name) {
        case 'path':
          return './test-repo';
        case 'metadata_file':
          return 'package.json';
        default:
          return '';
      }
    });

    // Setup mock filesystem with invalid JSON
    mockFs({
      'test-repo': {
        project1: {
          'package.json': '{ "name": "project-one", "version": "1.0.0" }'
        },
        project2: {
          'package.json': '{ invalid json }'
        }
      }
    });

    // Execute the function
    await run();

    // Should still include both directories but with metadata only for the valid one
    expect(core.setOutput).toHaveBeenCalledWith(
      'matrix',
      JSON.stringify({
        include: [
          {
            directory: 'project1',
            name: 'project-one',
            version: '1.0.0'
          },
          {
            directory: 'project2'
          }
        ]
      })
    );
  });

  test('should handle invalid YAML metadata gracefully', async () => {
    // Setup inputs
    core.getInput = jest.fn().mockImplementation((name) => {
      switch (name) {
        case 'path':
          return './test-repo';
        case 'metadata_file':
          return 'Chart.yaml';
        default:
          return '';
      }
    });

    // Setup mock filesystem with invalid YAML
    mockFs({
      'test-repo': {
        chart1: {
          'Chart.yaml': 'name: chart-one\nversion: 1.0.0'
        },
        chart2: {
          'Chart.yaml': 'invalid: : yaml'
        }
      }
    });

    // Execute the function
    await run();

    // Should still include both directories but with metadata only for the valid one
    expect(core.setOutput).toHaveBeenCalledWith('matrix', expect.stringMatching(/chart1.*chart-one.*chart2/s));
  });

  test('should not override directory field from metadata', async () => {
    // Setup inputs
    core.getInput = jest.fn().mockImplementation((name) => {
      switch (name) {
        case 'path':
          return './test-repo';
        case 'metadata_file':
          return 'metadata.json';
        default:
          return '';
      }
    });

    // Setup mock filesystem with metadata that includes directory field
    mockFs({
      'test-repo': {
        project1: {
          'metadata.json': JSON.stringify({
            name: 'project-one',
            directory: 'should-not-override'
          })
        }
      }
    });

    // Execute the function
    await run();

    // The directory field should not be overridden by metadata
    expect(core.setOutput).toHaveBeenCalledWith(
      'matrix',
      JSON.stringify({
        include: [
          {
            directory: 'project1',
            name: 'project-one'
          }
        ]
      })
    );
  });

  test('should handle unsupported metadata file formats', async () => {
    // Setup inputs
    core.getInput = jest.fn().mockImplementation((name) => {
      switch (name) {
        case 'path':
          return './test-repo';
        case 'metadata_file':
          return 'metadata.txt';
        default:
          return '';
      }
    });

    // Setup mock filesystem with unsupported format
    mockFs({
      'test-repo': {
        project1: {
          'metadata.txt': 'name=project-one\nversion=1.0.0'
        }
      }
    });

    // Execute the function
    await run();

    // Should include the directory but not attempt to parse the unsupported format
    expect(core.setOutput).toHaveBeenCalledWith(
      'matrix',
      JSON.stringify({
        include: [
          {
            directory: 'project1'
          }
        ]
      })
    );
  });

  // Filter Changes tests
  test('should filter directories based on changes for push events', async () => {
    // Save original env and process.execSync
    const originalEnv = process.env;
    const originalExecSync = require('child_process').execSync;

    // Mock environment variables
    process.env = {
      ...process.env,
      GITHUB_EVENT_NAME: 'push'
    };

    // Mock execSync to simulate git commands
    const execSyncMock = jest.fn().mockImplementation((command) => {
      if (command.includes('dir1')) {
        return 'file1.txt\nfile2.txt'; // Changes detected in dir1
      } else if (command.includes('dir2')) {
        return ''; // No changes in dir2
      } else if (command.includes('dir3')) {
        return 'file3.txt'; // Changes detected in dir3
      }
      return '';
    });

    require('child_process').execSync = execSyncMock;

    // Setup inputs
    core.getInput = jest.fn().mockImplementation((name) => {
      switch (name) {
        case 'path':
          return './test-repo';
        case 'filter_changes':
          return 'true';
        default:
          return '';
      }
    });

    // Setup mock filesystem
    mockFs({
      'test-repo': {
        dir1: {},
        dir2: {},
        dir3: {}
      }
    });

    // Execute the function
    await run();

    // Verify setOutput was called with only directories with changes
    expect(core.setOutput).toHaveBeenCalledWith(
      'matrix',
      JSON.stringify({
        directory: ['dir1', 'dir3']
      })
    );

    // Restore original implementations
    process.env = originalEnv;
    require('child_process').execSync = originalExecSync;
  });

  test('should filter directories based on changes for PR events', async () => {
    // Save original env and process.execSync
    const originalEnv = process.env;
    const originalExecSync = require('child_process').execSync;

    // Mock environment variables
    process.env = {
      ...process.env,
      GITHUB_EVENT_NAME: 'pull_request',
      GITHUB_BASE_REF: 'main'
    };

    // Mock execSync to simulate git commands
    const execSyncMock = jest.fn().mockImplementation((command) => {
      if (command.includes('dir1')) {
        return 'file1.txt\nfile2.txt'; // Changes detected in dir1
      } else {
        return ''; // No changes in other dirs
      }
      return '';
    });

    require('child_process').execSync = execSyncMock;

    // Setup inputs
    core.getInput = jest.fn().mockImplementation((name) => {
      switch (name) {
        case 'path':
          return './test-repo';
        case 'filter_changes':
          return 'true';
        default:
          return '';
      }
    });

    // Setup mock filesystem
    mockFs({
      'test-repo': {
        dir1: {},
        dir2: {},
        dir3: {}
      }
    });

    // Execute the function
    await run();

    // Verify setOutput was called with only directories with changes
    expect(core.setOutput).toHaveBeenCalledWith(
      'matrix',
      JSON.stringify({
        directory: ['dir1']
      })
    );

    // Restore original implementations
    process.env = originalEnv;
    require('child_process').execSync = originalExecSync;
  });

  test('should handle errors in git commands gracefully', async () => {
    // Save original env and process.execSync
    const originalEnv = process.env;
    const originalExecSync = require('child_process').execSync;

    // Mock environment variables
    process.env = {
      ...process.env,
      GITHUB_EVENT_NAME: 'push'
    };

    // Mock execSync to throw error
    const execSyncMock = jest.fn().mockImplementation((command) => {
      throw new Error('Git command failed');
    });

    require('child_process').execSync = execSyncMock;

    // Setup inputs
    core.getInput = jest.fn().mockImplementation((name) => {
      switch (name) {
        case 'path':
          return './test-repo';
        case 'filter_changes':
          return 'true';
        default:
          return '';
      }
    });

    // Setup mock filesystem
    mockFs({
      'test-repo': {
        dir1: {},
        dir2: {}
      }
    });

    // Execute the function
    await run();

    // Verify setOutput was called with all directories (fail-safe approach)
    expect(core.setOutput).toHaveBeenCalledWith(
      'matrix',
      JSON.stringify({
        directory: ['dir1', 'dir2']
      })
    );

    // Restore original implementations
    process.env = originalEnv;
    require('child_process').execSync = originalExecSync;
  });
});
