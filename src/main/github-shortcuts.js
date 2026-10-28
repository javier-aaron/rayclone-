'use strict';

const { execFile, exec } = require('node:child_process');

let shell = null;
try {
  const electron = require('electron');
  if (electron && typeof electron === 'object') {
    shell = electron.shell;
  }
} catch {}

let ghCliAvailable = null;
let glabCliAvailable = null;

function checkGhCli() {
  if (ghCliAvailable !== null) return Promise.resolve(ghCliAvailable);
  return new Promise((resolve) => {
    execFile('where.exe', ['gh'], { windowsHide: true }, (err) => {
      ghCliAvailable = !err;
      resolve(ghCliAvailable);
    });
  });
}

function checkGlabCli() {
  if (glabCliAvailable !== null) return Promise.resolve(glabCliAvailable);
  return new Promise((resolve) => {
    execFile('where.exe', ['glab'], { windowsHide: true }, (err) => {
      glabCliAvailable = !err;
      resolve(glabCliAvailable);
    });
  });
}

function resolveGithubUrl(kind, query = '') {
  const q = String(query || '').trim();
  const encoded = encodeURIComponent(q);

  switch (kind) {
    case 'pr':
    case 'prs':
    case 'pulls':
      return q ? `https://github.com/pulls?q=${encoded}` : 'https://github.com/pulls';
    case 'issue':
    case 'issues':
      return q ? `https://github.com/issues?q=${encoded}` : 'https://github.com/issues';
    case 'repo':
    case 'repos':
    default:
      return q ? `https://github.com/search?q=${encoded}&type=repositories` : 'https://github.com';
  }
}

function resolveGitlabUrl(kind, query = '') {
  const q = String(query || '').trim();
  const encoded = encodeURIComponent(q);

  switch (kind) {
    case 'mr':
    case 'mrs':
    case 'merge_requests':
      return q ? `https://gitlab.com/dashboard/merge_requests?search=${encoded}` : 'https://gitlab.com/dashboard/merge_requests';
    case 'issue':
    case 'issues':
      return q ? `https://gitlab.com/dashboard/issues?search=${encoded}` : 'https://gitlab.com/dashboard/issues';
    case 'repo':
    case 'repos':
    case 'project':
    case 'projects':
    default:
      return q ? `https://gitlab.com/explore/projects?name=${encoded}` : 'https://gitlab.com/explore';
  }
}

/**
 * Parses user search query into structured GitHub/GitLab shortcut intent.
 * Examples:
 *  "gh pr electron" -> { platform: 'github', type: 'pr', kind: 'pr', query: 'electron', url: ... }
 *  "gl mr bugfix"   -> { platform: 'gitlab', type: 'mr', kind: 'mr', query: 'bugfix', url: ... }
 */
function parseShortcut(rawQuery) {
  const q = String(rawQuery || '').trim();
  if (!q) return null;

  const parts = q.split(/\s+/);
  const prefix = parts[0]?.toLowerCase();
  const sub = parts[1]?.toLowerCase();
  const rest = parts.slice(2).join(' ').trim();

  if (prefix === 'gh') {
    if (sub === 'pr' || sub === 'prs' || sub === 'pulls') {
      return {
        prefix,
        platform: 'github',
        type: 'pr',
        kind: 'pr',
        query: rest,
        url: rest ? `https://github.com/pulls?q=${encodeURIComponent(rest)}` : 'https://github.com/pulls'
      };
    }
    if (sub === 'issue' || sub === 'issues') {
      return {
        prefix,
        platform: 'github',
        type: 'issue',
        kind: 'issue',
        query: rest,
        url: rest ? `https://github.com/issues?q=${encodeURIComponent(rest)}` : 'https://github.com/issues'
      };
    }
    if (sub === 'repo' || sub === 'repos') {
      return {
        prefix,
        platform: 'github',
        type: 'repo',
        kind: 'repo',
        query: rest,
        url: rest ? `https://github.com/search?q=${encodeURIComponent(rest)}&type=repositories` : 'https://github.com'
      };
    }
    const fullQuery = parts.slice(1).join(' ').trim();
    return {
      prefix,
      platform: 'github',
      type: 'repo',
      kind: 'repo',
      query: fullQuery,
      url: fullQuery ? `https://github.com/search?q=${encodeURIComponent(fullQuery)}&type=repositories` : 'https://github.com'
    };
  }

  if (prefix === 'glab' || prefix === 'gl') {
    if (sub === 'mr' || sub === 'mrs' || sub === 'merge_requests') {
      return {
        prefix,
        platform: 'gitlab',
        type: 'mr',
        kind: 'mr',
        query: rest,
        url: rest ? `https://gitlab.com/dashboard/merge_requests?search=${encodeURIComponent(rest)}` : 'https://gitlab.com/dashboard/merge_requests'
      };
    }
    if (sub === 'issue' || sub === 'issues') {
      return {
        prefix,
        platform: 'gitlab',
        type: 'issue',
        kind: 'issue',
        query: rest,
        url: rest ? `https://gitlab.com/dashboard/issues?search=${encodeURIComponent(rest)}` : 'https://gitlab.com/dashboard/issues'
      };
    }
    if (sub === 'repo' || sub === 'repos' || sub === 'project' || sub === 'projects') {
      return {
        prefix,
        platform: 'gitlab',
        type: 'repo',
        kind: 'repo',
        query: rest,
        url: rest ? `https://gitlab.com/explore/projects?name=${encodeURIComponent(rest)}` : 'https://gitlab.com/explore'
      };
    }
    const fullQuery = parts.slice(1).join(' ').trim();
    return {
      prefix,
      platform: 'gitlab',
      type: 'repo',
      kind: 'repo',
      query: fullQuery,
      url: fullQuery ? `https://gitlab.com/explore/projects?name=${encodeURIComponent(fullQuery)}` : 'https://gitlab.com/explore'
    };
  }

  return null;
}

function openUrl(url) {
  return new Promise((resolve) => {
    if (shell && typeof shell.openExternal === 'function') {
      shell.openExternal(url).then(() => resolve({ ok: true, url })).catch((err) => resolve({ ok: false, error: err.message, url }));
    } else {
      exec(`start "" "${url}"`, { windowsHide: true }, (err) => {
        resolve({ ok: !err, url });
      });
    }
  });
}

module.exports = {
  checkGhCli,
  checkGlabCli,
  resolveGithubUrl,
  resolveGitlabUrl,
  parseShortcut,
  parseQuery: parseShortcut,
  openUrl
};
