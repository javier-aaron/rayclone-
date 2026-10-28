'use strict';

const { execFile } = require('node:child_process');

function sendKeyCombo(vkCode, withWin = true, withCtrl = true) {
  return new Promise((resolve) => {
    const psScript = `
      Add-Type @"
        using System;
        using System.Runtime.InteropServices;
        public class KeySender {
          [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);
          public const uint KEYEVENTF_KEYUP = 0x0002;
          public const byte VK_LWIN = 0x5B;
          public const byte VK_CONTROL = 0x11;

          public static void Send(byte key, bool win, bool ctrl) {
            if (win) keybd_event(VK_LWIN, 0, 0, 0);
            if (ctrl) keybd_event(VK_CONTROL, 0, 0, 0);
            keybd_event(key, 0, 0, 0);
            keybd_event(key, 0, KEYEVENTF_KEYUP, 0);
            if (ctrl) keybd_event(VK_CONTROL, 0, KEYEVENTF_KEYUP, 0);
            if (win) keybd_event(VK_LWIN, 0, KEYEVENTF_KEYUP, 0);
          }
        }
"@
      [KeySender]::Send(${vkCode}, $${withWin}, $${withCtrl})
    `;

    execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', psScript], { timeout: 2000 }, (err) => {
      resolve({ ok: !err });
    });
  });
}

async function nextDesktop() {
  return sendKeyCombo(0x27, true, true); // VK_RIGHT = 0x27
}

async function prevDesktop() {
  return sendKeyCombo(0x25, true, true); // VK_LEFT = 0x25
}

async function createDesktop() {
  return sendKeyCombo(0x44, true, true); // 'D' = 0x44
}

async function closeDesktop() {
  return sendKeyCombo(0x73, true, true); // VK_F4 = 0x73
}

module.exports = {
  nextDesktop,
  prevDesktop,
  createDesktop,
  closeDesktop
};
