'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { exec } = require('node:child_process');
const initSqlJs = require('sql.js');

const APPDATA = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');

const VSCODE_EDITIONS = [
  { name: 'VS Code', cli: 'code', db: path.join(APPDATA, 'Code', 'User', 'globalStorage', 'state.vscdb') },
  { name: 'VS Code Insiders', cli: 'code-insiders', db: path.join(APPDATA, 'Code - Insiders', 'User', 'globalStorage', 'state.vscdb') },
  { name: 'VSCodium', cli: 'codium', db: path.join(APPDATA, 'VSCodium', 'User', 'globalStorage', 'state.vscdb') }
];

let cachedWorkspaces = [];
let lastFetchTime = 0;
const CACHE_TTL = 30000;
let sqlEngine = null;
const watchers = [];

async function getSql() {
  if (!sqlEngine) {
    sqlEngine = await initSqlJs();
  }
  return sqlEngine;
}

function decodeUriToPath(uri) {
  if (!uri) return '';
  if (uri.startsWith('file:///')) {
    let p = uri.replace('file:///', '');
    p = decodeURIComponent(p);
    return p.replace(/\//g, '\\');
  }
  return uri;
}

function parseRecentEntries(jsonString, editionName, cli) {
  const results = [];
  try {
    const parsed = JSON.parse(jsonString);
    const entries = parsed.entries || [];
    for (const ent of entries) {
      let targetPath = '';
      let isFolder = true;
      let isRemote = false;
      let label = '';

      if (ent.folderUri) {
        targetPath = decodeUriToPath(ent.folderUri);
        label = path.basename(targetPath) || targetPath;
        isFolder = true;
      } else if (ent.fileUri) {
        targetPath = decodeUriToPath(ent.fileUri);
        label = path.basename(targetPath);
        isFolder = false;
      } else if (ent.workspace && ent.workspace.configPath) {
        targetPath = decodeUriToPath(ent.workspace.configPath);
        label = path.basename(targetPath);
        isFolder = false;
      }

      if (ent.remoteAuthority) {
        isRemote = true;
        label = `[${ent.remoteAuthority}] ${label}`;
      }

      if (targetPath) {
        results.push({
          edition: editionName || 'VS Code',
          cli: cli || 'code',
          label: ent.label || label,
          path: targetPath,
          isFolder,
          isRemote
        });
      }
    }
  } catch {}
  return results;
}

async function readDatabaseSafely(dbPath, editionName = 'VS Code', cli = 'code') {
  if (!dbPath || !fs.existsSync(dbPath)) return [];

  let buffer = null;
  try {
    // Attempt direct read
    buffer = fs.readFileSync(dbPath);
  } catch (err) {
    // If locked by running VS Code process, copy to temp directory and read copy
    try {
      const tempCopy = path.join(os.tmpdir(), `rayclone-vsc-${Date.now()}-${path.basename(dbPath)}`);
      fs.copyFileSync(dbPath, tempCopy);
      buffer = fs.readFileSync(tempCopy);
      try { fs.unlinkSync(tempCopy); } catch {}
    } catch {
      return [];
    }
  }

  if (!buffer || buffer.length === 0) return [];

  let db = null;
  try {
    const SQL = await getSql();
    db = new SQL.Database(buffer);
    const res = db.exec("SELECT value FROM ItemTable WHERE key = 'history.recentlyOpenedPathsList'");
    if (res && res.length > 0 && res[0].values && res[0].values.length > 0) {
      const rawJson = res[0].values[0][0];
      return parseRecentEntries(rawJson, editionName, cli);
    }
  } catch (err) {
    return [];
  } finally {
    if (db) {
      try { db.close(); } catch {}
    }
  }

  return [];
}

function setupWatchers() {
  if (watchers.length > 0) return;
  for (const ed of VSCODE_EDITIONS) {
    if (fs.existsSync(ed.db)) {
      try {
        const w = fs.watch(ed.db, () => {
          cachedWorkspaces = [];
          lastFetchTime = 0;
        });
        watchers.push(w);
      } catch {}
    }
  }
}

async function loadRecentWorkspaces(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedWorkspaces.length > 0 && now - lastFetchTime < CACHE_TTL) {
    return cachedWorkspaces;
  }

  setupWatchers();

  const results = [];
  for (const ed of VSCODE_EDITIONS) {
    const entries = await readDatabaseSafely(ed.db, ed.name, ed.cli);
    for (const ent of entries) {
      if (!results.some((r) => r.path.toLowerCase() === ent.path.toLowerCase())) {
        results.push(ent);
      }
    }
  }

  // Auto-index active repository or project workspace (process.cwd())
  const cwd = process.cwd();
  if (cwd && (fs.existsSync(path.join(cwd, '.git')) || fs.existsSync(path.join(cwd, 'package.json')))) {
    if (!results.some((r) => r.path.toLowerCase() === cwd.toLowerCase())) {
      results.unshift({
        edition: 'VS Code',
        cli: 'code',
        label: path.basename(cwd),
        path: cwd,
        isFolder: true,
        isRemote: false
      });
    }
  }

  cachedWorkspaces = results;
  lastFetchTime = now;
  return results;
}

