'use strict';

const { exec, execFile } = require('node:child_process');
const { clipboard } = require('electron');

const HIVE_MAP = {
  hkcu: 'HKEY_CURRENT_USER',
  hklm: 'HKEY_LOCAL_MACHINE',
  hkcr: 'HKEY_CLASSES_ROOT',
  hku: 'HKEY_USERS',
  hkcc: 'HKEY_CURRENT_CONFIG',
  'hkey_current_user': 'HKEY_CURRENT_USER',
  'hkey_local_machine': 'HKEY_LOCAL_MACHINE',
  'hkey_classes_root': 'HKEY_CLASSES_ROOT',
  'hkey_users': 'HKEY_USERS',
  'hkey_current_config': 'HKEY_CURRENT_CONFIG'
};

function normalizeHivePath(input) {
  let clean = String(input || '').replace(/^:+/, '').trim();
  const slashIdx = clean.indexOf('\\');
  const hivePart = (slashIdx === -1 ? clean : clean.slice(0, slashIdx)).toLowerCase();
  const restPart = slashIdx === -1 ? '' : clean.slice(slashIdx);

  const fullHive = HIVE_MAP[hivePart] || (hivePart.toUpperCase().startsWith('HK') ? hivePart.toUpperCase() : null);
  if (!fullHive) return null;
  return `${fullHive}${restPart}`;
}

async function queryRegistryKey(keyPath) {
  const norm = normalizeHivePath(keyPath);
  if (!norm) return { key: keyPath, subkeys: [], values: [] };

  return new Promise((resolve) => {
    exec(`reg query "${norm}"`, { windowsHide: true }, (err, stdout) => {
      if (err || !stdout) {
        return resolve({ key: norm, subkeys: [], values: [] });
      }

      const subkeys = [];
      const values = [];
      const lines = stdout.split(/\r?\n/).filter((l) => l.trim().length > 0);

      for (const line of lines) {
        if (line.startsWith(norm + '\\')) {
          subkeys.push(line.trim());
        } else if (line.startsWith('    ') || line.startsWith('\t')) {
          const parts = line.trim().split(/\s{4,}|\t+/);
          if (parts.length >= 2) {
            const name = parts[0];
            const type = parts[1];
            const data = parts.slice(2).join(' ') || '(value not set)';
            values.push({ name, type, data });
          }
        }
      }

      resolve({ key: norm, subkeys, values });
    });
  });
}

function openInRegedit(fullKeyPath) {
  const norm = normalizeHivePath(fullKeyPath);
  if (!norm) {
    exec('regedit.exe');
    return;
  }

  // Pre-set LastKey so regedit auto-navigates
  const computerPath = norm.startsWith('Computer\\') ? norm : `Computer\\${norm}`;
  const escaped = computerPath.replace(/\\/g, '\\\\');
  const ps = `Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Applets\\Regedit" -Name "LastKey" -Value "${escaped}" -Force; Start-Process regedit.exe`;
  execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps]);
}

function searchRegistry(query) {
  const q = String(query || '').trim();
  const raw = q.replace(/^:+/, '').trim();

  // If query is empty or just ":", return available hives
  if (!raw) {
    return [
      { id: 'reg:hkcu', name: 'HKEY_CURRENT_USER', path: 'HKCU', desc: 'Current logged-in user settings & software' },
      { id: 'reg:hklm', name: 'HKEY_LOCAL_MACHINE', path: 'HKLM', desc: 'System-wide configuration, drivers & hardware' },
      { id: 'reg:hkcr', name: 'HKEY_CLASSES_ROOT', path: 'HKCR', desc: 'File type associations & COM OLE classes' },
      { id: 'reg:hku', name: 'HKEY_USERS', path: 'HKU', desc: 'All loaded user profiles on the machine' },
      { id: 'reg:hkcc', name: 'HKEY_CURRENT_CONFIG', path: 'HKCC', desc: 'Hardware profile information used at system boot' }
    ].map((h) => ({
      id: h.id,
      title: `${h.name} (${h.path})`,
      subtitle: h.desc,
      icon: '🗄️',
      group: 'Registry',
      scoreBoost: 220,
      actions: [
        { id: 'open-regedit', title: 'Open Hive in Regedit', shortcut: '↵', run: () => openInRegedit(h.path) },
        {
          id: 'copy-path',
          title: 'Copy Hive Path',
          run: () => {
            try {
              const electron = require('electron');
              if (electron && electron.clipboard && typeof electron.clipboard.writeText === 'function') {
                electron.clipboard.writeText(h.name);
              }
            } catch {}
            return { ok: true, copied: h.name };
          }
        }
      ]
    }));
  }

  return null; // Signals to caller to execute queryRegistryKey asynchronously
}

module.exports = {
  HIVE_MAP,
  normalizeHivePath,
  queryRegistryKey,
  openInRegedit,
  searchRegistry
};
