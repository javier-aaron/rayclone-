'use strict';

const { execFile, exec } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  if (bytes >= 1024 * 1024) return Math.round(bytes / (1024 * 1024)) + ' MB';
  if (bytes >= 1024) return Math.round(bytes / 1024) + ' KB';
  return bytes + ' B';
}

async function getTopProcesses(limit = 30) {
  return new Promise((resolve) => {
    const psScript = `
      Get-Process | Where-Object { $_.Id -gt 4 } | Sort-Object WorkingSet64 -Descending | Select-Object -First ${limit} Id, ProcessName, WorkingSet64, CPU, MainWindowTitle | ConvertTo-Json -Compress
    `;
    execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', psScript], { timeout: 4000 }, (err, stdout) => {
      if (err || !stdout.trim()) {
        resolve([]);
        return;
      }
      try {
        const raw = JSON.parse(stdout.trim());
        const list = Array.isArray(raw) ? raw : [raw];
        resolve(list.map((p) => ({
          pid: p.Id,
          name: p.ProcessName,
          title: p.MainWindowTitle || p.ProcessName,
          memoryBytes: p.WorkingSet64,
          memoryFormatted: formatBytes(p.WorkingSet64),
          cpuSeconds: p.CPU ? Math.round(p.CPU) : 0
        })));
      } catch (e) {
        resolve([]);
      }
    });
  });
}

async function killProcessByPid(pid) {
  const p = parseInt(pid, 10);
  if (!p || p <= 4) return { ok: false, error: 'Cannot terminate system PID' };
  return new Promise((resolve) => {
    exec(`taskkill /F /PID ${p}`, (err) => {
      resolve({ ok: !err, error: err ? err.message : null });
    });
  });
}

async function killProcessByName(processName) {
  const clean = String(processName || '').replace(/['";&|]/g, '').trim();
  if (!clean || ['system', 'idle', 'smss', 'csrss'].includes(clean.toLowerCase())) {
    return { ok: false, error: 'Cannot terminate protected system process' };
  }
  const imgName = clean.endsWith('.exe') ? clean : `${clean}.exe`;
  return new Promise((resolve) => {
    exec(`taskkill /F /IM "${imgName}"`, (err) => {
      resolve({ ok: !err, error: err ? err.message : null });
    });
  });
}

async function getStartupApps() {
  return new Promise((resolve) => {
    const psScript = `
      $results = @()
      $hkcu = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run"
      $hklm = "HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run"
      if (Test-Path $hkcu) {
        Get-ItemProperty $hkcu | Get-Member -MemberType NoteProperty | ForEach-Object {
          $val = (Get-ItemProperty $hkcu).($_.Name)
          $results += [PSCustomObject]@{ Name = $_.Name; Command = $val; Scope = "User"; Enabled = $true }
        }
      }
      if (Test-Path $hklm) {
        Get-ItemProperty $hklm | Get-Member -MemberType NoteProperty | ForEach-Object {
          $val = (Get-ItemProperty $hklm).($_.Name)
          $results += [PSCustomObject]@{ Name = $_.Name; Command = $val; Scope = "System"; Enabled = $true }
        }
      }
      $results | ConvertTo-Json -Compress
    `;

    execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', psScript], { timeout: 4000 }, (err, stdout) => {
      if (err || !stdout.trim()) {
        resolve([]);
        return;
      }
      try {
        const parsed = JSON.parse(stdout.trim());
        const list = Array.isArray(parsed) ? parsed : [parsed];
        resolve(list.map((item) => ({
          name: item.Name,
          command: item.Command,
          scope: item.Scope,
          enabled: item.Enabled
        })));
      } catch (e) {
        resolve([]);
      }
    });
  });
}

module.exports = {
  getTopProcesses,
  killProcessByPid,
  killProcessByName,
  getStartupApps,
  formatBytes
};