function getEmptyStateItem() {
  return {
    id: 'vsc:empty-state',
    title: 'No workspaces found',
    subtitle: 'VS Code not detected or no recent workspaces recorded in state.vscdb',
    icon: 'ℹ️',
    group: 'VS Code Workspaces',
    keywords: ['vscode', 'code', 'workspace'],
    scoreBoost: 100,
    emptyState: true,
    actions: [
      {
        id: 'open-vsc',
        title: 'Open VS Code',
        shortcut: '↵',
        run: () => {
          try {
            exec('code');
          } catch {}
          return { ok: true };
        }
      }
    ]
  };
}

function searchWorkspaces(query) {
  const q = String(query || '').replace(/^\{+/, '').trim().toLowerCase();
  const all = cachedWorkspaces;

  if (all.length === 0) {
    return [getEmptyStateItem()];
  }

  if (!q) {
    return all.slice(0, 20).map(formatWorkspaceItem);
  }

  const filtered = all.filter((w) => {
    return w.label.toLowerCase().includes(q) || w.path.toLowerCase().includes(q) || w.edition.toLowerCase().includes(q);
  }).slice(0, 25);

  if (filtered.length === 0) {
    return [
      {
        id: `vsc:no-match:${q}`,
        title: `No matching workspaces for "${q}"`,
        subtitle: 'Try searching for another folder or project name',
        icon: '🔍',
        group: 'VS Code Workspaces',
        keywords: ['vscode', 'code', q],
        scoreBoost: 50,
        emptyState: true,
        actions: []
      }
    ];
  }

  return filtered.map(formatWorkspaceItem);
}

function launchWorkspace(item) {
  const cli = item.cli || 'code';
  exec(`${cli} "${item.path}"`);
}

function formatWorkspaceItem(item) {
  if (!item || item.emptyState) return item || getEmptyStateItem();
  const icon = item.isRemote ? '🌐' : (item.isFolder ? '📁' : '📄');
  const pathStr = String(item.path || item.label || item.id || '');
  const idSuffix = Buffer.from(pathStr).toString('base64').slice(0, 32);
  return {
    id: `vsc:${item.edition || 'Code'}:${idSuffix}`,
    title: item.label || 'Workspace',
    subtitle: `${item.edition || 'VS Code'} • ${item.path || pathStr}`,
    icon,
    group: 'VS Code Workspaces',
    keywords: ['vscode', 'code', 'workspace', item.label, item.edition],
    scoreBoost: 210,
    actions: [
      {
        id: 'open',
        title: `Open in ${item.edition}`,
        shortcut: '↵',
        run: () => launchWorkspace(item)
      },
      {
        id: 'copy-path',
        title: 'Copy Path',
        run: () => {
          try {
            const electron = require('electron');
            if (electron && electron.clipboard && typeof electron.clipboard.writeText === 'function') {
              electron.clipboard.writeText(item.path);
            }
          } catch {}
          return { ok: true, copied: item.path };
        }
      }
    ]
  };
}

module.exports = {
  loadRecentWorkspaces,
  searchWorkspaces,
  launchWorkspace,
  formatWorkspaceItem,
  readDatabaseSafely,
  parseRecentEntries,
  getEmptyStateItem
};
