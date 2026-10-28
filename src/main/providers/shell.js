'use strict';

const { app, shell, clipboard } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const store = require('../store');
const sysControls = require('../system-controls');
const settings = require('../settings');
const browserSearch = require('../browser-search');
const fastFileSearch = require('../fast-file-search');
const windowWorkspaces = require('../window-workspaces');
const { fuzzy, scoreItem, HOME } = require('./utils');

function startMenuDirs() {
  const dirs = [
    path.join(process.env.ProgramData || 'C:\\ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    path.join(process.env.APPDATA || path.join(HOME, 'AppData', 'Roaming'), 'Microsoft', 'Windows', 'Start Menu', 'Programs')
  ];
  return dirs.filter((d) => { try { return fs.statSync(d).isDirectory(); } catch { return false; } });
}

function walkShortcuts(dir, out, depth = 0) {
  if (depth > 6 || out.length > 4000) return;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walkShortcuts(full, out, depth + 1);
    else if (/\.(lnk|url)$/i.test(e.name)) out.push(full);
  }
}

function launchTarget(target) {
  if (target.startsWith('appid:')) {
    const id = target.slice(6);
    spawn('explorer.exe', [`shell:appsFolder\\${id}`], { detached: true, stdio: 'ignore' }).unref();
    return;
  }
  if (target.startsWith('exe:')) {
    const file = target.slice(4);
    spawn(file, [], { detached: true, stdio: 'ignore' }).unref();
    return;
  }
  shell.openPath(target);
}

