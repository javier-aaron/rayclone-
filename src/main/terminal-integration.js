'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { exec } = require('node:child_process');

const USERPROFILE = os.homedir();
const APPDATA = process.env.APPDATA || path.join(USERPROFILE, 'AppData', 'Roaming');
const LOCALAPPDATA = process.env.LOCALAPPDATA || path.join(USERPROFILE, 'AppData', 'Local');

const WT_SETTINGS_PATHS = [
  path.join(LOCALAPPDATA, 'Packages', 'Microsoft.WindowsTerminal_8wekyb3d8bbwe', 'LocalState', 'settings.json'),
  path.join(LOCALAPPDATA, 'Microsoft', 'Windows Terminal', 'settings.json')
];

const SSH_CONFIG_PATH = path.join(USERPROFILE, '.ssh', 'config');
const PS_HISTORY_PATH = path.join(APPDATA, 'Microsoft', 'Windows', 'PowerShell', 'PSReadLine', 'ConsoleHost_history.txt');

function getTerminalProfiles() {
  for (const p of WT_SETTINGS_PATHS) {
    if (fs.existsSync(p)) {
      try {
        const raw = fs.readFileSync(p, 'utf8');
        // Strip trailing commas/comments if JSON5
        const cleaned = raw.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
        const data = JSON.parse(cleaned);
        const list = (data.profiles && (data.profiles.list || data.profiles)) || [];
        return list.map((item) => ({
          name: item.name || 'Profile',
          guid: item.guid,
          commandline: item.commandline || 'powershell.exe',
          hidden: !!item.hidden
        })).filter((x) => !x.hidden);
      } catch {}
    }
  }

  // Fallback default Windows profiles
  return [
    { name: 'PowerShell', commandline: 'powershell.exe' },
    { name: 'Command Prompt', commandline: 'cmd.exe' },
    { name: 'WSL / Ubuntu', commandline: 'wsl.exe' }
  ];
}

function getSshHosts() {
  const hosts = [];
  if (fs.existsSync(SSH_CONFIG_PATH)) {
    try {
      const content = fs.readFileSync(SSH_CONFIG_PATH, 'utf8');
      const lines = content.split(/\r?\n/);
      let currentHost = null;

      for (const line of lines) {
        const match = line.match(/^\s*Host\s+(.+)$/i);
        if (match && !match[1].includes('*')) {
          if (currentHost) hosts.push(currentHost);
          currentHost = { name: match[1].trim(), hostname: match[1].trim(), user: '', port: '22' };
        } else if (currentHost) {
          const hn = line.match(/^\s*HostName\s+(.+)$/i);
          if (hn) currentHost.hostname = hn[1].trim();
          const u = line.match(/^\s*User\s+(.+)$/i);
          if (u) currentHost.user = u[1].trim();
          const p = line.match(/^\s*Port\s+(\d+)$/i);
          if (p) currentHost.port = p[1].trim();
        }
      }
      if (currentHost) hosts.push(currentHost);
    } catch {}
  }
  return hosts;
}

function getRecentShellCommands(limit = 20) {
  if (!fs.existsSync(PS_HISTORY_PATH)) return [];
  try {
    const raw = fs.readFileSync(PS_HISTORY_PATH, 'utf8');
    const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 1);
    const unique = [...new Set(lines.reverse())].slice(0, limit);
    return unique;
  } catch {
    return [];
  }
}

function launchTerminalProfile(profileName) {
  const clean = String(profileName || '').replace(/['";&|]/g, '').trim();
  exec(`wt.exe -p "${clean}"`);
}

function connectToSshHost(hostName) {
  const clean = String(hostName || '').replace(/['";&|]/g, '').trim();
  exec(`wt.exe ssh ${clean}`);
}

module.exports = {
  getTerminalProfiles,
  getSshHosts,
  getRecentShellCommands,
  launchTerminalProfile,
  connectToSshHost
};
