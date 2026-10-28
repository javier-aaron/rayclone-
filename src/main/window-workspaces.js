'use strict';

const store = require('./store');
const { execFile } = require('node:child_process');
const path = require('node:path');

const DEFAULT_WORKSPACES = {
  'Dev Setup': [
    { title: 'Visual Studio Code', process: 'Code', x: 0, y: 0, width: 1280, height: 1040 },
    { title: 'Windows Terminal', process: 'WindowsTerminal', x: 1280, y: 0, width: 640, height: 1040 }
  ],
  'Research Deck': [
    { title: 'Google Chrome', process: 'chrome', x: 0, y: 0, width: 1200, height: 1040 },
    { title: 'Notepad', process: 'notepad', x: 1200, y: 0, width: 720, height: 1040 }
  ]
};

let workspaces = { ...DEFAULT_WORKSPACES };

function init() {
  const loaded = store.read('workspaces', null);
  if (loaded && typeof loaded === 'object') {
    workspaces = { ...DEFAULT_WORKSPACES, ...loaded };
  } else {
    store.write('workspaces', workspaces);
  }
}

function listWorkspaces() {
  return Object.keys(workspaces).map((name) => ({
    name,
    windowCount: workspaces[name].length,
    windows: workspaces[name]
  }));
}

function getWorkspace(name) {
  return workspaces[name] || null;
}

function saveWorkspace(name, windowsList) {
  if (!name) return false;
  workspaces[name] = Array.isArray(windowsList) ? windowsList : [];
  store.write('workspaces', workspaces);
  return true;
}

function deleteWorkspace(name) {
  if (name in workspaces) {
    delete workspaces[name];
    store.write('workspaces', workspaces);
    return true;
  }
  return false;
}

async function captureCurrentWindows() {
  return new Promise((resolve) => {
    const psScript = `
      Add-Type @"
        using System;
        using System.Runtime.InteropServices;
        using System.Collections.Generic;
        using System.Text;

        public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }

        public class WinEnum {
          [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
          [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
          [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
          [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
          [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

          public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

          public static List<object> GetOpenWindows() {
            var list = new List<object>();
            EnumWindows((hWnd, lParam) => {
              if (IsWindowVisible(hWnd)) {
                StringBuilder sb = new StringBuilder(256);
                GetWindowText(hWnd, sb, 256);
                string title = sb.ToString();
                RECT r;
                GetWindowRect(hWnd, out r);
                int w = r.Right - r.Left;
                int h = r.Bottom - r.Top;
                if (!string.IsNullOrWhiteSpace(title) && w > 100 && h > 100) {
                  uint pid;
                  GetWindowThreadProcessId(hWnd, out pid);
                  list.Add(new { Title = title, X = r.Left, Y = r.Top, Width = w, Height = h, PID = pid });
                }
              }
              return true;
            }, IntPtr.Zero);
            return list;
          }
        }
"@
      [WinEnum]::GetOpenWindows() | ConvertTo-Json -Compress
    `;

    execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', psScript], { timeout: 3000 }, (err, stdout) => {
      if (err || !stdout.trim()) {
        resolve([]);
        return;
      }
      try {
        const parsed = JSON.parse(stdout.trim());
        const arr = Array.isArray(parsed) ? parsed : [parsed];
        resolve(arr.map((w) => ({
          title: w.Title,
          x: w.X,
          y: w.Y,
          width: w.Width,
          height: w.Height,
          pid: w.PID
        })));
      } catch (e) {
        resolve([]);
      }
    });
  });
}

async function restoreWorkspace(name) {
  const ws = getWorkspace(name);
  if (!ws || !ws.length) return { ok: false, error: 'workspace not found or empty' };

  return new Promise((resolve) => {
    const windowsJson = JSON.stringify(ws).replace(/"/g, '`"');
    const psScript = `
      Add-Type @"
        using System;
        using System.Runtime.InteropServices;
        public class WinPos {
          [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
        }
"@
      $targets = '${windowsJson}' | ConvertFrom-Json
      foreach ($t in $targets) {
        $procs = Get-Process -Name $t.process -ErrorAction SilentlyContinue
        if ($procs) {
          foreach ($p in $procs) {
            if ($p.MainWindowHandle -ne [IntPtr]::Zero) {
              [WinPos]::SetWindowPos($p.MainWindowHandle, [IntPtr]::Zero, $t.x, $t.y, $t.width, $t.height, 0x0040)
            }
          }
        }
      }
    `;

    execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', psScript], { timeout: 4000 }, (err) => {
      resolve({ ok: !err, restored: ws.length });
    });
  });
}

init();

module.exports = {
  init,
  listWorkspaces,
  getWorkspace,
  saveWorkspace,
  deleteWorkspace,
  captureCurrentWindows,
  restoreWorkspace,
  DEFAULT_WORKSPACES
};