function appsProvider() {
  let items = [];
  let ready = false;

  function buildFromShortcuts() {
    const found = [];
    for (const dir of startMenuDirs()) walkShortcuts(dir, found);
    const seen = new Set();
    for (const file of found) {
      const name = path.basename(file).replace(/\.(lnk|url)$/i, '');
      if (!name || seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      items.push({
        id: `app:${file}`,
        provider: 'apps',
        group: 'Applications',
        title: name,
        subtitle: 'Application',
        keywords: [path.dirname(file).split(path.sep).slice(-1)[0]],
        icon: { kind: 'file', path: file, fallback: 'app' },
        actions: [
          { id: 'open', title: 'Open', shortcut: '↵', run: () => launchTarget(file) },
          { id: 'reveal', title: 'Show in Explorer', shortcut: 'Ctrl+Shift+O', run: () => shell.showItemInFolder(file) },
          { id: 'copy-path', title: 'Copy Path', shortcut: 'Ctrl+Shift+C', run: () => clipboard.writeText(file) }
        ]
      });
    }
    ready = true;
  }

  function mergeStoreApps(list) {
    const known = new Set(items.map((i) => i.title.toLowerCase()));
    for (const entry of list) {
      if (!entry || !entry.Name || !entry.AppID) continue;
      const key = String(entry.Name).toLowerCase();
      if (known.has(key)) continue;
      known.add(key);
      items.push({
        id: `app:appid:${entry.AppID}`,
        provider: 'apps',
        group: 'Applications',
        title: String(entry.Name),
        subtitle: 'Application',
        icon: { kind: 'glyph', name: 'app' },
        actions: [
          { id: 'open', title: 'Open', shortcut: '↵', run: () => launchTarget(`appid:${entry.AppID}`) },
          { id: 'copy-name', title: 'Copy Name', shortcut: 'Ctrl+C', run: () => clipboard.writeText(String(entry.Name)) }
        ]
      });
    }
  }

  return {
    id: 'apps',
    name: 'Applications',
    group: 'Applications',
    all: () => items,
    async warm() {
      buildFromShortcuts();
      await new Promise((resolve) => {
        execFile('powershell.exe', [
          '-NoProfile', '-NonInteractive', '-Command',
          'Get-StartApps | Select-Object Name,AppID | ConvertTo-Json -Compress'
        ], { timeout: 15000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
          if (!err && stdout) {
            try {
              const parsed = JSON.parse(stdout);
              mergeStoreApps(Array.isArray(parsed) ? parsed : [parsed]);
            } catch { /* keep shortcut list only */ }
          }
          resolve();
        });
      });
    },
    search() {
      if (!ready) buildFromShortcuts();
      return items;
    }
  };
}

// ============================================================ provider: clipboard


function clipboardProvider() {
  const HISTORY_CAP = 250;
  let history = [];
  let timer = null;
  let last = '';
  let seqIndex = 0;

  function load() {
    const saved = store.read('clipboard', []);
    if (Array.isArray(saved)) history = saved.filter((e) => e && typeof e.text === 'string').slice(0, HISTORY_CAP);
    try { last = clipboard.readText() || ''; } catch { last = ''; }
  }

  function persist() { store.write('clipboard', history); }

  function items() {
    const list = history.map((entry, index) => ({
      id: `clip:${index}`,
      provider: 'clipboard',
      group: 'Clipboard History',
      title: entry.text.replace(/\s+/g, ' ').trim().slice(0, 90) || '(whitespace)',
      subtitle: `Clipboard · ${timeAgo(entry.at)}`,
      icon: { kind: 'glyph', name: 'clipboard' },
      actions: [
        { id: 'copy', title: 'Copy to Clipboard', shortcut: '↵', run: () => { clipboard.writeText(entry.text); last = entry.text; } },
        { id: 'remove', title: 'Remove from History', shortcut: 'Ctrl+D', run: () => { history = history.filter((e) => e !== entry); persist(); } }
      ]
    }));

    // Sequential Paste Commands
    list.unshift(
      {
        id: 'clip:paste-sequential',
        provider: 'clipboard',
        group: 'Clipboard History',
        title: `Paste Sequential (Item #${seqIndex + 1} of ${Math.max(1, history.length)})`,
        subtitle: history[seqIndex % Math.max(1, history.length)] ? `Next: "${history[seqIndex % history.length].text.slice(0, 40)}..."` : 'Cycles through clipboard history items sequentially',
        icon: { kind: 'glyph', name: 'clipboard' },
        actions: [
          {
            id: 'paste-seq',
            title: 'Paste Next Sequential Item',
            shortcut: '↵',
            run: () => {
              if (!history.length) return { ok: false, error: 'Clipboard history empty' };
              const current = history[seqIndex % history.length];
              seqIndex = (seqIndex + 1) % history.length;
              clipboard.writeText(current.text);
              return { ok: true, text: current.text, nextIndex: seqIndex + 1 };
            }
          }
        ]
      },
      {
        id: 'clip:reset-paste-sequential',
        provider: 'clipboard',
        group: 'Clipboard History',
        title: 'Reset Sequential Paste Index',
        subtitle: 'Reset sequential paste counter back to the first item (#1)',
        icon: { kind: 'glyph', name: 'clipboard' },
        actions: [
          {
            id: 'reset-seq',
            title: 'Reset Sequence',
            shortcut: '↵',
            run: () => {
              seqIndex = 0;
              return { ok: true, reset: true };
            }
          }
        ]
      }
    );

    return list;
  }

  return {
    id: 'clipboard',
    name: 'Clipboard History',
    group: 'Clipboard History',
    all: () => items().slice(0, 30),
    warm() {
      load();
      timer = setInterval(() => {
        let text = '';
        try { text = clipboard.readText() || ''; } catch { return; }
        if (!text || text === last) return;
        last = text;
        history = history.filter((e) => e.text !== text);
        history.unshift({ text, at: Date.now() });
        if (history.length > HISTORY_CAP) history.length = HISTORY_CAP;
        persist();
      }, 900);
      if (timer.unref) timer.unref();
    },
    dispose() { if (timer) clearInterval(timer); },
    search(query) {
      const q = String(query || '').trim().toLowerCase();
      const all = items();
      if (/seq|sequential/i.test(q)) {
        return all.slice(0, 2).map((item) => ({ ...item, scoreBoost: 240 }));
      }
      return all;
    }
  };
}

function timeAgo(ts) {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}


const FILE_ROOTS = ['Desktop', 'Documents', 'Downloads', 'Pictures', 'Music', 'Videos'];
const SKIP_DIRS = new Set(['node_modules', '.git', '.cache', 'AppData', '$RECYCLE.BIN', 'System Volume Information', '.vscode', '.gradle', '.nuget']);

function filesProvider() {
  const INDEX_CAP = 25000;
  let index = [];
  let ready = false;
  let walking = false;

  function walk(dir, depth) {
    if (depth > 5 || index.length >= INDEX_CAP) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (index.length >= INDEX_CAP) return;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name) || e.name.startsWith('.')) continue;
        walk(full, depth + 1);
      } else if (e.isFile()) {
        index.push({ path: full, name: e.name, dir: path.basename(dir) });
      }
    }
  }

  function build() {
    if (walking || ready) return;
    walking = true;
    for (const root of FILE_ROOTS) {
      walk(path.join(HOME, root), 0);
      if (index.length >= INDEX_CAP) break;
    }
    ready = true;
    walking = false;
  }

  return {
    id: 'files',
    name: 'Files',
    group: 'Files',
    all: () => [],
    warm() { setTimeout(build, 1500); },
    search(query) {
      if (!ready) build();
      const q = String(query || '').trim();
      if (q.length < 2) return [];
      const scored = [];
      for (const f of index) {
        const s = fuzzy(q, f.name);
        if (s === null) continue;
        scored.push({ f, s });
        if (scored.length > 4000) break;
      }
      scored.sort((a, b) => b.s - a.s);
      return scored.slice(0, 25).map(({ f }) => ({
        id: `file:${f.path}`,
        provider: 'files',
        group: 'Files',
        title: f.name,
        subtitle: f.path,
        keywords: [f.dir],
        icon: { kind: 'file', path: f.path, fallback: 'file' },
        actions: [
          { id: 'open', title: 'Open', shortcut: '↵', run: () => shell.openPath(f.path) },
          { id: 'reveal', title: 'Show in Explorer', shortcut: 'Ctrl+Shift+O', run: () => shell.showItemInFolder(f.path) },
          { id: 'copy-path', title: 'Copy Path', shortcut: 'Ctrl+Shift+C', run: () => clipboard.writeText(f.path) }
        ]
      }));
    }
  };
}

