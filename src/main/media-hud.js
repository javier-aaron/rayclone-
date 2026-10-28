'use strict';

const path = require('node:path');
const { execFile } = require('node:child_process');
const sysControls = require('./system-controls');

const PS_SCRIPT = path.join(__dirname, 'media-helper.ps1');

let cachedSession = {
  active: false,
  status: 'No media playing',
  title: 'No media playing',
  artist: '',
  album: '',
  app: '',
  volume: 50
};
let lastQueryTime = 0;
const CACHE_TTL_MS = 2000;

/**
 * Clamps volume input strictly between 0 and 100.
 * Defaults to 50 for non-numeric/invalid input.
 */
function clampVolume(val) {
  const num = parseInt(val, 10);
  if (isNaN(num)) return 50;
  return Math.max(0, Math.min(100, num));
}

/**
 * Parses raw SMTC media session output or object payload.
 * Provides resilient fallbacks for missing artist, album, or inactive state.
 */
function parseSession(data) {
  if (!data || data === 'NO_ACTIVE_SESSION' || data.noSession) {
    return { active: false, status: 'No media playing' };
  }

  let obj = data;
  if (typeof data === 'string') {
    try {
      obj = JSON.parse(data);
    } catch {
      return { active: false, status: 'No media playing' };
    }
  }

  if (!obj || typeof obj !== 'object') {
    return { active: false, status: 'No media playing' };
  }

  return {
    active: true,
    title: obj.Title || obj.title || 'Unknown Title',
    artist: obj.Artist || obj.artist || 'Unknown Artist',
    album: obj.AlbumTitle || obj.album || 'Unknown Album',
    status: obj.PlaybackStatus || obj.status || 'Playing',
    app: obj.SourceAppUserModelId || obj.app || 'Media Player',
    volume: clampVolume(obj.volume !== undefined ? obj.volume : 50)
  };
}

/**
 * Executes a PowerShell transport action with error shielding.
 */
function runAction(action) {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', PS_SCRIPT, '-Action', action],
      { windowsHide: true, timeout: 3000 },
      (err, stdout) => {
        const out = String(stdout || '').trim();
        const ok = !err && (out.includes('OK') || (out !== 'NO_ACTIVE_SESSION' && out.length > 0));
        resolve({ ok, output: out });
      }
    );
  });
}

/**
 * Queries Windows SMTC via media-helper.ps1 with caching.
 */
function getSession() {
  const now = Date.now();
  if (now - lastQueryTime < CACHE_TTL_MS) {
    return Promise.resolve(cachedSession);
  }

  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', PS_SCRIPT, '-Action', 'query'],
      { windowsHide: true, timeout: 3500 },
      (err, stdout) => {
        if (err || !stdout) {
          lastQueryTime = Date.now();
          return resolve(cachedSession);
        }

        const trimmed = stdout.trim();
        const parsed = parseSession(trimmed);
        if (parsed.active) {
          cachedSession = parsed;
        } else {
          cachedSession = {
            active: false,
            status: 'No media playing',
            title: 'No media playing',
            artist: '',
            album: '',
            app: '',
            volume: cachedSession.volume || 50
          };
        }
        lastQueryTime = Date.now();
        resolve(cachedSession);
      }
    );
  });
}

function getCachedSession() {
  return cachedSession;
}

function playPause() {
  if (cachedSession.active) {
    cachedSession.status = cachedSession.status === 'Playing' ? 'Paused' : 'Playing';
  }
  return runAction('playpause');
}

function nextTrack() {
  return runAction('next');
}

function prevTrack() {
  return runAction('prev');
}

function setVolume(level) {
  const clamped = clampVolume(level);
  cachedSession.volume = clamped;
  if (sysControls && typeof sysControls.setVolumeLevel === 'function') {
    try {
      sysControls.setVolumeLevel(clamped);
    } catch {}
  }
  return { ok: true, volume: clamped };
}

function adjustVolume(delta) {
  const current = cachedSession.volume !== undefined ? cachedSession.volume : 50;
  return setVolume(current + delta);
}

module.exports = {
  clampVolume,
  parseSession,
  getSession,
  getCachedSession,
  runAction,
  playPause,
  nextTrack,
  prevTrack,
  setVolume,
  adjustVolume
};
