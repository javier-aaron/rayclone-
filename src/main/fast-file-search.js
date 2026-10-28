'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { shell } = require('electron');

const HOME = os.homedir();
const QUICK_DIRS = [
  path.join(HOME, 'Desktop'),
  path.join(HOME, 'Downloads'),
  path.join(HOME, 'Documents')
];

let inMemoryIndex = [];
let lastIndexed = 0;
const INDEX_TTL = 60000; // 60s

function scanDirectoryShallow(dir, maxDepth = 2, currentDepth = 0) {
  const results = [];
  if (currentDepth > maxDepth || !fs.existsSync(dir)) return results;

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.name.startsWith('.') || ent.name === 'node_modules' || ent.name === '$Recycle.Bin') continue;
      const fullPath = path.join(dir, ent.name);
      const isDir = ent.isDirectory();
      results.push({
        name: ent.name,
        path: fullPath,
        isDir,
        ext: path.extname(ent.name).toLowerCase()
      });
      if (isDir && currentDepth < maxDepth) {
        results.push(...scanDirectoryShallow(fullPath, maxDepth, currentDepth + 1));
      }
    }
  } catch (e) {
    // Ignore access denied
  }
  return results;
}

function updateIndex() {
  const now = Date.now();
  if (inMemoryIndex.length > 0 && now - lastIndexed < INDEX_TTL) {
    return inMemoryIndex;
  }

  const items = [];
  for (const d of QUICK_DIRS) {
    items.push(...scanDirectoryShallow(d, 2, 0));
  }
  inMemoryIndex = items;
  lastIndexed = now;
  return items;
}

async function searchFastFiles(query, options = {}) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];

  const index = updateIndex();
  const matched = [];

  for (const item of index) {
    if (item.name.toLowerCase().includes(q)) {
      matched.push(item);
      if (matched.length >= (options.limit || 30)) break;
    }
  }

  return matched;
}

function formatFileItem(file) {
  const icon = file.isDir ? '📁' : '📄';
  return {
    id: `fast-file-${Buffer.from(file.path).toString('base64').slice(0, 32)}`,
    title: file.name,
    subtitle: file.path,
    icon,
    group: 'Files',
    path: file.path,
    keywords: [file.name, file.ext, 'file', file.isDir ? 'folder' : 'document'],
    actions: [
      {
        id: 'open-file',
        title: file.isDir ? 'Open Folder' : 'Open File',
        run: () => shell.openPath(file.path)
      },
      {
        id: 'show-in-folder',
        title: 'Show in Explorer',
        run: () => shell.showItemInFolder(file.path)
      },
      {
        id: 'copy-path',
        title: 'Copy Path',
        run: () => {
          const { clipboard } = require('electron');
          clipboard.writeText(file.path);
        }
      }
    ]
  };
}

module.exports = {
  searchFastFiles,
  formatFileItem,
  updateIndex
};
