'use strict';

const { execFile, exec } = require('node:child_process');

let cachedProcesses = [];
let lastFetch = 0;
const CACHE_TTL_MS = 6000;

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  if (bytes >= 1024 * 1024) return Math.round(bytes / (1024 * 1024)) + ' MB';
  if (bytes >= 1024) return Math.round(bytes / 1024) + ' KB';
  return bytes + ' B';
}

function fetchProcesses() {
  return new Promise((resolve) => {
    const now = Date.now();
    if (now - lastFetch < CACHE_TTL_MS && cachedProcesses.length > 0) {
      return resolve(cachedProcesses);
    }

    // Fast PowerShell query for top 40 memory-consuming processes
    const script = `Get-Process | Where-Object { $_.Id -gt 4 } | Sort-Object WorkingSet64 -Descending | Select-Object -First 40 Id, ProcessName, WorkingSet64, MainWindowTitle | ConvertTo-Json -Compress`;

    execFile('powershell.exe', ['-NoProfile', '-Command', script], { windowsHide: true }, (err, stdout) => {
      if (err || !stdout) {
        return resolve(cachedProcesses);
      }
      try {
        const raw = JSON.parse(stdout);
        const list = Array.isArray(raw) ? raw : [raw];
        cachedProcesses = list.map((p) => ({
          pid: p.Id,
          name: p.ProcessName,
          title: p.MainWindowTitle || p.ProcessName,
          memoryBytes: p.WorkingSet64,
          memoryFormatted: formatBytes(p.WorkingSet64)
        }));
        lastFetch = Date.now();
        resolve(cachedProcesses);
      } catch {
        resolve(cachedProcesses);
      }
    });
  });
}

function killProcess(pid) {
  return new Promise((resolve) => {
    exec(`taskkill /F /PID ${pid}`, { windowsHide: true }, (err) => {
      // Invalidate cache immediately so killed process disappears
      cachedProcesses = cachedProcesses.filter((p) => p.pid !== pid);
      if (err) {
        resolve({ ok: false, error: err.message });
      } else {
        resolve({ ok: true });
      }
    });
  });
}

function getProcessesSync() {
  const now = Date.now();
  if (now - lastFetch >= CACHE_TTL_MS || cachedProcesses.length === 0) {
    fetchProcesses().catch(() => {});
  }
  return cachedProcesses;
}

module.exports = {
  fetchProcesses,
  getProcessesSync,
  killProcess,
  formatBytes
};
