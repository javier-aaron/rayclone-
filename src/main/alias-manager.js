'use strict';

const store = require('./store');

const DEFAULT_ALIASES = {
  gr: 'git-indexer',
  kp: 'kill-port',
  d: 'docker',
  c: 'calculator',
  cp: 'color-picker',
  ps: 'task-manager',
  wifi: 'wifi-switcher',
  pwr: 'power-manager',
  note: 'notes',
  clip: 'clipboard'
};

const DEFAULT_HOTKEYS = {
  'Alt+Shift+G': { itemId: 'git-indexer', title: 'Open Git Repositories' },
  'Alt+Shift+P': { itemId: 'kill-port', title: 'Kill Port Inspector' },
  'Alt+Shift+C': { itemId: 'color-picker', title: 'Pick Screen Color' }
};

let aliases = { ...DEFAULT_ALIASES };
let hotkeys = { ...DEFAULT_HOTKEYS };

function init() {
  const loadedAliases = store.read('aliases', null);
  if (loadedAliases && typeof loadedAliases === 'object') {
    aliases = { ...DEFAULT_ALIASES, ...loadedAliases };
  } else {
    store.write('aliases', aliases);
  }

  const loadedHotkeys = store.read('hotkeys', null);
  if (loadedHotkeys && typeof loadedHotkeys === 'object') {
    hotkeys = { ...DEFAULT_HOTKEYS, ...loadedHotkeys };
  } else {
    store.write('hotkeys', hotkeys);
  }
}

function getAliases() {
  return { ...aliases };
}

function setAlias(alias, itemId) {
  if (!alias || !itemId) return false;
  const clean = String(alias).trim().toLowerCase();
  aliases[clean] = String(itemId).trim();
  store.write('aliases', aliases);
  return true;
}

function removeAlias(alias) {
  const clean = String(alias).trim().toLowerCase();
  if (clean in aliases) {
    delete aliases[clean];
    store.write('aliases', aliases);
    return true;
  }
  return false;
}

function resolveAlias(query) {
  if (!query) return null;
  const clean = String(query).trim().toLowerCase();
  return aliases[clean] || null;
}

function getHotkeys() {
  return { ...hotkeys };
}

function setHotkey(accelerator, itemId, title) {
  if (!accelerator || !itemId) return false;
  const clean = String(accelerator).trim();
  hotkeys[clean] = { itemId: String(itemId).trim(), title: title || itemId };
  store.write('hotkeys', hotkeys);
  return true;
}

function removeHotkey(accelerator) {
  const clean = String(accelerator).trim();
  if (clean in hotkeys) {
    delete hotkeys[clean];
    store.write('hotkeys', hotkeys);
    return true;
  }
  return false;
}

function registerGlobalHotkeys(electronGlobalShortcut, onTrigger) {
  if (!electronGlobalShortcut || typeof electronGlobalShortcut.register !== 'function') {
    return { registered: 0, failed: [] };
  }
  let registered = 0;
  const failed = [];
  for (const [accelerator, def] of Object.entries(hotkeys)) {
    try {
      const ok = electronGlobalShortcut.register(accelerator, () => {
        if (typeof onTrigger === 'function') {
          onTrigger(def.itemId, def);
        }
      });
      if (ok) registered++;
      else failed.push(accelerator);
    } catch (e) {
      failed.push(accelerator);
    }
  }
  return { registered, failed };
}

init();

module.exports = {
  init,
  getAliases,
  setAlias,
  removeAlias,
  resolveAlias,
  getHotkeys,
  setHotkey,
  removeHotkey,
  registerGlobalHotkeys,
  DEFAULT_ALIASES,
  DEFAULT_HOTKEYS
};
