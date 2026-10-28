'use strict';

const {
  app, BrowserWindow, globalShortcut, ipcMain, screen,
  Tray, Menu, nativeImage, shell
} = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const { createRegistry } = require('./providers');
const store = require('./store');
const settings = require('./settings');
const scriptsManager = require('./scripts-manager');
const preview = require('./preview');
const hudWindow = require('./hud-window');
const aliasManager = require('./alias-manager');

let winWidth = 960;
let winHeight = 500;
const TOP_RATIO = 0.16;

const gpuDisabled = app.commandLine.hasSwitch('disable-gpu')
  || process.argv.includes('--disable-gpu')
  || process.env.RAYCLONE_DISABLE_GPU === '1';
if (gpuDisabled) {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-gpu-compositing');
}

app.commandLine.appendSwitch('disable-features', 'WebGPU,Vulkan,DawnGraphite');

const HOTKEY_CANDIDATES = ['Alt+Space', 'Control+Space', 'Alt+Shift+Space'];

let win = null;
let tray = null;
let registry = null;
let activeHotkey = null;
let quitting = false;
let lastShown = 0;

const iconCache = new Map();

async function iconForFile(filePath) {
  if (iconCache.has(filePath)) return iconCache.get(filePath);
  let value = null;
  try {
    const img = await app.getFileIcon(filePath, { size: 'normal' });
    if (img && !img.isEmpty()) value = img.toDataURL();
  } catch { /* no icon available */ }
  iconCache.set(filePath, value);
  return value;
}

function updateWindowDimensions(showPreview) {
  winWidth = showPreview ? 960 : 750;
  winHeight = showPreview ? 500 : 480;
  reposition();
}

function createWindow() {
  const currentSettings = settings.getSettings();
  winWidth = currentSettings.showPreview ? 960 : 750;
  winHeight = currentSettings.showPreview ? 500 : 480;

  const { workArea } = screen.getPrimaryDisplay();
  const x = Math.round(workArea.x + (workArea.width - winWidth) / 2);
  const y = Math.round(workArea.y + Math.max(60, workArea.height * TOP_RATIO));

  win = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    x,
    y,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false
    }
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  win.on('blur', () => {
    if (process.env.RAYCLONE_NO_AUTOHIDE === '1') return;
    if (!win.webContents.isDevToolsOpened()) hideWindow();
  });

  win.on('close', (e) => {
    if (!quitting) { e.preventDefault(); hideWindow(); }
  });

  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'Escape') { event.preventDefault(); hideWindow(); }
    if (input.key === 'F12') { win.webContents.toggleDevTools(); }
    if (input.key === 'r' && input.control) { event.preventDefault(); win.webContents.reload(); }
  });

  screen.on('display-metrics-changed', reposition);
  screen.on('display-added', reposition);
  screen.on('display-removed', reposition);
}

function reposition() {
  if (!win || win.isDestroyed()) return;
  const { workArea } = screen.getPrimaryDisplay();
  win.setBounds({
    x: Math.round(workArea.x + (workArea.width - winWidth) / 2),
    y: Math.round(workArea.y + Math.max(60, workArea.height * TOP_RATIO)),
    width: winWidth,
    height: winHeight
  });
}

function showWindow() {
  if (!win || win.isDestroyed()) return;
  reposition();
  win.show();
  win.focus();
  lastShown = Date.now();
  win.webContents.send('launcher:shown');
}

function hideWindow() {
  if (!win || win.isDestroyed()) return;
  if (Date.now() - lastShown < 150) return;
  win.hide();
  win.webContents.send('launcher:hidden');
}

function toggleWindow() {
  if (!win || win.isDestroyed()) return;
  if (win.isVisible()) hideWindow();
  else showWindow();
}