// ============================================================ provider: snippets


const WINDOW_COMMANDS = [
  ['left-half', 'Left Half', 'Snap left half of the display', () => sysControls.snapLeft()],
  ['right-half', 'Right Half', 'Snap right half of the display', () => sysControls.snapRight()],
  ['top-half', 'Top Half', 'Snap top half of the display', () => sysControls.snapTop()],
  ['bottom-half', 'Bottom Half', 'Snap bottom half of the display', () => sysControls.snapBottom()],

  ['maximize', 'Maximize', 'Maximize window to fit display', () => sysControls.snapMaximize()],
  ['almost-maximize', 'Almost Maximize', 'Expand window with margin around edges', () => sysControls.snapAlmostMaximize()],
  ['minimize', 'Minimize', 'Minimize current window', () => sysControls.snapMinimize()],
  ['center', 'Center', 'Center window in display', () => sysControls.snapCenter()],

  ['top-left', 'Top Left', 'Snap to top-left quarter', () => sysControls.snapTopLeft()],
  ['top-right', 'Top Right', 'Snap to top-right quarter', () => sysControls.snapTopRight()],
  ['bottom-left', 'Bottom Left', 'Snap to bottom-left quarter', () => sysControls.snapBottomLeft()],
  ['bottom-right', 'Bottom Right', 'Snap to bottom-right quarter', () => sysControls.snapBottomRight()],

  ['first-third', 'First Third', 'Snap to left one third', () => sysControls.snapFirstThird()],
  ['center-third', 'Center Third', 'Snap to center one third', () => sysControls.snapCenterThird()],
  ['last-third', 'Last Third', 'Snap to right one third', () => sysControls.snapLastThird()],
  ['first-two-thirds', 'First Two Thirds', 'Snap to left two thirds', () => sysControls.snapFirstTwoThirds()],
  ['last-two-thirds', 'Last Two Thirds', 'Snap to right two thirds', () => sysControls.snapLastTwoThirds()],

  ['make-larger', 'Make Larger', 'Increase window dimensions', () => sysControls.snapMakeLarger()],
  ['make-smaller', 'Make Smaller', 'Decrease window dimensions', () => sysControls.snapMakeSmaller()]
];

