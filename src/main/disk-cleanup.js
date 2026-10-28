'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFile, exec } = require('node:child_process');

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  if (bytes >= 1024 * 1024) return Math.round(bytes / (1024 * 1024)) + ' MB';
  if (bytes >= 1024) return Math.round(bytes / 1024) + ' KB';
  return bytes + ' B';
}

function getTempDirectorySize() {
  const tempDir = os.tmpdir();
  let totalBytes = 0;
  let fileCount = 0;

  try {
    const files = fs.readdirSync(tempDir);
    for (const file of files) {
      try {
        const fullPath = path.join(tempDir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isFile()) {
          totalBytes += stat.size;
          fileCount++;
        }
      } catch {}
    }
  } catch {}

  return { path: tempDir, totalBytes, formatted: formatBytes(totalBytes), fileCount };
}

function cleanTempFiles() {
  const tempDir = os.tmpdir();
  let cleanedBytes = 0;
  let deletedCount = 0;

  try {
    const files = fs.readdirSync(tempDir);
    for (const file of files) {
      try {
        const fullPath = path.join(tempDir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isFile()) {
          fs.unlinkSync(fullPath);
          cleanedBytes += stat.size;
          deletedCount++;
        }
      } catch {}
    }
  } catch {}

  return { ok: true, deletedCount, cleanedBytes, formatted: formatBytes(cleanedBytes) };
}

function emptyRecycleBin() {
  return new Promise((resolve) => {
    const psScript = 'Clear-RecycleBin -Force -ErrorAction SilentlyContinue';
    execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', psScript], { timeout: 4000 }, (err) => {
      resolve({ ok: !err });
    });
  });
}

function findLargeFiles(directory, minSizeBytes = 500 * 1024 * 1024, limit = 20) {
  const targetDir = directory || os.homedir();
  return new Promise((resolve) => {
    const psScript = `
      Get-ChildItem -Path "${targetDir}" -File -Recurse -ErrorAction SilentlyContinue |
        Where-Object { $_.Length -ge ${minSizeBytes} } |
        Sort-Object Length -Descending |
        Select-Object -First ${limit} FullName, Length, LastWriteTime |
        ConvertTo-Json -Compress
    `;

    execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', psScript], { timeout: 10000 }, (err, stdout) => {
      if (err || !stdout.trim()) {
        resolve([]);
        return;
      }
      try {
        const parsed = JSON.parse(stdout.trim());
        const list = Array.isArray(parsed) ? parsed : [parsed];
        resolve(list.map((f) => ({
          path: f.FullName,
          name: path.basename(f.FullName),
          bytes: f.Length,
          formatted: formatBytes(f.Length),
          modified: f.LastWriteTime
        })));
      } catch {
        resolve([]);
      }
    });
  });
}

module.exports = {
  getTempDirectorySize,
  cleanTempFiles,
  emptyRecycleBin,
  findLargeFiles,
  formatBytes
};