function registerHudShortcut() {
  try {
    globalShortcut.register('Ctrl+Shift+D', () => {
      if (win && !win.isDestroyed() && win.isVisible() && win.isFocused()) {
        win.webContents.send('hud:request-detach');
      } else {
        hudWindow.toggle();
      }
    });
  } catch {}
}

function applyHotkey(requestedHotkey) {
  try { globalShortcut.unregisterAll(); } catch {}
  const list = [];
  if (requestedHotkey) list.push(requestedHotkey);
  for (const c of HOTKEY_CANDIDATES) {
    if (!list.includes(c)) list.push(c);
  }

  for (const accel of list) {
    try {
      if (globalShortcut.register(accel, toggleWindow)) {
        activeHotkey = accel;
        if (tray) tray.setToolTip(`Rayclone — ${activeHotkey}`);
        registerHudShortcut();
        aliasManager.registerGlobalHotkeys(globalShortcut, (itemId) => {
          showWindow();
          if (win && !win.isDestroyed()) {
            win.webContents.send('launcher:jump-to', itemId);
          }
        });
        return { ok: true, hotkey: accel };
      }
    } catch { /* try next */ }
  }
  activeHotkey = null;
  if (tray) tray.setToolTip('Rayclone — Hotkey unavailable');
  registerHudShortcut();
  aliasManager.registerGlobalHotkeys(globalShortcut, (itemId) => {
    showWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('launcher:jump-to', itemId);
    }
  });
  return { ok: false, error: 'Could not register any hotkey' };
}

function trayImage() {
  const candidates = [
    path.join(__dirname, '..', '..', 'build', 'tray.png'),
    path.join(__dirname, '..', '..', 'build', 'icon.png')
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      const img = nativeImage.createFromPath(p);
      if (!img.isEmpty()) return img.resize({ width: 16, height: 16 });
    }
  }
  return nativeImage.createEmpty();
}

function createTray() {
  tray = new Tray(trayImage());
  tray.setToolTip(activeHotkey ? `Rayclone — ${activeHotkey}` : 'Rayclone');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Rayclone', click: showWindow },
    { label: activeHotkey ? `Hotkey: ${activeHotkey}` : 'Hotkey unavailable', enabled: false },
    { type: 'separator' },
    { label: 'Settings', click: () => { showWindow(); win.webContents.send('launcher:open-settings'); } },
    { label: 'Open Scripts Folder', click: () => shell.openPath(settings.getSettings().scriptsDir) },
    { label: 'Open Data Folder', click: () => shell.openPath(app.getPath('userData')) },
    { type: 'separator' },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } }
  ]));
  tray.on('click', toggleWindow);
}

function toWireItem(item) {
  return {
    id: item.id,
    group: item.group || 'Results',
    title: item.title || '',
    subtitle: item.subtitle || '',
    icon: item.icon
      ? (item.icon.kind === 'data'
        ? { kind: 'data', value: item.icon.value }
        : { kind: 'glyph', name: item.icon.name || 'bolt' })
      : null,
    actions: (item.actions || []).map((a) => ({
      id: a.id,
      title: a.title,
      shortcut: a.shortcut || ''
    }))
  };
}

function resolveIcons(items) {
  return Promise.all(items.map(async (item) => {
    if (item.icon && item.icon.kind === 'file') {
      const dataUrl = await iconForFile(item.icon.path);
      if (dataUrl) return { ...item, icon: { kind: 'data', value: dataUrl } };
      return { ...item, icon: { kind: 'glyph', name: item.icon.fallback || 'app' } };
    }
    return item;
  }));
}

// ---------------------------------------------------------------- IPC

ipcMain.handle('search', async (_e, query) => {
  try {
    const raw = await registry.search(String(query ?? ''));
    const items = await resolveIcons(raw.slice(0, 60));
    return { ok: true, items: items.map(toWireItem), total: raw.length };
  } catch (err) {
    return { ok: false, error: String(err && err.message || err), items: [] };
  }
});

