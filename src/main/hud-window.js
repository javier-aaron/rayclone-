'use strict';

const path = require('node:path');

let electron = null;
try {
  electron = require('electron');
} catch {}

const BrowserWindow = electron?.BrowserWindow;

const HUD_WINDOW_OPTIONS = {
  width: 380,
  height: 440,
  frame: false,
  transparent: true,
  alwaysOnTop: true,
  resizable: true,
  skipTaskbar: false,
  hasShadow: false,
  show: false,
  backgroundColor: '#00000000'
};

const HOTKEY = 'Ctrl+Shift+D';

/**
 * Creates a mock HUD manager for headless tests and verification suites.
 */
function createMockHudManager() {
  let isOpen = false;
  let isDestroyed = false;
  let currentPayload = null;

  return {
    hotkey: HOTKEY,
    windowOptions: { ...HUD_WINDOW_OPTIONS },
    isOpen: () => isOpen,
    isDestroyed: () => isDestroyed,
    getPayload: () => currentPayload,
    detach(payload) {
      if (!payload) {
        payload = { type: 'note', title: 'Scratchpad', content: '' };
      }
      currentPayload = payload;
      isOpen = true;
      isDestroyed = false;
      return { ok: true, detached: true, payload };
    },
    toggle() {
      isOpen = !isOpen;
      return { ok: true, isOpen };
    },
    close() {
      isOpen = false;
      isDestroyed = true;
      return { ok: true };
    }
  };
}

/**
 * Real HUD Window controller running in Electron main process.
 */
class HudWindowManager {
  constructor() {
    this.hotkey = HOTKEY;
    this.windowOptions = { ...HUD_WINDOW_OPTIONS };
    this.hudWin = null;
    this.currentPayload = { type: 'note', title: 'Scratchpad', content: '' };
  }

  createWindow() {
    if (!BrowserWindow) return null;

    this.hudWin = new BrowserWindow({
      ...this.windowOptions,
      webPreferences: {
        preload: path.join(__dirname, '..', 'preload', 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        spellcheck: false
      }
    });

    this.hudWin.setAlwaysOnTop(true, 'screen-saver');
    this.hudWin.setVisibleOnAllWorkspaces?.(true, { visibleOnFullScreen: true });

    const htmlPath = path.join(__dirname, '..', 'renderer', 'index.html');
    this.hudWin.loadFile(htmlPath, { query: { mode: 'hud' } });

    this.hudWin.webContents.on('did-finish-load', () => {
      if (this.currentPayload) {
        this.hudWin.webContents.send('hud:load', this.currentPayload);
      }
    });

    this.hudWin.on('closed', () => {
      this.hudWin = null;
    });

    return this.hudWin;
  }

  isOpen() {
    return Boolean(this.hudWin && !this.hudWin.isDestroyed() && this.hudWin.isVisible());
  }

  isDestroyed() {
    return Boolean(!this.hudWin || this.hudWin.isDestroyed());
  }

  getPayload() {
    return this.currentPayload;
  }

  detach(payload) {
    if (!payload) {
      payload = { type: 'note', title: 'Scratchpad', content: '' };
    }
    this.currentPayload = payload;

    if (!BrowserWindow) {
      // Headless fallback
      return { ok: true, detached: true, payload };
    }

    if (!this.hudWin || this.hudWin.isDestroyed()) {
      this.createWindow();
    }

    if (this.hudWin.webContents.isLoading()) {
      this.hudWin.webContents.once('did-finish-load', () => {
        this.hudWin.webContents.send('hud:load', this.currentPayload);
      });
    } else {
      this.hudWin.webContents.send('hud:load', this.currentPayload);
    }

    this.hudWin.show();
    this.hudWin.focus();

    return { ok: true, detached: true, payload };
  }

  toggle() {
    if (!BrowserWindow) {
      return { ok: true, isOpen: false };
    }

    if (this.isOpen()) {
      this.hudWin.hide();
      return { ok: true, isOpen: false };
    }

    if (!this.hudWin || this.hudWin.isDestroyed()) {
      this.detach(this.currentPayload);
      return { ok: true, isOpen: true };
    }

    this.hudWin.show();
    this.hudWin.focus();
    return { ok: true, isOpen: true };
  }

  close() {
    if (this.hudWin && !this.hudWin.isDestroyed()) {
      this.hudWin.close();
      this.hudWin = null;
    }
    return { ok: true };
  }
}

const hudInstance = new HudWindowManager();

module.exports = {
  HOTKEY,
  HUD_WINDOW_OPTIONS,
  createMockHudManager,
  HudWindowManager,
  hudManager: hudInstance,
  // Delegation helpers for direct consumption
  detach: (payload) => hudInstance.detach(payload),
  toggle: () => hudInstance.toggle(),
  close: () => hudInstance.close(),
  isOpen: () => hudInstance.isOpen(),
  isDestroyed: () => hudInstance.isDestroyed(),
  getPayload: () => hudInstance.getPayload()
};
