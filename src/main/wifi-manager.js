'use strict';

const { execFile, exec } = require('node:child_process');

function getSavedProfiles() {
  return new Promise((resolve) => {
    exec('netsh wlan show profiles', { windowsHide: true }, (err, stdout) => {
      if (err || !stdout) return resolve([]);
      const profiles = [];
      const lines = stdout.split(/\r?\n/);
      for (const line of lines) {
        const match = line.match(/All User Profile\s*:\s*(.+)$/i);
        if (match && match[1]) {
          profiles.push(match[1].trim());
        }
      }
      resolve(profiles);
    });
  });
}

function getProfilePassword(profileName) {
  return new Promise((resolve) => {
    const clean = String(profileName || '').replace(/['";&|]/g, '').trim();
    if (!clean) return resolve(null);

    exec(`netsh wlan show profile name="${clean}" key=clear`, { windowsHide: true }, (err, stdout) => {
      if (err || !stdout) return resolve(null);
      const match = stdout.match(/Key Content\s*:\s*(.+)$/m);
      if (match && match[1]) {
        resolve(match[1].trim());
      } else {
        resolve(null); // Open network or no key stored
      }
    });
  });
}

function getAvailableNetworks() {
  return new Promise((resolve) => {
    exec('netsh wlan show networks mode=bssid', { windowsHide: true }, (err, stdout) => {
      if (err || !stdout) return resolve([]);
      const networks = [];
      const blocks = stdout.split(/SSID \d+\s*:\s*/i);
      for (const block of blocks.slice(1)) {
        const lines = block.split(/\r?\n/);
        const ssid = lines[0].trim();
        let signal = 0;
        let auth = 'Unknown';
        for (const line of lines) {
          const sigMatch = line.match(/Signal\s*:\s*(\d+)%/i);
          if (sigMatch) signal = parseInt(sigMatch[1], 10);
          const authMatch = line.match(/Authentication\s*:\s*(.+)$/i);
          if (authMatch) auth = authMatch[1].trim();
        }
        if (ssid) {
          networks.push({ ssid, signal, auth });
        }
      }
      resolve(networks);
    });
  });
}

function connectToNetwork(profileName) {
  return new Promise((resolve) => {
    const clean = String(profileName || '').replace(/['";&|]/g, '').trim();
    exec(`netsh wlan connect name="${clean}"`, { windowsHide: true }, (err) => {
      resolve({ ok: !err, error: err ? err.message : null });
    });
  });
}

function disconnectWifi() {
  return new Promise((resolve) => {
    exec('netsh wlan disconnect', { windowsHide: true }, (err) => {
      resolve({ ok: !err, error: err ? err.message : null });
    });
  });
}

module.exports = {
  getSavedProfiles,
  getProfilePassword,
  getAvailableNetworks,
  connectToNetwork,
  disconnectWifi
};