ipcMain.handle('execute', async (_e, { id, actionId }) => {
  try {
    const result = await registry.execute(id, actionId);
    if (result && result.openSettings) {
      win.webContents.send('launcher:open-settings');
      return { ok: true, openSettings: true };
    }
    if (!result || result.hide !== false) hideWindow();
    return { ok: true, result };
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  }
});

ipcMain.handle('preview:get', async (_e, id) => {
  try {
    const item = registry.getItem(id);
    if (!item) return null;
    return await preview.getPreviewForItem(item);
  } catch {
    return null;
  }
});

ipcMain.handle('settings:get', () => {
  return settings.getSettings();
});

ipcMain.handle('settings:update', (_e, patch) => {
  try {
    const updated = settings.updateSettings(patch);
    if (patch.hotkey) {
      applyHotkey(patch.hotkey);
    }
    if (patch.showPreview !== undefined) {
      updateWindowDimensions(patch.showPreview);
    }
    win.webContents.send('settings:changed', updated);
    return { ok: true, settings: updated, activeHotkey };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('settings:validate-hotkey', (_e, key) => {
  try {
    const ok = globalShortcut.register(key, () => {});
    if (ok) globalShortcut.unregister(key);
    return { ok };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('hide', () => { hideWindow(); return { ok: true }; });
ipcMain.handle('quit', () => { quitting = true; app.quit(); });

ipcMain.handle('hud:detach', (_e, payload) => {
  try {
    const res = hudWindow.detach(payload);
    hideWindow();
    return res;
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('hud:close', () => {
  return hudWindow.close();
});

ipcMain.handle('hud:get-payload', () => {
  return hudWindow.getPayload();
});

ipcMain.handle('info', () => ({
  ok: true,
  version: app.getVersion(),
  hotkey: activeHotkey,
  providers: registry.list(),
  counts: registry.counts()
}));

// ---------------------------------------------------------------- self-test runner
if (process.argv.includes('--self-test') || app.commandLine.hasSwitch('self-test')) {
  app.whenReady().then(async () => {
    try {
      console.log('=== Electron Runtime Self-Test ===');
      const { clipboard, dialog, shell } = require('electron');
      const testString = `rayclone-self-test-${Date.now()}`;
      clipboard.writeText(testString);
      await new Promise((r) => setTimeout(r, 200));
      let readBack = clipboard.readText();
      if (readBack instanceof Promise) {
        readBack = await readBack;
      }
      if (readBack !== testString) {
        throw new Error(`Clipboard mismatch: wrote "${testString}", got "${readBack}"`);
      }
      console.log('✓ Electron native clipboard verified:', readBack);

      if (typeof dialog.showMessageBox !== 'function') throw new Error('dialog.showMessageBox missing');
      console.log('✓ Electron native dialog verified');

      if (typeof shell.openExternal !== 'function') throw new Error('shell.openExternal missing');
      console.log('✓ Electron native shell verified');

      console.log('All Electron runtime self-test checks passed.');
      app.exit(0);
    } catch (err) {
      console.error('Electron self-test failure:', err);
      app.exit(1);
    }
  });
} else if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showWindow);

  app.whenReady().then(async () => {
    app.setAppUserModelId('tools.rayclone.launcher');
    const userDataPath = app.getPath('userData');
    store.init(userDataPath);
    settings.init(userDataPath);
    scriptsManager.init(settings.getSettings().scriptsDir);

    registry = createRegistry({ userDataPath });
    createWindow();
    createTray();
    applyHotkey(settings.getSettings().hotkey);

    if (tray) tray.setToolTip(activeHotkey ? `Rayclone — ${activeHotkey}` : 'Rayclone');
    registry.warm().catch(() => {});
    showWindow();
  });

  app.on('window-all-closed', (e) => e.preventDefault());
  app.on('will-quit', () => {
    quitting = true;
    globalShortcut.unregisterAll();
    hudWindow.close();
    if (registry) registry.dispose();
  });
}
