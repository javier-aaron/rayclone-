'use strict';

const { execFile, exec } = require('node:child_process');

const PROTECTED_PROCESSES = new Set([
  'explorer', 'explorer.exe',
  'dwm', 'dwm.exe',
  'csrss', 'csrss.exe',
  'lsass', 'lsass.exe',
  'smss', 'smss.exe',
  'services', 'services.exe',
  'wininit', 'wininit.exe',
  'system', 'idle'
]);

let cachedWindows = [];
let lastScanTime = 0;
const CACHE_TTL_MS = 2000;

async function getRunningWindows(force = false) {
  const now = Date.now();
  if (!force && now - lastScanTime < CACHE_TTL_MS && lastScanTime > 0) {
    return cachedWindows;
  }

  return new Promise((resolve) => {
    // Fast-path using native PowerShell Get-Process (zero C# compilation overhead)
    const psScript = 'Get-Process | Where-Object { $_.MainWindowTitle -and $_.MainWindowTitle -ne "" } | Select-Object @{N="Hwnd";E={$_.MainWindowHandle.ToInt64()}}, @{N="Title";E={$_.MainWindowTitle}}, @{N="Pid";E={$_.Id}}, @{N="IsHung";E={!$_.Responding}} | ConvertTo-Json -Compress';

    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psScript], { timeout: 3500 }, (err, stdout) => {
      if (err || !stdout || !stdout.trim()) {
        lastScanTime = Date.now();
        resolve(cachedWindows.length > 0 ? cachedWindows : []);
        return;
      }
      try {
        const parsed = JSON.parse(stdout.trim());
        const list = Array.isArray(parsed) ? parsed : [parsed];
        const results = list.map((w) => ({
          hwnd: Number(w.Hwnd),
          title: String(w.Title || ''),
          pid: Number(w.Pid),
          isHung: !!w.IsHung
        }));
        cachedWindows = results;
        lastScanTime = Date.now();
        resolve(results);
      } catch {
        lastScanTime = Date.now();
        resolve(cachedWindows);
      }
    });
  });
}

function focusWindow(hwnd) {
  const psScript = `
    $sig = '[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow); [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);'
    $type = Add-Type -MemberDefinition $sig -Name "WinFocusNative" -Namespace "Rayclone" -PassThru
    $type::ShowWindow([IntPtr]${hwnd}, 9)
    $type::SetForegroundWindow([IntPtr]${hwnd})
  `;
  execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psScript]);
}

async function killProcessTree(pid, processName = '', force = false) {
  const p = parseInt(pid, 10);
  if (!p || p <= 4) return { ok: false, error: 'Cannot terminate system PID' };
  const cleanName = String(processName || '').toLowerCase().trim();
  if (PROTECTED_PROCESSES.has(cleanName)) {
    return { ok: false, error: `Process ${cleanName} is protected by shell safety policy` };
  }

  if (!force) {
    try {
      const electron = require('electron');
      if (electron && electron.dialog && typeof electron.dialog.showMessageBox === 'function') {
        const resp = await electron.dialog.showMessageBox({
          type: 'warning',
          buttons: ['End Process Tree', 'Cancel'],
          defaultId: 1,
          cancelId: 1,
          title: 'Confirm End Process',
          message: `Are you sure you want to terminate ${cleanName || 'process'} (PID ${p}) and all child processes? Unsaved work will be lost.`
        });
        if (resp.response !== 0) {
          return { ok: false, cancelled: true };
        }
      } else {
        return { ok: false, cancelled: true, error: 'Confirmation dialog required' };
      }
    } catch {
      return { ok: false, cancelled: true, error: 'Confirmation dialog required' };
    }
  }

  return new Promise((resolve) => {
    // /T kills process tree, /F forces
    exec(`taskkill /T /F /PID ${p}`, (err) => {
      resolve({ ok: !err, error: err ? err.message : null });
    });
  });
}

function searchWindowWalker(query) {
  const q = String(query || '').replace(/^<+/, '').trim().toLowerCase();
  return getRunningWindows().then((windows) => {
    if (!q) return windows.slice(0, 20);
    return windows.filter((w) => w.title.toLowerCase().includes(q) || String(w.pid).includes(q)).slice(0, 20);
  });
}

module.exports = {
  getRunningWindows,
  focusWindow,
  killProcessTree,
  searchWindowWalker,
  PROTECTED_PROCESSES
};
