'use strict';

const store = require('../store');
const ai = require('../ai');
const translator = require('../translator');
const windowsRun = require('../windows-run');
const aliasManager = require('../alias-manager');
const fallbackManager = require('../fallback-manager');

const { fuzzy, scoreItem, evaluateExpression } = require('./utils');
const { routePrefix } = require('./prefix-router');

const {
  calculatorProvider,
  snippetsProvider,
  emojiProvider,
  notesProvider,
  parameterizedQuicklinksProvider,
  colorPickerProvider,
  remindersProvider,
  bitwardenProvider,
  quickUtilitiesProvider,
  gamesProvider
} = require('./productivity');

const {
  aiProvider,
  mcpProvider,
  screenAwarenessProvider,
  dictationProvider,
  aiCommandsProvider
} = require('./ai');

const {
  translatorProvider,
  dictionaryProvider,
  focusProvider,
  calendarProvider,
  contactsProvider,
  typingPracticeProvider,
  weatherProvider,
  navigationProvider
} = require('./assistant');

const {
  scriptsProvider,
  portInspectorProvider,
  gitRepositoriesProvider,
  dockerManagerProvider,
  githubShortcutsProvider,
  terminalIntegrationProvider,
  projectLauncherProvider,
  extensionStoreProvider,
  vscodeWorkspacesProvider,
  wslProvider,
  sandboxedExtensionProvider
} = require('./dev');

const { devToolsProvider } = require('./devtools');

const {
  windowsRunProvider,
  windowsServicesProvider,
  environmentVariablesProvider,
  wingetUpdatesProvider,
  hostsEditorProvider,
  windowsSettingsCatalogProvider,
  registryExplorerProvider,
  windowWalkerProvider,
  dnsSwitcherProvider
} = require('./windows');

const {
  audioSwitcherProvider,
  mediaHudProvider,
  spotifyProvider,
  bluetoothProvider
} = require('./media');

const {
  processProvider,
  systemProvider,
  taskManagerProvider,
  wifiProvider,
  powerProvider,
  virtualDesktopsProvider,
  diskCleanupProvider,
  alwaysOnTopProvider,
  screenRecorderProvider,
  systemDiagnosticsProvider,
  chronometricsProvider
} = require('./system');

const {
  appsProvider,
  clipboardProvider,
  filesProvider,
  windowManagerProvider,
  webSearchProvider,
  browserSearchProvider,
  fastFilesProvider,
  workspacesProvider
} = require('./shell');

