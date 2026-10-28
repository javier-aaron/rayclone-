'use strict';

const crypto = require('node:crypto');
const os = require('node:os');

function formatJson(input) {
  try {
    const parsed = JSON.parse(input);
    return {
      ok: true,
      formatted: JSON.stringify(parsed, null, 2),
      minified: JSON.stringify(parsed),
      keysCount: typeof parsed === 'object' && parsed !== null ? Object.keys(parsed).length : 0
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function base64Encode(text) {
  return Buffer.from(text, 'utf8').toString('base64');
}

function base64Decode(text) {
  try {
    const decoded = Buffer.from(text, 'base64').toString('utf8');
    return { ok: true, text: decoded };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function computeHashes(text) {
  return {
    sha256: crypto.createHash('sha256').update(text).digest('hex'),
    md5: crypto.createHash('md5').update(text).digest('hex'),
    sha1: crypto.createHash('sha1').update(text).digest('hex')
  };
}

function generateUuid() {
  return crypto.randomUUID();
}

function epochToDate(val) {
  const num = Number(val);
  if (isNaN(num)) return null;
  // If in seconds (10 digits), convert to ms
  const ms = num < 1e11 ? num * 1000 : num;
  const d = new Date(ms);
  if (isNaN(d.getTime())) return null;
  return {
    iso: d.toISOString(),
    utc: d.toUTCString(),
    local: d.toLocaleString(),
    seconds: Math.floor(ms / 1000),
    milliseconds: ms
  };
}

function dateToEpoch(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const ms = d.getTime();
  return {
    seconds: Math.floor(ms / 1000),
    milliseconds: ms,
    iso: d.toISOString(),
    local: d.toLocaleString()
  };
}

function getNetworkInfo() {
  const interfaces = os.networkInterfaces();
  const list = [];
  for (const [name, addrs] of Object.entries(interfaces)) {
    for (const a of addrs || []) {
      if (a.family === 'IPv4' && !a.internal) {
        list.push({
          interface: name,
          ip: a.address,
          netmask: a.netmask,
          mac: a.mac
        });
      }
    }
  }
  return list;
}

function parseColor(str) {
  const s = String(str || '').trim().toLowerCase();
  // Hex matching #rgb, #rrggbb, #rrggbbaa
  const hexMatch = s.match(/^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (hexMatch) {
    let hex = hexMatch[1];
    if (hex.length === 3) {
      hex = hex.split('').map((c) => c + c).join('');
    }
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return {
      hex: `#${hex.slice(0, 6)}`,
      rgb: `rgb(${r}, ${g}, ${b})`,
      r, g, b
    };
  }
  return null;
}

module.exports = {
  formatJson,
  base64Encode,
  base64Decode,
  computeHashes,
  generateUuid,
  epochToDate,
  dateToEpoch,
  getNetworkInfo,
  parseColor
};
