'use strict';

const { execFile } = require('node:child_process');

function toggleForegroundAlwaysOnTop() {
  return new Promise((resolve) => {
    const psScript = `
      Add-Type @"
        using System;
        using System.Runtime.InteropServices;
        public class WinTop {
          [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
          [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr hWnd, int nIndex);
          [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
          public static readonly IntPtr HWND_TOPMOST = new IntPtr(-1);
          public static readonly IntPtr HWND_NOTOPMOST = new IntPtr(-2);
          public const int GWL_EXSTYLE = -20;
          public const int WS_EX_TOPMOST = 0x0008;
          public const uint SWP_NOMOVE = 0x0002;
          public const uint SWP_NOSIZE = 0x0001;

          public static bool ToggleTopmost() {
            IntPtr fg = GetForegroundWindow();
            if (fg == IntPtr.Zero) return false;
            int exStyle = GetWindowLong(fg, GWL_EXSTYLE);
            bool isTop = (exStyle & WS_EX_TOPMOST) != 0;
            IntPtr insertAfter = isTop ? HWND_NOTOPMOST : HWND_TOPMOST;
            SetWindowPos(fg, insertAfter, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE);
            return !isTop;
          }
        }
"@
      $isNowTopmost = [WinTop]::ToggleTopmost()
      [PSCustomObject]@{ Ok = $true; IsTopmost = $isNowTopmost } | ConvertTo-Json -Compress
    `;

    execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', psScript], { timeout: 3000 }, (err, stdout) => {
      if (err || !stdout.trim()) {
        resolve({ ok: false, isTopmost: false });
        return;
      }
      try {
        const parsed = JSON.parse(stdout.trim());
        resolve({ ok: parsed.Ok, isTopmost: parsed.IsTopmost });
      } catch {
        resolve({ ok: false, isTopmost: false });
      }
    });
  });
}

module.exports = {
  toggleForegroundAlwaysOnTop
};