function createRegistry(opts = {}) {
  const userDataPath = opts && opts.userDataPath;
  store.init(userDataPath);

  const providers = [
    calculatorProvider(),
    appsProvider(),
    clipboardProvider(),
    filesProvider(),
    windowManagerProvider(),
    notesProvider(),
    snippetsProvider(),
    emojiProvider(),
    scriptsProvider(),
    processProvider(),
    devToolsProvider(),
    aiProvider(),
    webSearchProvider(),
    translatorProvider(),
    dictionaryProvider(),
    focusProvider(),
    calendarProvider(),
    mcpProvider(),
    contactsProvider(),
    windowsRunProvider(),
    typingPracticeProvider(),
    weatherProvider(),
    navigationProvider(),
    screenAwarenessProvider(),
    dictationProvider(),
    gamesProvider(),
    systemProvider(),
    portInspectorProvider(),
    gitRepositoriesProvider(),
    dockerManagerProvider(),
    githubShortcutsProvider(),
    audioSwitcherProvider(),
    windowsServicesProvider(),
    environmentVariablesProvider(),
    wingetUpdatesProvider(),
    hostsEditorProvider(),
    mediaHudProvider(),
    parameterizedQuicklinksProvider(),
    browserSearchProvider(),
    fastFilesProvider(),
    workspacesProvider(),
    colorPickerProvider(),
    taskManagerProvider(),
    wifiProvider(),
    powerProvider(),
    virtualDesktopsProvider(),
    diskCleanupProvider(),
    alwaysOnTopProvider(),
    screenRecorderProvider(),
    remindersProvider(),
    bitwardenProvider(),
    quickUtilitiesProvider(),
    terminalIntegrationProvider(),
    projectLauncherProvider(),
    spotifyProvider(),
    aiCommandsProvider(),
    extensionStoreProvider(),
    windowsSettingsCatalogProvider(),
    registryExplorerProvider(),
    vscodeWorkspacesProvider(),
    windowWalkerProvider(),
    systemDiagnosticsProvider(),
    chronometricsProvider(),
    wslProvider(),
    bluetoothProvider(),
    dnsSwitcherProvider(),
    sandboxedExtensionProvider()
  ];

  const byId = new Map(providers.map((p) => [p.id, p]));
  const itemsById = new Map();
  let frecency = store.read('frecency', {});
  if (typeof frecency !== 'object' || frecency === null) frecency = {};

  function remember(id) {
    const now = Date.now();
    const rec = frecency[id] || { count: 0, last: 0 };
    rec.count = Math.min(rec.count + 1, 50);
    rec.last = now;
    frecency[id] = rec;
    const keys = Object.keys(frecency);
    if (keys.length > 800) {
      keys.sort((a, b) => (frecency[b].last || 0) - (frecency[a].last || 0));
      const keep = {};
      for (const k of keys.slice(0, 400)) keep[k] = frecency[k];
      frecency = keep;
    }
    store.write('frecency', frecency);
  }

  function frecencyBoost(id) {
    const rec = frecency[id];
    if (!rec) return 0;
    const ageDays = (Date.now() - (rec.last || 0)) / 86400000;
    return Math.min(rec.count, 20) * 3 + Math.max(0, 14 - ageDays * 2);
  }

  function defaultItems() {
    const pool = [];
    const EXCLUDE_DEFAULT = new Set([
      'calculator', 'files', 'websearch', 'emojis', 'ports', 'docker', 'github-shortcuts',
      'audio', 'services', 'env', 'winget', 'hosts', 'media', 'quicklinks-param',
      'browser-bookmarks', 'fast-files', 'task-manager', 'wifi', 'power', 'disk-cleanup',
      'bitwarden', 'spotify', 'ai-commands', 'registry', 'vscode-workspaces',
      'window-walker', 'diagnostics', 'chronometrics', 'wsl', 'bluetooth', 'dns', 'sandboxed-extensions'
    ]);
    for (const p of providers) {
      if (EXCLUDE_DEFAULT.has(p.id)) continue;
      const all = p.all();
      for (const item of all) {
        const boost = frecencyBoost(item.id);
        if (boost > 0) pool.push({ item, score: boost });
      }
    }
    // Fall back to curated set on fresh install
    if (pool.length < 8) {
      for (const p of providers) {
        if (EXCLUDE_DEFAULT.has(p.id)) continue;
        for (const item of p.all()) {
          if (item.group === 'Commands' || item.group === 'Window Management' || item.group === 'Notes' || item.group === 'Snippets' || item.group === 'Workspaces' || item.group === 'Color Picker' || item.group === 'Windows Settings') {
            pool.push({ item, score: 1 });
          }
        }
      }
    }
    pool.sort((a, b) => b.score - a.score);
    return pool.slice(0, 24).map((e) => e.item);
  }

  async function search(query) {
    const q = String(query || '').trim();
    itemsById.clear();

    if (!q) {
      const items = defaultItems();
      for (const item of items) itemsById.set(item.id, item);
      return items;
    }


    // Universal Action Keyword Fast-Path Routing (PowerToys Run Parity)
    const prefixRes = await routePrefix(q, byId, itemsById);
    if (prefixRes) return prefixRes;

    const aliasTarget = aliasManager.resolveAlias(q);

    const scored = [];
    let pCount = 0;
    for (const p of providers) {
      let produced;
      try { produced = await p.search(q); } catch { produced = []; }
      if (++pCount % 8 === 0) {
        await new Promise((resolve) => setImmediate(resolve));
      }
      for (const item of produced || []) {
        const s = scoreItem(q, item);
        if (s === null && !item.scoreBoost && !aliasTarget) continue;
        let aliasBoost = 0;
        if (aliasTarget) {
          if (item.id === aliasTarget || (item.keywords && item.keywords.includes(aliasTarget)) || p.id === aliasTarget) {
            aliasBoost = 1000;
          }
        }
        scored.push({
          item,
          score: (s === null ? 0 : s) + (item.scoreBoost || 0) + aliasBoost + frecencyBoost(item.id)
        });
      }
    }
    scored.sort((a, b) => b.score - a.score);

    // Sectioned list: each group stays contiguous, and groups are ordered by
    // their best match so the strongest provider still leads.
    const buckets = new Map();
    for (const entry of scored) {
      const g = entry.item.group || 'Other';
      if (!buckets.has(g)) buckets.set(g, []);
      buckets.get(g).push(entry);
    }

    const CAPS = {
      Applications: 12,
      'Window Management': 8,
      'Script Commands': 8,
      'Process Manager': 8,
      'Developer Tools': 8,
      'Raycast AI': 6,
      'Emojis & Symbols': 6,
      Notes: 6,
      Files: 8,
      'Clipboard History': 8,
      Commands: 10,
      Calculator: 3,
      Snippets: 6,
      Quicklinks: 4,
      'Web Search': 4,
      Translator: 6,
      Dictionary: 6,
      'Raycast Focus': 6,
      Calendar: 6,
      MCP: 6,
      Contacts: 6,
      Run: 6,
      'Typing Practice': 4,
      Weather: 4,
      Navigation: 8,
      'Screen Awareness': 6,
      Dictation: 6,
      Games: 8,
      'Listening Ports': 6,
      'Git Repositories': 6,
      'Docker Containers': 6,
      'GitHub / GitLab': 6,
      'Audio Endpoints': 6,
      'Windows Services': 8,
      'Environment Variables': 6,
      'Software Updates': 6,
      'Hosts File': 6,
      'Now Playing': 4,
      'Browser Bookmarks': 6,
      Workspaces: 6,
      'Color Picker': 6,
      'Task Manager': 8,
      'Wi-Fi': 6,
      'Power & Battery': 6,
      'Virtual Desktops': 4,
      'Disk Cleanup': 6,
      Reminders: 6,
      Bitwarden: 6,
      Utilities: 6,
      Terminal: 6,
      Projects: 6,
      Spotify: 6,
      'AI Commands': 6,
      Extensions: 6,
      'Windows Settings': 8,
      Registry: 8,
      'VS Code Workspaces': 8,
      'Window Walker': 8,
      'System Diagnostics': 6,
      'Time & Chronometrics': 6,
      'WSL Distributions': 8,
      'Bluetooth Devices': 8,
      'DNS Presets': 6,
      'Extensions (Sandboxed)': 6
    };
    const ordered = [...buckets.entries()]
      .map(([group, entries]) => ({ group, entries, best: entries[0].score }))
      .sort((a, b) => b.best - a.best);

    const out = [];
    for (const { group, entries } of ordered) {
      const cap = CAPS[group] ?? 8;
      for (const { item } of entries.slice(0, cap)) {
        out.push(item);
        if (out.length >= 50) break;
      }
      if (out.length >= 50) break;
    }

    // Fallback commands when 0 results matched
    if (out.length === 0) {
      const fallbacks = fallbackManager.getFallbackItems(q, {
        invokeAi: (prompt) => ai.ask(prompt),
        invokeTranslator: (text) => translator.translate(text, 'es'),
        invokeRun: (cmd) => windowsRun.runCommand(cmd)
      });
      for (const f of fallbacks) {
        out.push(f);
      }
    }

    for (const item of out) itemsById.set(item.id, item);
    return out;
  }

  async function execute(id, actionId) {
    const item = itemsById.get(id);
    if (!item) return { ok: false, error: 'unknown item' };
    const action = (item.actions || []).find((a) => a.id === actionId) || (item.actions || [])[0];
    if (!action || typeof action.run !== 'function') return { ok: false, error: 'no action' };
    const result = await action.run();
    remember(item.id);
    return result === undefined ? { ok: true } : result;
  }

  async function warm() {
    for (const p of providers) {
      if (typeof p.warm === 'function') {
        try { await p.warm(); } catch { /* provider is optional */ }
      }
    }
  }

  function dispose() {
    for (const p of providers) if (typeof p.dispose === 'function') p.dispose();
    store.flush();
  }

  return {
    search, execute, warm, dispose,
    getItem: (id) => itemsById.get(id),
    list: () => providers.map((p) => ({ id: p.id, name: p.name })),
    counts: () => Object.fromEntries(providers.map((p) => [p.id, (p.all() || []).length]))
  };
}

module.exports = { createRegistry, evaluateExpression, fuzzy };