function windowManagerProvider() {
  const items = WINDOW_COMMANDS.map(([id, title, subtitle, run]) => ({
    id: `wm:${id}`,
    provider: 'window-manager',
    group: 'Window Management',
    title,
    subtitle,
    keywords: ['window', 'tile', 'snap', 'move', 'layout', id],
    icon: { kind: 'glyph', name: 'window' },
    actions: [{ id: 'run', title: `Apply ${title}`, shortcut: '↵', run }]
  }));

  return {
    id: 'window-manager',
    name: 'Window Management',
    group: 'Window Management',
    all: () => items,
    search: () => items
  };
}

// ============================================================ provider: emojis & symbols


const QUICKLINKS = [
  { prefix: 'g', name: 'Google', url: 'https://www.google.com/search?q=' },
  { prefix: 'google', name: 'Google', url: 'https://www.google.com/search?q=' },
  { prefix: 'ddg', name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
  { prefix: 'yt', name: 'YouTube', url: 'https://www.youtube.com/results?search_query=' },
  { prefix: 'youtube', name: 'YouTube', url: 'https://www.youtube.com/results?search_query=' },
  { prefix: 'gh', name: 'GitHub', url: 'https://github.com/search?q=' },
  { prefix: 'github', name: 'GitHub', url: 'https://github.com/search?q=' },
  { prefix: 'wiki', name: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Special:Search?search=' },
  { prefix: 'reddit', name: 'Reddit', url: 'https://www.reddit.com/search/?q=' },
  { prefix: 'npm', name: 'npm', url: 'https://www.npmjs.com/search?q=' },
  { prefix: 'maps', name: 'Google Maps', url: 'https://www.google.com/maps/search/' },
  { prefix: 'x', name: 'X / Twitter', url: 'https://x.com/search?q=' }
];

const URL_PATTERN = /^(https?:\/\/)?((?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}|localhost)(:[0-9]+)?(\/\S*)?$/i;

function webSearchProvider() {
  return {
    id: 'websearch',
    name: 'Web Search',
    group: 'Web Search',
    all: () => [],
    search(query) {
      const q = String(query || '').trim();
      if (!q) return [];

      const items = [];

      // 1. Direct URL detection
      if (URL_PATTERN.test(q)) {
        const fullUrl = /^https?:\/\//i.test(q) ? q : `https://${q}`;
        items.push({
          id: `url:${fullUrl}`,
          provider: 'websearch',
          group: 'Quicklinks',
          title: `Open ${q}`,
          subtitle: `Visit ${fullUrl}`,
          icon: { kind: 'glyph', name: 'globe' },
          scoreBoost: 210,
          actions: [
            { id: 'open', title: 'Open in Browser', shortcut: '↵', run: () => shell.openExternal(fullUrl) },
            { id: 'copy', title: 'Copy URL', shortcut: 'Ctrl+C', run: () => clipboard.writeText(fullUrl) }
          ]
        });
      }

      // 2. Keyword quicklinks (e.g., "gh react", "yt synthwave", "wiki alan turing")
      const parts = q.split(/\s+/);
      if (parts.length > 1) {
        const first = parts[0].toLowerCase();
        const rest = parts.slice(1).join(' ');
        const ql = QUICKLINKS.find((k) => k.prefix === first);
        if (ql) {
          const targetUrl = ql.url + encodeURIComponent(rest);
          items.push({
            id: `ql:${ql.name}:${rest}`,
            provider: 'websearch',
            group: 'Quicklinks',
            title: `Search ${ql.name} for "${rest}"`,
            subtitle: targetUrl,
            icon: { kind: 'glyph', name: ql.prefix === 'gh' || ql.prefix === 'github' ? 'github' : (ql.prefix === 'yt' || ql.prefix === 'youtube' ? 'youtube' : 'globe') },
            scoreBoost: 200,
            actions: [
              { id: 'search', title: `Search ${ql.name}`, shortcut: '↵', run: () => shell.openExternal(targetUrl) },
              { id: 'copy', title: 'Copy URL', shortcut: 'Ctrl+C', run: () => clipboard.writeText(targetUrl) }
            ]
          });
        }
      }

      // 3. Explicit web search commands (e.g., "g electron", "search rust")
      if (/^(?:g|search|google)\s+(.+)$/i.test(q)) {
        const term = q.replace(/^(?:g|search|google)\s+/i, '').trim();
        items.push(
          {
            id: `web:google:${term}`,
            provider: 'websearch',
            group: 'Web Search',
            title: `Search Google for "${term}"`,
            subtitle: 'Open in default browser',
            icon: { kind: 'glyph', name: 'google' },
            scoreBoost: 200,
            actions: [{ id: 'search', title: 'Search Google', shortcut: '↵', run: () => shell.openExternal(`https://www.google.com/search?q=${encodeURIComponent(term)}`) }]
          },
          {
            id: `web:ddg:${term}`,
            provider: 'websearch',
            group: 'Web Search',
            title: `Search DuckDuckGo for "${term}"`,
            subtitle: 'Open in default browser',
            icon: { kind: 'glyph', name: 'globe' },
            scoreBoost: 195,
            actions: [{ id: 'search', title: 'Search DuckDuckGo', shortcut: '↵', run: () => shell.openExternal(`https://duckduckgo.com/?q=${encodeURIComponent(term)}`) }]
          }
        );
      }

      return items;
    }
  };
}

// ============================================================ provider: scripts


function browserSearchProvider() {
  return {
    id: 'browser-bookmarks',
    name: 'Browser Bookmarks & Search',
    all: () => {
      const items = browserSearch.loadAllBookmarks();
      return items.slice(0, 8).map(browserSearch.formatBookmarkItem);
    },
    search: (query) => {
      const q = String(query || '').trim();
      if (!q) return [];
      const items = browserSearch.searchBookmarks(q);
      return items.map(browserSearch.formatBookmarkItem);
    }
  };
}


function fastFilesProvider() {
  return {
    id: 'fast-files',
    name: 'Fast File Search',
    all: () => [],
    search: async (query) => {
      const q = String(query || '').trim();
      if (!q || q.length < 2) return [];
      const files = await fastFileSearch.searchFastFiles(q, { limit: 10 });
      return files.map(fastFileSearch.formatFileItem);
    }
  };
}


function workspacesProvider() {
  return {
    id: 'workspaces',
    name: 'Window Workspaces',
    all: () => {
      const list = windowWorkspaces.listWorkspaces();
      return list.map((ws) => ({
        id: `ws:restore:${ws.name}`,
        provider: 'workspaces',
        group: 'Workspaces',
        title: `Restore Workspace: "${ws.name}"`,
        subtitle: `${ws.windowCount} window positions saved`,
        icon: '🪟',
        keywords: ['workspace', 'layout', 'window', ws.name],
        actions: [
          {
            id: 'restore',
            title: 'Restore Workspace Layout',
            shortcut: '↵',
            run: () => windowWorkspaces.restoreWorkspace(ws.name)
          }
        ]
      }));
    },
    search: (query) => {
      const q = String(query || '').trim().toLowerCase();
      if (!q) return [];
      const list = windowWorkspaces.listWorkspaces();
      const matched = list.filter((w) => w.name.toLowerCase().includes(q) || 'workspace'.includes(q));
      return matched.map((ws) => ({
        id: `ws:restore:${ws.name}`,
        provider: 'workspaces',
        group: 'Workspaces',
        title: `Restore Workspace: "${ws.name}"`,
        subtitle: `${ws.windowCount} window positions saved`,
        icon: '🪟',
        scoreBoost: 120,
        keywords: ['workspace', 'layout', 'window', ws.name],
        actions: [
          {
            id: 'restore',
            title: 'Restore Workspace Layout',
            shortcut: '↵',
            run: () => windowWorkspaces.restoreWorkspace(ws.name)
          }
        ]
      }));
    }
  };
}


module.exports = {
  appsProvider,
  clipboardProvider,
  filesProvider,
  windowManagerProvider,
  webSearchProvider,
  browserSearchProvider,
  fastFilesProvider,
  workspacesProvider
};
