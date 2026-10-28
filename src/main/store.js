'use strict';

// Minimal JSON-backed persistence. Raycast keeps its state in SQLite
// (Microsoft.Data.Sqlite ships in its backend); a flat JSON file is enough here.
const fs = require('node:fs');
const path = require('node:path');

let baseDir = null;

function init(userDataPath) {
  baseDir = userDataPath || path.join(require('node:os').homedir(), '.rayclone');
  fs.mkdirSync(baseDir, { recursive: true });
}

function file(name) {
  return path.join(baseDir, `${name}.json`);
}

const pending = new Map();
let writeTimer = null;

function read(name, fallback) {
  if (pending.has(name)) {
    return pending.get(name);
  }
  try {
    return JSON.parse(fs.readFileSync(file(name), 'utf8'));
  } catch {
    return fallback;
  }
}

function write(name, value) {
  pending.set(name, value);
  if (writeTimer) return;
  writeTimer = setTimeout(flush, 250);
  if (writeTimer.unref) writeTimer.unref();
}

function flush() {
  writeTimer = null;
  for (const [name, value] of pending) {
    try {
      fs.writeFileSync(file(name), JSON.stringify(value), 'utf8');
    } catch { /* best effort */ }
  }
  pending.clear();
}

module.exports = { init, read, write, flush };
