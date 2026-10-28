'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFile, exec } = require('node:child_process');

let shell = null;
try {
  const electron = require('electron');
  if (electron && typeof electron === 'object') {
    shell = electron.shell;
  }
} catch {}

const IGNORED_DIRS = new Set([
  'node_modules', '.git', '.cache', 'AppData', 'Local Settings',
  'dist', 'build', 'out', 'bin', 'obj', 'vendor', '.vscode', '.idea',
  'System Volume Information', '$Recycle.Bin'
]);

let indexedRepos = [];
let isScanning = false;
let lastScanTime = 0;

/**
 * Parses content of .git/HEAD file into branch or detached commit SHA.
 */
function parseGitHead(content) {
  const str = String(content || '').trim();
  if (!str) return { branch: 'unknown', detached: false };

  const refMatch = str.match(/^ref:\s*refs\/heads\/(.+)$/);
  if (refMatch) {
    return { branch: refMatch[1], detached: false };
  }

  if (/^[0-9a-fA-F]{40}$/.test(str)) {
    return { branch: str.slice(0, 8), detached: true, commit: str };
  }

  return { branch: 'unknown', detached: false };
}

/**
 * Parses git status --porcelain output into dirty flag, count, and file list.
 */
function parseGitStatus(porcelain) {
  const lines = String(porcelain || '').split(/\r?\n/).filter((l) => l.trim().length > 0);
  return {
    dirty: lines.length > 0,
    dirtyCount: lines.length,
    files: lines.slice(0, 10).map((l) => l.slice(3).trim())
  };
}

/**
 * Returns action descriptors for a repository path.
 */
function getActions(repoPath) {
  return [
    {
      id: 'open-vscode',
      title: 'Open in VS Code',
      shortcut: '↵',
      run: () => {
        openInVSCode(repoPath);
        return { ok: true, tool: 'code', path: repoPath };
      }
    },
    {
      id: 'open-terminal',
      title: 'Open in Terminal',
      shortcut: 'Ctrl+T',
      run: () => {
        openInTerminal(repoPath);
        return { ok: true, tool: 'wt', path: repoPath };
      }
    },
    {
      id: 'open-explorer',
      title: 'Open in File Explorer',
      shortcut: 'Ctrl+O',
      run: () => {
        openInExplorer(repoPath);
        return { ok: true, tool: 'explorer', path: repoPath };
      }
    }
  ];
}

/**
 * Fast read of branch name from .git/HEAD. Sub-millisecond synchronous read.
 */
function readBranchName(repoPath) {
  try {
    const headPath = path.join(repoPath, '.git', 'HEAD');
    if (fs.existsSync(headPath)) {
      const content = fs.readFileSync(headPath, 'utf8');
      const parsed = parseGitHead(content);
      return parsed.branch !== 'unknown' ? parsed.branch : 'main';
    }
  } catch {}
  return 'main';
}

/**
 * Fast dirty worktree check via git status --porcelain.
 */
function checkDirty(repoPath) {
  return new Promise((resolve) => {
    execFile('git', ['-C', repoPath, 'status', '--porcelain'], { windowsHide: true }, (err, stdout) => {
      if (err || !stdout) {
        return resolve({ dirty: false, dirtyCount: 0 });
      }
      resolve(parseGitStatus(stdout));
    });
  });
}

/**
 * Scan candidate directories for git repositories up to maxDepth.
 */
function scanRepositories(customRoots) {
  if (isScanning) return Promise.resolve(indexedRepos);
  isScanning = true;

  const userProfile = process.env.USERPROFILE || os.homedir();
  const searchRoots = customRoots || [
    path.join(userProfile, 'Projects'),
    path.join(userProfile, 'WorkBuddy AI'),
    path.join(userProfile, 'Workspace'),
    path.join(userProfile, 'source'),
    path.join(userProfile, 'repos'),
    path.join(userProfile, 'code'),
    path.join(userProfile, 'Documents'),
    userProfile,
    process.cwd()
  ];

  const uniqueRoots = [...new Set(searchRoots.filter((dir) => {
    try {
      return fs.existsSync(dir) && fs.statSync(dir).isDirectory();
    } catch {
      return false;
    }
  }))];

  const foundRepos = [];
  const seenPaths = new Set();

  function crawl(currentDir, currentDepth, maxDepth) {
    if (currentDepth > maxDepth) return;

    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    // Check if this directory is itself a git repository
    const hasGit = entries.some((e) => e.isDirectory() && e.name === '.git');
    if (hasGit) {
      const fullPath = path.resolve(currentDir);
      if (!seenPaths.has(fullPath)) {
        seenPaths.add(fullPath);
        const repoName = path.basename(fullPath);
        const branch = readBranchName(fullPath);
        foundRepos.push({
          name: repoName,
          path: fullPath,
          branch,
          dirty: false,
          dirtyCount: 0,
          lastModified: Date.now()
        });
      }
      return; // Do not crawl deeper into subdirectories of a git repository
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.') || IGNORED_DIRS.has(entry.name)) continue;

      const subDir = path.join(currentDir, entry.name);
      crawl(subDir, currentDepth + 1, maxDepth);
    }
  }

  return new Promise((resolve) => {
    try {
      for (const root of uniqueRoots) {
        // If root is userProfile itself, limit maxDepth to 2, otherwise 3
        const maxDepth = (root === userProfile) ? 2 : 3;
        crawl(root, 0, maxDepth);
      }

      indexedRepos = foundRepos;
      lastScanTime = Date.now();
      isScanning = false;

      // Asynchronously enrich dirty status for discovered repos in background
      for (const repo of indexedRepos) {
        checkDirty(repo.path).then((status) => {
          repo.dirty = status.dirty;
          repo.dirtyCount = status.dirtyCount;
        }).catch(() => {});
      }

      resolve(indexedRepos);
    } catch {
      isScanning = false;
      resolve(indexedRepos);
    }
  });
}

function getRepositories() {
  return indexedRepos;
}

function openInVSCode(repoPath) {
  return new Promise((resolve) => {
    exec(`cmd.exe /c code "${repoPath}"`, { windowsHide: true }, (err) => {
      resolve({ ok: !err, path: repoPath });
    });
  });
}

function openInTerminal(repoPath) {
  return new Promise((resolve) => {
    // Attempt Windows Terminal first, fallback to powershell
    exec(`wt.exe -d "${repoPath}"`, { windowsHide: true }, (wtErr) => {
      if (wtErr) {
        exec(`powershell.exe -NoExit -Command "Set-Location '${repoPath}'"`, { windowsHide: false }, (psErr) => {
          resolve({ ok: !psErr, path: repoPath });
        });
      } else {
        resolve({ ok: true, path: repoPath });
      }
    });
  });
}

function openInExplorer(repoPath) {
  return new Promise((resolve) => {
    if (shell && typeof shell.openPath === 'function') {
      shell.openPath(repoPath).then((err) => {
        resolve({ ok: !err, path: repoPath });
      }).catch(() => {
        exec(`explorer.exe "${repoPath}"`, { windowsHide: true }, () => resolve({ ok: true, path: repoPath }));
      });
    } else {
      exec(`explorer.exe "${repoPath}"`, { windowsHide: true }, (err) => {
        resolve({ ok: !err, path: repoPath });
      });
    }
  });
}

module.exports = {
  parseGitHead,
  parseGitStatus,
  getActions,
  scanRepositories,
  getRepositories,
  readBranchName,
  checkDirty,
  openInVSCode,
  openInTerminal,
  openInExplorer
};
