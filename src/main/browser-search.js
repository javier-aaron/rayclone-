'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { shell } = require('electron');

const LOCALAPPDATA = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
const APPDATA = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');

const BROWSER_PROFILES = [
  {
    name: 'Google Chrome',
    icon: '🌐',
    bookmarksPath: path.join(LOCALAPPDATA, 'Google', 'Chrome', 'User Data', 'Default', 'Bookmarks'),
    historyPath: path.join(LOCALAPPDATA, 'Google', 'Chrome', 'User Data', 'Default', 'History')
  },
  {
    name: 'Microsoft Edge',
    icon: '🌊',
    bookmarksPath: path.join(LOCALAPPDATA, 'Microsoft', 'Edge', 'User Data', 'Default', 'Bookmarks'),
    historyPath: path.join(LOCALAPPDATA, 'Microsoft', 'Edge', 'User Data', 'Default', 'History')
  },
  {
    name: 'Brave Browser',
    icon: '🦁',
    bookmarksPath: path.join(LOCALAPPDATA, 'BraveSoftware', 'Brave-Browser', 'User Data', 'Default', 'Bookmarks'),
    historyPath: path.join(LOCALAPPDATA, 'BraveSoftware', 'Brave-Browser', 'User Data', 'Default', 'History')
  }
];

let cachedBookmarks = [];
let lastLoadedTime = 0;
const CACHE_TTL = 30000; // 30 seconds

function extractBookmarksFromNode(node, folderPath = '', browserName = 'Browser') {
  const items = [];
  if (!node) return items;

  if (node.type === 'url') {
    items.push({
      id: `bookmark-${Buffer.from(node.url || '').toString('base64').slice(0, 32)}`,
      title: node.name || node.url,
      url: node.url,
      folder: folderPath,
      browser: browserName,
      type: 'bookmark'
    });
  } else if (node.type === 'folder' && Array.isArray(node.children)) {
    const currentFolder = folderPath ? `${folderPath} / ${node.name}` : (node.name || '');
    for (const child of node.children) {
      items.push(...extractBookmarksFromNode(child, currentFolder, browserName));
    }
  }
  return items;
}

function loadAllBookmarks() {
  const now = Date.now();
  if (cachedBookmarks.length > 0 && now - lastLoadedTime < CACHE_TTL) {
    return cachedBookmarks;
  }

  const results = [];
  for (const browser of BROWSER_PROFILES) {
    if (!fs.existsSync(browser.bookmarksPath)) continue;
    try {
      const raw = fs.readFileSync(browser.bookmarksPath, 'utf8');
      const data = JSON.parse(raw);
      if (data && data.roots) {
        for (const rootKey of Object.keys(data.roots)) {
          const rootNode = data.roots[rootKey];
          results.push(...extractBookmarksFromNode(rootNode, rootNode.name || '', browser.name));
        }
      }
    } catch (e) {
      // Ignore parse or read errors
    }
  }

  cachedBookmarks = results;
  lastLoadedTime = now;
  return results;
}

function searchBookmarks(query) {
  const q = String(query || '').trim().toLowerCase();
  const all = loadAllBookmarks();
  if (!q) return all.slice(0, 20);

  return all
    .filter((item) => {
      const matchTitle = item.title.toLowerCase().includes(q);
      const matchUrl = item.url.toLowerCase().includes(q);
      const matchFolder = item.folder.toLowerCase().includes(q);
      return matchTitle || matchUrl || matchFolder;
    })
    .slice(0, 30);
}

function formatBookmarkItem(item) {
  return {
    id: `browser-item-${item.id}`,
    title: item.title,
    subtitle: `${item.browser} Bookmark • ${item.url}`,
    icon: '🔖',
    group: 'Browser Bookmarks',
    url: item.url,
    keywords: [item.browser, 'bookmark', 'url', 'web', item.folder],
    actions: [
      {
        id: 'open-url',
        title: 'Open in Browser',
        run: () => shell.openExternal(item.url)
      },
      {
        id: 'copy-url',
        title: 'Copy URL',
        run: () => {
          const { clipboard } = require('electron');
          clipboard.writeText(item.url);
        }
      }
    ]
  };
}

module.exports = {
  loadAllBookmarks,
  searchBookmarks,
  formatBookmarkItem,
  BROWSER_PROFILES
};
