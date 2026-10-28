'use strict';

const { execFile } = require('node:child_process');

function getBitwardenStatus() {
  return new Promise((resolve) => {
    execFile('bw', ['status'], { timeout: 3000 }, (err, stdout) => {
      if (err || !stdout) {
        return resolve({ installed: false, status: 'uninstalled' });
      }
      try {
        const parsed = JSON.parse(stdout.trim());
        resolve({
          installed: true,
          status: parsed.status, // "unlocked", "locked", "unauthenticated"
          userEmail: parsed.userEmail
        });
      } catch {
        resolve({ installed: true, status: 'unknown' });
      }
    });
  });
}

function searchVaultItems(query, sessionKey = '') {
  return new Promise((resolve) => {
    const q = String(query || '').trim();
    const args = ['list', 'items', '--search', q];
    if (sessionKey) {
      args.push('--session', sessionKey);
    }

    execFile('bw', args, { timeout: 5000 }, (err, stdout) => {
      if (err || !stdout) {
        return resolve([]);
      }
      try {
        const parsed = JSON.parse(stdout.trim());
        const list = Array.isArray(parsed) ? parsed : [];
        resolve(list.map((item) => ({
          id: item.id,
          name: item.name,
          username: (item.login && item.login.username) || '',
          hasPassword: !!(item.login && item.login.password),
          hasTotp: !!(item.login && item.login.totp),
          notes: item.notes || '',
          uri: (item.login && item.login.uris && item.login.uris[0] && item.login.uris[0].uri) || ''
        })));
      } catch {
        resolve([]);
      }
    });
  });
}

function getPassword(itemId, sessionKey = '') {
  return new Promise((resolve) => {
    const args = ['get', 'password', itemId];
    if (sessionKey) args.push('--session', sessionKey);

    execFile('bw', args, { timeout: 4000 }, (err, stdout) => {
      if (err || !stdout) resolve(null);
      else resolve(stdout.trim());
    });
  });
}

module.exports = {
  getBitwardenStatus,
  searchVaultItems,
  getPassword
};
