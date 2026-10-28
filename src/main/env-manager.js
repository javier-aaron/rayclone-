'use strict';

const fs = require('node:fs');
const { execFile, spawn } = require('node:child_process');
const { clipboard } = require('electron');

let cachedVariables = [];
let lastScan = 0;
const CACHE_TTL_MS = 5000;

/**
 * Splits a PATH string into validated individual directory segments.
 * Trims whitespace, strips wrapping quotes, removes redundant semicolons,
 * deduplicates repeated paths, and checks filesystem existence via fs.existsSync.
 */
function parsePathEntries(pathValue) {
  if (!pathValue || typeof pathValue !== 'string') return [];
  const rawSegments = pathValue.split(';').map((s) => s.trim().replace(/^"(.*)"$/, '$1').trim()).filter(Boolean);
  const seen = new Set();
  const results = [];

  for (const seg of rawSegments) {
    if (seen.has(seg)) continue;
    seen.add(seg);
    let exists = false;
    try {
      exists = fs.existsSync(seg);
    } catch {
      exists = false;
    }
    results.push({ path: seg, exists });
  }

  return results;
}

/**
 * Filters environment variables matching a query (case-insensitive) across names and values.
 */
function filterEnv(envMap, query) {
  const q = String(query || '').toLowerCase().trim();
  let entries = [];

  if (Array.isArray(envMap)) {
    entries = envMap;
  } else if (envMap && typeof envMap === 'object') {
    entries = Object.entries(envMap).map(([key, value]) => ({
      name: key,
      value: String(value || ''),
      scope: key.startsWith('USER_') || key.startsWith('user_') ? 'User' : 'Machine'
    }));
  }

  if (!q) return entries;
  const filtered = entries.filter((e) =>
    (e.name && e.name.toLowerCase().includes(q)) ||
    (e.value && e.value.toLowerCase().includes(q))
  );

  filtered.sort((a, b) => {
    const aName = (a.name || '').toLowerCase();
    const bName = (b.name || '').toLowerCase();
    const aExact = aName === q;
    const bExact = bName === q;
    if (aExact && !bExact) return -1;
    if (!aExact && bExact) return 1;
    const aStarts = aName.startsWith(q);
    const bStarts = bName.startsWith(q);
    if (aStarts && !bStarts) return -1;
    if (!aStarts && bStarts) return 1;
    return aName.localeCompare(bName);
  });

  return filtered;
}

/**
 * Loads User and Machine environment variables via PowerShell [System.Environment].
 */
function getEnvVariables(force = false) {
  const now = Date.now();
  if (!force && now - lastScan < CACHE_TTL_MS && cachedVariables.length > 0) {
    return Promise.resolve(cachedVariables);
  }

  const psCmd = `
    $u = [System.Environment]::GetEnvironmentVariables('User')
    $m = [System.Environment]::GetEnvironmentVariables('Machine')
    [PSCustomObject]@{ User = $u; Machine = $m } | ConvertTo-Json -Compress
  `;

  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-Command', psCmd],
      { windowsHide: true, maxBuffer: 10 * 1024 * 1024, timeout: 5000 },
      (err, stdout) => {
        const results = [];
        if (!err && stdout && stdout.trim()) {
          try {
            const raw = JSON.parse(stdout);
            if (raw.User) {
              for (const [k, v] of Object.entries(raw.User)) {
                results.push({ name: k, value: String(v || ''), scope: 'User' });
              }
            }
            if (raw.Machine) {
              for (const [k, v] of Object.entries(raw.Machine)) {
                results.push({ name: k, value: String(v || ''), scope: 'Machine' });
              }
            }
          } catch {}
        }

        if (results.length === 0) {
          // Fallback to process.env
          for (const [k, v] of Object.entries(process.env)) {
            const isUser = k.startsWith('USER') || k === 'TEMP' || k === 'TMP' || k === 'APPDATA' || k === 'LOCALAPPDATA';
            results.push({
              name: k,
              value: String(v || ''),
              scope: isUser ? 'User' : 'Machine'
            });
          }
        }

        // Sort alphabetically by variable name
        results.sort((a, b) => a.name.localeCompare(b.name));
        cachedVariables = results;
        lastScan = Date.now();
        resolve(cachedVariables);
      }
    );
  });
}

/**
 * Launches the native Windows Environment Variables GUI editor dialog.
 */
function openEnvironmentDialog() {
  try {
    const child = spawn('rundll32.exe', ['sysdm.cpl,EditEnvironmentVariables'], {
      detached: true,
      stdio: 'ignore',
      windowsHide: false
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

function copyToClipboard(text) {
  if (clipboard && typeof clipboard.writeText === 'function') {
    clipboard.writeText(String(text || ''));
  }
  return text;
}

function getCachedVariables() {
  return cachedVariables;
}

module.exports = {
  parsePathEntries,
  filterEnv,
  getEnvVariables,
  openEnvironmentDialog,
  copyToClipboard,
  getCachedVariables
};
