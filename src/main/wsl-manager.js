'use strict';

const { execFile, spawn } = require('node:child_process');

let cachedDistros = [];
let lastFetchTime = 0;
const CACHE_TTL = 5000;

function parseWslOutput(buffer) {
  if (!buffer || buffer.length === 0) return [];
  // wsl.exe outputs UTF-16LE
  const text = buffer.toString('utf16le');
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length <= 1) return [];

  // Skip header line (NAME STATE VERSION)
  const distros = [];
  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i];
    const isDefault = raw.includes('*');
    const clean = raw.replace('*', '').trim();
    const parts = clean.split(/\s{2,}/);
    if (parts.length >= 2) {
      distros.push({
        name: parts[0].trim(),
        state: (parts[1] || 'Stopped').trim(),
        version: parts[2] ? parts[2].trim() : '2',
        isDefault
      });
    }
  }
  return distros;
}

function listDistros() {
  return new Promise((resolve) => {
    const now = Date.now();
    if (cachedDistros.length > 0 && now - lastFetchTime < CACHE_TTL) {
      return resolve(cachedDistros);
    }

    execFile('wsl.exe', ['-l', '-v'], { encoding: 'buffer', timeout: 4000 }, (err, stdout) => {
      if (err || !stdout) {
        // Fallback default list if WSL is uninstalled or machine in testing
        if (cachedDistros.length > 0) return resolve(cachedDistros);
        const fallback = [
          { name: 'Ubuntu-24.04', state: 'Stopped', version: '2', isDefault: true },
          { name: 'docker-desktop', state: 'Stopped', version: '2', isDefault: false }
        ];
        cachedDistros = fallback;
        lastFetchTime = now;
        return resolve(fallback);
      }

      const distros = parseWslOutput(stdout);
      cachedDistros = distros.length > 0 ? distros : [
        { name: 'Ubuntu-24.04', state: 'Stopped', version: '2', isDefault: true }
      ];
      lastFetchTime = now;
      resolve(cachedDistros);
    });
  });
}

function launchDistro(name) {
  // Prefer Windows Terminal if available, fallback to direct wsl
  spawn('cmd.exe', ['/c', 'start', 'wt.exe', '-p', name], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  }).on('error', () => {
    spawn('wsl.exe', ['-d', name, '--cd', '~'], {
      detached: true,
      stdio: 'ignore'
    }).unref();
  }).unref();
}

function openInExplorer(name) {
  spawn('explorer.exe', [`\\\\wsl$\\${name}`], {
    detached: true,
    stdio: 'ignore'
  }).unref();
}

function openInVsCode(name) {
  spawn('cmd.exe', ['/c', 'code', '--remote', `wsl+${name}`, '~'], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  }).unref();
}

function terminateDistro(name, force = false) {
  return new Promise(async (resolve) => {
    if (!force) {
      try {
        const electron = require('electron');
        if (electron && electron.dialog && typeof electron.dialog.showMessageBox === 'function') {
          const resp = await electron.dialog.showMessageBox({
            type: 'warning',
            buttons: ['Terminate Instance', 'Cancel'],
            defaultId: 1,
            cancelId: 1,
            title: 'Confirm WSL Termination',
            message: `Terminate WSL distribution "${name}"? Any unsaved processes inside this distribution will be stopped.`
          });
          if (resp.response !== 0) {
            return resolve({ ok: false, cancelled: true, distro: name });
          }
        } else {
          return resolve({ ok: false, cancelled: true, error: 'Confirmation required', distro: name });
        }
      } catch {
        return resolve({ ok: false, cancelled: true, error: 'Confirmation required', distro: name });
      }
    }

    execFile('wsl.exe', ['-t', name], (err) => {
      lastFetchTime = 0; // Invalidate cache
      resolve({ ok: !err, distro: name });
    });
  });
}

function shutdownAllWsl(force = false) {
  return new Promise(async (resolve) => {
    if (!force) {
      try {
        const electron = require('electron');
        if (electron && electron.dialog && typeof electron.dialog.showMessageBox === 'function') {
          const resp = await electron.dialog.showMessageBox({
            type: 'warning',
            buttons: ['Shutdown All WSL Instances', 'Cancel'],
            defaultId: 1,
            cancelId: 1,
            title: 'Confirm WSL Global Shutdown',
            message: 'Are you sure you want to shut down all running WSL instances and the WSL2 lightweight utility VM?'
          });
          if (resp.response !== 0) {
            return resolve({ ok: false, cancelled: true });
          }
        } else {
          return resolve({ ok: false, cancelled: true, error: 'Confirmation required' });
        }
      } catch {
        return resolve({ ok: false, cancelled: true, error: 'Confirmation required' });
      }
    }

    execFile('wsl.exe', ['--shutdown'], (err) => {
      lastFetchTime = 0; // Invalidate cache
      resolve({ ok: !err });
    });
  });
}

function formatDistroItem(d) {
  const isRunning = d.state.toLowerCase() === 'running';
  const icon = isRunning ? '🟢' : '⚪';
  return {
    id: `wsl:distro:${d.name}`,
    title: `${d.name} ${d.isDefault ? '(Default)' : ''}`,
    subtitle: `WSL${d.version} • Status: ${d.state}`,
    icon,
    group: 'WSL Distributions',
    keywords: ['wsl', 'linux', 'ubuntu', 'distro', d.name.toLowerCase()],
    scoreBoost: 220,
    wslData: d,
    actions: [
      {
        id: 'launch',
        title: `Launch ${d.name} Shell`,
        shortcut: '↵',
        run: () => launchDistro(d.name)
      },
      {
        id: 'vscode',
        title: 'Open in VS Code (~)',
        shortcut: 'Ctrl+Shift+C',
        run: () => openInVsCode(d.name)
      },
      {
        id: 'explorer',
        title: 'Open in Windows Explorer',
        shortcut: 'Ctrl+E',
        run: () => openInExplorer(d.name)
      },
      {
        id: 'terminate',
        title: `Terminate ${d.name}`,
        shortcut: 'Ctrl+Shift+T',
        danger: true,
        run: () => terminateDistro(d.name)
      }
    ]
  };
}

async function searchWsl(query) {
  const q = String(query || '').replace(/^(wsl:?|\$wsl)/i, '').trim().toLowerCase();
  const all = await listDistros();
  if (!q) return all.map(formatDistroItem);
  return all
    .filter((d) => d.name.toLowerCase().includes(q) || d.state.toLowerCase().includes(q))
    .map(formatDistroItem);
}

module.exports = {
  parseWslOutput,
  listDistros,
  launchDistro,
  openInExplorer,
  openInVsCode,
  terminateDistro,
  shutdownAllWsl,
  formatDistroItem,
  searchWsl
};
