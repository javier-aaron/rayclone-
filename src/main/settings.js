'use strict';

const path = require('node:path');
const store = require('./store');

const DEFAULT_SETTINGS = {
  hotkey: 'Alt+Space',
  theme: 'dark',
  accentColor: '#ff6363',
  showPreview: true,
  aiProvider: 'ollama',
  aiEndpoint: 'http://localhost:11434',
  aiModel: 'llama3.2',
  aiApiKey: '',
  clipboardLimit: 250,
  scriptsDir: '',
  targetLanguage: 'es',
  focusDuration: 25,
  focusBreak: 5,
  soundEffects: true
};

let currentSettings = { ...DEFAULT_SETTINGS };

function init(userDataPath) {
  const loaded = store.read('settings', {});
  currentSettings = { ...DEFAULT_SETTINGS, ...loaded };
  if (!currentSettings.scriptsDir) {
    currentSettings.scriptsDir = path.join(userDataPath, 'scripts');
  }
}

function getSettings() {
  return { ...currentSettings };
}

function updateSettings(patch) {
  currentSettings = { ...currentSettings, ...patch };
  store.write('settings', currentSettings);
  return { ...currentSettings };
}

module.exports = {
  init,
  getSettings,
  updateSettings,
  DEFAULT_SETTINGS
};
