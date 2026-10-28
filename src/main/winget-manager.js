'use strict';

const { execFile, spawn } = require('node:child_process');

let cachedUpgrades = [];
let lastScan = 0;
const CACHE_TTL_MS = 30000;

const SAMPLE_UPGRADES = [];

/**
 * Parses fixed-width or column-aligned tabular output from `winget upgrade`.
 */
function parseUpgradeTable(stdout) {
  const lines = String(stdout || '').split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const headerIdx = lines.findIndex((l) => l.includes('Name') && l.includes('Id') && l.includes('Version'));
  if (headerIdx === -1 || headerIdx >= lines.length - 1) return [];

  const header = lines[headerIdx];
  const idPos = header.indexOf('Id');
  const verPos = header.indexOf('Version');
  const availPos = header.indexOf('Available');
  const srcPos = header.indexOf('Source');

  const results = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('-') || line.trim().length === 0) continue;

    let name = '', id = '', version = '', available = '', source = 'winget';
    const parts = line.trim().split(/\s{2,}/);
    if (parts.length >= 4) {
      name = parts[0];
      id = parts[1];
      version = parts[2];
      available = parts[3];
      source = parts[4] || 'winget';
    } else if (idPos !== -1 && verPos !== -1 && availPos !== -1) {
      name = line.slice(0, idPos).trim();
      id = line.slice(idPos, verPos).trim();
      version = line.slice(verPos, availPos).trim();
      available = srcPos !== -1 ? line.slice(availPos, srcPos).trim() : line.slice(availPos).trim();
      source = srcPos !== -1 ? line.slice(srcPos).trim() : 'winget';
    }

    // Safety cleanup: ensure package ID has no whitespace and doesn't capture version characters
    if (/\s+/.test(id)) {
      const idParts = id.split(/\s+/);
      id = idParts[0];
      if (idParts.length > 1) {
        version = (idParts.slice(1).join(' ') + ' ' + version).trim();
      }
    }

    if (id && available) {
      results.push({
        name: name || id,
        id,
        currentVersion: version,
        availableVersion: available,
        source
      });
    }
  }
  return results;
}

function formatDiff(item) {
  if (!item) return '';
  return `${item.currentVersion} -> ${item.availableVersion}`;
}

function buildUpgradeCmd(id) {
  return `winget upgrade --id ${id} --accept-source-agreements --accept-package-agreements`;
}

function buildUpgradeAllCmd() {
  return 'winget upgrade --all --accept-source-agreements --accept-package-agreements';
}

/**
 * Checks if winget CLI is present on PATH.
 */
function checkWingetAvailable() {
  return new Promise((resolve) => {
    execFile('where.exe', ['winget'], { windowsHide: true }, (err, stdout) => {
      resolve(!err && !!stdout && stdout.trim().length > 0);
    });
  });
}

/**
 * Scans host system for available winget package upgrades.
 */
function scanUpgrades(force = false) {
  const now = Date.now();
  if (!force && now - lastScan < CACHE_TTL_MS && lastScan > 0) {
    return Promise.resolve(cachedUpgrades);
  }

  return new Promise((resolve) => {
    execFile(
      'winget.exe',
      ['upgrade', '--include-unknown'],
      { windowsHide: true, timeout: 15000 },
      (err, stdout) => {
        lastScan = Date.now();
        if (!err && stdout) {
          const parsed = parseUpgradeTable(stdout);
          cachedUpgrades = parsed;
          return resolve(cachedUpgrades);
        }

        // Mock fallback only if explicitly requested in test environments
        if (err && process.env.RAYCLONE_MOCK_WINGET === '1') {
          cachedUpgrades = JSON.parse(JSON.stringify(SAMPLE_UPGRADES));
          return resolve(cachedUpgrades);
        }

        cachedUpgrades = [];
        resolve(cachedUpgrades);
      }
    );
  });
}

/**
 * Launches winget upgrade for a specific package in a terminal window.
 */
function executeUpgrade(id) {
  const cmd = buildUpgradeCmd(id);
  return new Promise((resolve) => {
    try {
      const child = spawn('cmd.exe', ['/c', `start wt.exe -p "Command Prompt" cmd.exe /k "${cmd}"`], {
        detached: true,
        stdio: 'ignore',
        windowsHide: false
      });
      child.on('error', () => {
        // Fallback to standard cmd.exe start
        spawn('cmd.exe', ['/c', `start cmd.exe /k "${cmd}"`], { detached: true, stdio: 'ignore' });
      });
      child.unref();
      resolve({ ok: true, command: cmd });
    } catch {
      resolve({ ok: false, error: 'Failed to launch terminal for upgrade' });
    }
  });
}

function getCachedUpgrades() {
  return cachedUpgrades;
}

module.exports = {
  parseUpgradeTable,
  formatDiff,
  buildUpgradeCmd,
  buildUpgradeAllCmd,
  checkWingetAvailable,
  scanUpgrades,
  executeUpgrade,
  getCachedUpgrades,
  SAMPLE_UPGRADES
};
