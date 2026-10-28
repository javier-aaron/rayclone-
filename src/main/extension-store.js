'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const store = require('./store');

const EXTENSIONS_DIR = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Rayclone', 'extensions');

const CURATED_EXTENSIONS = [
  {
    id: 'ext-github-radar',
    name: 'GitHub Radar',
    version: '1.2.0',
    description: 'Instant notifications and search for GitHub PRs, issues, and trending repositories',
    author: 'Rayclone Community',
    icon: '🐙',
    category: 'Developer Tools',
    downloadUrl: 'https://registry.rayclone.dev/ext/github-radar.zip',
    installed: true,
    enabled: true
  },
  {
    id: 'ext-docker-lens',
    name: 'Docker Lens Pro',
    version: '1.0.4',
    description: 'Visual container inspection, volume explorer, and log stream viewer',
    author: 'DevOps Guild',
    icon: '🐳',
    category: 'Developer Tools',
    downloadUrl: 'https://registry.rayclone.dev/ext/docker-lens.zip',
    installed: true,
    enabled: true
  },
  {
    id: 'ext-spotify-player',
    name: 'Spotify Controller & Lyrics',
    version: '2.1.0',
    description: 'Mini player, playlist selector, and synchronized desktop lyrics',
    author: 'AudioPhile',
    icon: '🎵',
    category: 'Media',
    downloadUrl: 'https://registry.rayclone.dev/ext/spotify-lyrics.zip',
    installed: false,
    enabled: false
  },
  {
    id: 'ext-notion-quick',
    name: 'Notion Quick Notes & Tasks',
    version: '1.3.1',
    description: 'Append thoughts, capture links, and search Notion databases from Rayclone',
    author: 'Productivity Labs',
    icon: '📓',
    category: 'Productivity',
    downloadUrl: 'https://registry.rayclone.dev/ext/notion-quick.zip',
    installed: false,
    enabled: false
  },
  {
    id: 'ext-tailscale-mesh',
    name: 'Tailscale Network Switcher',
    version: '1.1.0',
    description: 'Switch exit nodes, copy IP addresses, and ping machines in your Tailnet',
    author: 'NetOps',
    icon: '🛡️',
    category: 'System',
    downloadUrl: 'https://registry.rayclone.dev/ext/tailscale.zip',
    installed: false,
    enabled: false
  }
];

let extensionState = [...CURATED_EXTENSIONS];

function init() {
  if (!fs.existsSync(EXTENSIONS_DIR)) {
    try { fs.mkdirSync(EXTENSIONS_DIR, { recursive: true }); } catch {}
  }
  const saved = store.read('installed_extensions', null);
  if (Array.isArray(saved)) {
    extensionState = saved;
  } else {
    store.write('installed_extensions', extensionState);
  }
}

function listExtensions(filterCategory = '') {
  if (!filterCategory) return [...extensionState];
  return extensionState.filter((e) => e.category.toLowerCase() === filterCategory.toLowerCase());
}

function installExtension(extId) {
  const ext = extensionState.find((e) => e.id === extId);
  if (ext) {
    ext.installed = true;
    ext.enabled = true;
    store.write('installed_extensions', extensionState);
    return { ok: true, extension: ext };
  }
  return { ok: false, error: 'extension not found in registry' };
}

function uninstallExtension(extId) {
  const ext = extensionState.find((e) => e.id === extId);
  if (ext) {
    ext.installed = false;
    ext.enabled = false;
    store.write('installed_extensions', extensionState);
    return { ok: true };
  }
  return { ok: false, error: 'extension not found' };
}

function toggleExtension(extId) {
  const ext = extensionState.find((e) => e.id === extId);
  if (ext && ext.installed) {
    ext.enabled = !ext.enabled;
    store.write('installed_extensions', extensionState);
    return { ok: true, enabled: ext.enabled };
  }
  return { ok: false, error: 'extension not installed' };
}

init();

module.exports = {
  init,
  listExtensions,
  installExtension,
  uninstallExtension,
  toggleExtension,
  EXTENSIONS_DIR,
  CURATED_EXTENSIONS
};
