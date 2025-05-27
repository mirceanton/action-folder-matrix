const mockFs = require('mock-fs');
const core = require('@actions/core');
const fs = require('fs');
const path = require('path');
const github = require('@actions/github');
const { run } = require('./index');

// Mock the @actions/core and @actions/github modules
jest.mock('@actions/core');
jest.mock('@actions/github');

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
        case 'changed-only':
          return 'false';
        case 'github-token':
          return 'mock-token';
        default:
          return '';
      }
    });

    // Setup core.setOutput mock
    core.setOutput = jest.fn();
    core.setFailed = jest.fn();

    // Mock GitHub context
    github.context = {
      eventName: 'push',
      repo: {
        owner: 'testowner',
        repo: 'testrepo'
      },
      sha: 'abc123',
      payload: {
        pull_request: {
          number: 123
        }
      }
    };

    // Mock Octokit
    const mockOctokit = {
      rest: {
        repos: {
          getCommit: jest.fn().mockResolvedValue({
            data: {
              files: []
            }
          })
        },
        pulls: {
          listFiles: jest.fn().mockResolvedValue({
            data: []
          })
        }
      },
      paginate: jest.fn().mockImplementation(async (method) => {
        return [];
      })
    };
    github.getOctokit = jest.fn().mockReturnValue(mockOctokit);

    // Setup process.env
    process.env.GITHUB_TOKEN = 'mock-env-token';
  });

  afterEach(() => {
    // Restore filesystem
    mockFs.restore();

    // Restore console.log
    console.log = originalConsoleLog;

    // Clear environment variables
    delete process.env.GITHUB_TOKEN;
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

  // New tests for changed-only functionality
  test('should include all directories when changed-only is false', async () => {
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

    // Verify setOutput was called with all directories
    expect(core.setOutput).toHaveBeenCalledWith(
      'matrix',
      JSON.stringify({
        directory: ['dir1', 'dir2', 'dir3']
      })
    );
  });

  test('should throw error when changed-only is true but no GitHub token is provided', async () => {
    // Remove token from environment and input
    delete process.env.GITHUB_TOKEN;
    core.getInput = jest.fn().mockImplementation((name) => {
      switch (name) {
        case 'path':
          return './test-repo';
        case 'changed-only':
          return 'true';
        case 'github-token':
          return ''; // No token
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

    // Execute the function and expect it to throw
    await expect(run()).rejects.toThrow('GITHUB_TOKEN is required when changed-only is set to true');
    expect(core.setFailed).toHaveBeenCalledWith('GITHUB_TOKEN is required when changed-only is set to true');
  });

  test('should filter directories based on changed files for push event', async () => {
    // Setup inputs for changed-only
    core.getInput = jest.fn().mockImplementation((name) => {
      switch (name) {
        case 'path':
          return './test-repo';
        case 'changed-only':
          return 'true';
        default:
          return '';
      }
    });

    // Setup mock filesystem
    mockFs({
      'test-repo': {
        dir1: {
          'file1.txt': 'content'
        },
        dir2: {
          'file2.txt': 'content'
        },
        dir3: {
          'file3.txt': 'content'
        }
      }
    });

    // Mock changed files from GitHub API
    const mockOctokit = {
      rest: {
        repos: {
          getCommit: jest.fn().mockResolvedValue({
            data: {
              files: [{ filename: 'test-repo/dir1/file1.txt' }, { filename: 'test-repo/dir3/subdir/file.txt' }]
            }
          })
        }
      }
    };
    github.getOctokit = jest.fn().mockReturnValue(mockOctokit);

    // Execute the function
    await run();

    // Should only include directories with changes
    expect(core.setOutput).toHaveBeenCalledWith(
      'matrix',
      JSON.stringify({
        directory: ['dir1', 'dir3']
      })
    );
  });

  test('should filter directories based on changed files for pull request event', async () => {
    // Setup inputs for changed-only
    core.getInput = jest.fn().mockImplementation((name) => {
      switch (name) {
        case 'path':
          return './test-repo';
        case 'changed-only':
          return 'true';
        default:
          return '';
      }
    });

    // Change context to pull_request
    github.context.eventName = 'pull_request';

    // Setup mock filesystem
    mockFs({
      'test-repo': {
        dir1: {},
        dir2: {},
        dir3: {}
      }
    });

    // Mock changed files from GitHub API for PR
    const mockOctokit = {
      rest: {
        pulls: {
          listFiles: jest.fn().mockResolvedValue({
            data: [{ filename: 'test-repo/dir2/file2.txt' }]
          })
        }
      },
      paginate: jest.fn().mockImplementation(async (method) => {
        return [{ filename: 'test-repo/dir2/file2.txt' }];
      })
    };
    github.getOctokit = jest.fn().mockReturnValue(mockOctokit);

    // Execute the function
    await run();

    // Should only include directories with changes
    expect(core.setOutput).toHaveBeenCalledWith(
      'matrix',
      JSON.stringify({
        directory: ['dir2']
      })
    );
  });

  test('should handle empty changed files result', async () => {
    // Setup inputs for changed-only
    core.getInput = jest.fn().mockImplementation((name) => {
      switch (name) {
        case 'path':
          return './test-repo';
        case 'changed-only':
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

    // Mock empty changed files from GitHub API
    const mockOctokit = {
      rest: {
        repos: {
          getCommit: jest.fn().mockResolvedValue({
            data: {
              files: []
            }
          })
        }
      }
    };
    github.getOctokit = jest.fn().mockReturnValue(mockOctokit);

    // Execute the function
    await run();

    // When no changed files are found, should return an empty matrix
    expect(core.setOutput).toHaveBeenCalledWith(
      'matrix',
      JSON.stringify({
        directory: []
      })
    );
  });

  test('should handle API errors gracefully', async () => {
    // Setup inputs for changed-only
    core.getInput = jest.fn().mockImplementation((name) => {
      switch (name) {
        case 'path':
          return './test-repo';
        case 'changed-only':
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

    // Mock API error
    const mockOctokit = {
      rest: {
        repos: {
          getCommit: jest.fn().mockRejectedValue(new Error('API error'))
        }
      }
    };
    github.getOctokit = jest.fn().mockReturnValue(mockOctokit);

    // Execute the function
    await run();

    // Should include no directories since the API call failed and no files were found
    expect(core.setOutput).toHaveBeenCalledWith(
      'matrix',
      JSON.stringify({
        directory: []
      })
    );
  });

  test('should include changed directories with metadata files', async () => {
    // Setup inputs
    core.getInput = jest.fn().mockImplementation((name) => {
      switch (name) {
        case 'path':
          return './test-repo';
        case 'metadata_file':
          return 'package.json';
        case 'changed-only':
          return 'true';
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
            version: '1.0.0'
          })
        },
        project2: {
          'package.json': JSON.stringify({
            name: 'project-two',
            version: '2.0.0'
          })
        },
        project3: {
          'package.json': JSON.stringify({
            name: 'project-three',
            version: '3.0.0'
          })
        }
      }
    });

    // Mock changed files from GitHub API
    const mockOctokit = {
      rest: {
        repos: {
          getCommit: jest.fn().mockResolvedValue({
            data: {
              files: [{ filename: 'test-repo/project1/src/file.js' }, { filename: 'test-repo/project3/package.json' }]
            }
          })
        }
      }
    };
    github.getOctokit = jest.fn().mockReturnValue(mockOctokit);

    // Execute the function
    await run();

    // Should include only changed directories with their metadata
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
            directory: 'project3',
            name: 'project-three',
            version: '3.0.0'
          }
        ]
      })
    );
  });
});
