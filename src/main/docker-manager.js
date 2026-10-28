'use strict';

const { execFile, exec } = require('node:child_process');
const fs = require('node:fs');

const DOCKER_DESKTOP_PATH = 'C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe';

let statusCache = { installed: null, running: null, lastCheck: 0 };
const STATUS_CACHE_TTL = 3000;

/**
 * Checks exit code and stderr to determine Docker daemon availability.
 */
function checkDaemon(exitCode, stderr) {
  const errStr = String(stderr || '').toLowerCase();
  if (exitCode !== 0 || errStr.includes('failed to connect') || errStr.includes('npipe') || errStr.includes('daemon')) {
    return { active: false, error: 'Docker daemon stopped' };
  }
  return { active: true };
}

/**
 * Parses docker ps --format "{{json .}}" JSON output into normalized container objects.
 */
function parseContainers(jsonOutput) {
  const lines = String(jsonOutput || '').split(/\r?\n/).filter((l) => l.trim().length > 0);
  const containers = [];

  for (const line of lines) {
    try {
      const raw = JSON.parse(line.trim());
      let name = raw.Names || raw.Name || 'container';
      if (name.startsWith('/')) name = name.slice(1);
      const id = (raw.ID || raw.Id || '').slice(0, 12);
      const state = (raw.State || (String(raw.Status || '').startsWith('Up') ? 'running' : 'exited')).toLowerCase();
      const status = raw.Status || state;
      const ports = raw.Ports || '';
      const image = raw.Image || '';

      containers.push({
        id,
        name,
        names: name,
        image,
        state,
        status,
        ports,
        running: state === 'running' || status.toLowerCase().startsWith('up')
      });
    } catch {
      // Skip malformed JSON line cleanly
    }
  }
  return containers;
}

/**
 * Emits the fallback item when Docker daemon is not active.
 */
function getFallbackItem() {
  return {
    id: 'docker:stopped',
    group: 'Docker Containers',
    title: 'Docker Desktop is stopped',
    subtitle: 'Click to start the Docker Desktop service',
    dockerData: {
      id: 'stopped',
      name: 'Docker Desktop is stopped',
      image: '',
      status: 'stopped',
      ports: ''
    },
    actions: [
      {
        id: 'start-docker',
        title: 'Start Docker Desktop',
        shortcut: '↵',
        run: () => {
          startDockerDesktop();
          return { ok: true, started: true };
        }
      }
    ]
  };
}

/**
 * Checks whether Docker CLI is installed and if the Docker daemon is responding.
 */
function checkDockerStatus(force = false) {
  const now = Date.now();
  if (!force && statusCache.installed !== null && now - statusCache.lastCheck < STATUS_CACHE_TTL) {
    return Promise.resolve(statusCache);
  }

  return new Promise((resolve) => {
    execFile('docker', ['version', '--format', '{{.Server.Version}}'], { windowsHide: true }, (err, stdout, stderr) => {
      if (err) {
        if (err.code === 'ENOENT') {
          statusCache = {
            installed: false,
            running: false,
            message: 'Docker CLI is not installed or not in PATH',
            lastCheck: Date.now()
          };
          return resolve(statusCache);
        }
        // CLI is installed but daemon / pipe is not running
        const daemonRes = checkDaemon(err.code || 1, stderr || err.message);
        statusCache = {
          installed: true,
          running: daemonRes.active,
          message: daemonRes.error || 'Docker Desktop is stopped',
          lastCheck: Date.now()
        };
        return resolve(statusCache);
      }

      statusCache = {
        installed: true,
        running: true,
        serverVersion: String(stdout || '').trim(),
        message: 'Docker daemon is active',
        lastCheck: Date.now()
      };
      resolve(statusCache);
    });
  });
}

/**
 * Enumerate all containers (running and stopped) via docker ps -a --format "{{json .}}"
 */
function listContainers() {
  return new Promise((resolve) => {
    execFile('docker', ['ps', '-a', '--format', '{{json .}}'], { windowsHide: true }, (err, stdout) => {
      if (err || !stdout) {
        return resolve([]);
      }
      resolve(parseContainers(stdout));
    });
  });
}

/**
 * Start a container by ID.
 */
function startContainer(id) {
  return new Promise((resolve) => {
    execFile('docker', ['start', id], { windowsHide: true }, (err, stdout) => {
      resolve({ ok: !err, id, output: stdout ? stdout.trim() : '', error: err ? err.message : null });
    });
  });
}

/**
 * Stop a container by ID.
 */
function stopContainer(id) {
  return new Promise((resolve) => {
    execFile('docker', ['stop', id], { windowsHide: true }, (err, stdout) => {
      resolve({ ok: !err, id, output: stdout ? stdout.trim() : '', error: err ? err.message : null });
    });
  });
}

/**
 * Restart a container by ID.
 */
function restartContainer(id) {
  return new Promise((resolve) => {
    execFile('docker', ['restart', id], { windowsHide: true }, (err, stdout) => {
      resolve({ ok: !err, id, output: stdout ? stdout.trim() : '', error: err ? err.message : null });
    });
  });
}

/**
 * Retrieve recent logs for a container.
 */
function getContainerLogs(id, tail = 50) {
  return new Promise((resolve) => {
    execFile('docker', ['logs', '--tail', String(tail), id], { windowsHide: true }, (err, stdout, stderr) => {
      const output = (stdout || stderr || '').trim();
      resolve({ ok: !err, id, logs: output });
    });
  });
}

/**
 * Launch Docker Desktop application.
 */
function startDockerDesktop() {
  return new Promise((resolve) => {
    if (fs.existsSync(DOCKER_DESKTOP_PATH)) {
      exec(`start "" "${DOCKER_DESKTOP_PATH}"`, { windowsHide: true }, (err) => {
        resolve({ ok: !err });
      });
    } else {
      exec('start "" "Docker Desktop"', { windowsHide: true }, (err) => {
        resolve({ ok: !err });
      });
    }
  });
}

module.exports = {
  parseContainers,
  checkDaemon,
  getFallbackItem,
  checkDockerStatus,
  listContainers,
  startContainer,
  stopContainer,
  restartContainer,
  getContainerLogs,
  startDockerDesktop
};
