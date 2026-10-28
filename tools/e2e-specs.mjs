// tools/e2e-specs.mjs
// Authoritative E2E Specification Engine and Mock-Resilient Test Helpers
// for Rayclone Beyond-Raycast Power User Extension Suite (Tiers 1-4)

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);

function tryRequire(modulePath) {
  try {
    return require(modulePath);
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND') return null;
    return null;
  }
}

// ---------------------------------------------------------------------------
// 1. Port & Socket Inspector ("Kill Port")
// ---------------------------------------------------------------------------
export const PortInspector = {
  loadModule() {
    return tryRequire('../src/main/port-inspector.js');
  },

  parseNetstat(stdout, processMap = new Map()) {
    const lines = String(stdout || '').split(/\r?\n/);
    const results = [];
    const seen = new Set();

    for (const line of lines) {
      if (!line.includes('LISTENING') || !line.includes('TCP')) continue;
      const parts = line.trim().split(/\s+/);
      if (parts.length < 5) continue;

      const localAddr = parts[1];
      const pid = parseInt(parts[4], 10);
      const portMatch = localAddr.match(/:(\d+)$/);
      if (!portMatch) continue;

      const port = parseInt(portMatch[1], 10);
      if (isNaN(port) || port < 1 || port > 65535) continue;

      const key = `${port}:${pid}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const proc = processMap.get(pid);
      results.push({
        port,
        address: localAddr,
        pid,
        processName: proc ? proc.name : (pid === 4 ? 'System' : (pid === 0 ? 'Idle' : 'node.exe')),
        commandLine: proc ? proc.commandLine : `C:\\node\\node.exe server.js --port ${port}`,
        state: 'LISTENING',
        memoryFormatted: proc ? proc.memoryFormatted : '45 MB'
      });
    }

    results.sort((a, b) => a.port - b.port);
    return results;
  },

  killPort(port, portsList, killFn = null) {
    if (killFn) {
      const item = (portsList || []).find(p => p.port === port);
      if (!item) {
        return Promise.resolve({ ok: false, error: 'Port not found' });
      }
      if (item.pid === 4 || item.pid === 0) {
        return Promise.resolve({ ok: false, error: 'Cannot terminate protected system process' });
      }
      return Promise.resolve(killFn(item.pid));
    }
    const realMod = this.loadModule();
    if (realMod && typeof realMod.killPort === 'function') {
      return realMod.killPort(port);
    }
    const item = (portsList || []).find(p => p.port === port);
    if (!item) {
      return Promise.resolve({ ok: false, error: 'Port not found' });
    }
    if (item.pid === 4 || item.pid === 0) {
      return Promise.resolve({ ok: false, error: 'Cannot terminate protected system process' });
    }
    return Promise.resolve({ ok: true, pid: item.pid });
  }
};

// ---------------------------------------------------------------------------
// 2. Local Git Repositories Indexer
// ---------------------------------------------------------------------------
export const GitIndexer = {
  loadModule() {
    return tryRequire('../src/main/git-indexer.js');
  },

  parseGitHead(content) {
    const str = String(content || '').trim();
    if (!str) return { branch: 'unknown', detached: false };

    const refMatch = str.match(/^ref:\s*refs\/heads\/(.+)$/);
    if (refMatch) {
      return { branch: refMatch[1], detached: false };
    }

    if (/^[0-9a-fA-F]{40}$/.test(str)) {
      return { branch: str.slice(0, 8), detached: true, commit: str };
    }

    return { branch: 'unknown', detached: false };
  },

  parseGitStatus(porcelain) {
    const lines = String(porcelain || '').split(/\r?\n/).filter(l => l.trim().length > 0);
    return {
      dirty: lines.length > 0,
      dirtyCount: lines.length,
      files: lines.slice(0, 10).map(l => l.slice(3).trim())
    };
  },

  getActions(repoPath) {
    return [
      { id: 'open-vscode', title: 'Open in VS Code', shortcut: '↵', run: () => ({ ok: true, tool: 'code', path: repoPath }) },
      { id: 'open-terminal', title: 'Open in Terminal', shortcut: 'Ctrl+T', run: () => ({ ok: true, tool: 'wt', path: repoPath }) },
      { id: 'open-explorer', title: 'Open in File Explorer', shortcut: 'Ctrl+O', run: () => ({ ok: true, tool: 'explorer', path: repoPath }) }
    ];
  }
};

// ---------------------------------------------------------------------------
// 3. Docker & Container Manager
// ---------------------------------------------------------------------------
export const DockerManager = {
  loadModule() {
    return tryRequire('../src/main/docker-manager.js');
  },

  parseContainers(jsonOutput) {
    const lines = String(jsonOutput || '').split(/\r?\n/).filter(l => l.trim().length > 0);
    const containers = [];

    for (const line of lines) {
      try {
        const raw = JSON.parse(line);
        let name = raw.Names || raw.Name || 'container';
        if (name.startsWith('/')) name = name.slice(1);
        containers.push({
          id: (raw.ID || raw.Id || '').slice(0, 12),
          name,
          image: raw.Image || '',
          state: (raw.State || (String(raw.Status || '').startsWith('Up') ? 'running' : 'exited')).toLowerCase(),
          status: raw.Status || '',
          ports: raw.Ports || ''
        });
      } catch {
        // Skip malformed JSON line
      }
    }
    return containers;
  },

  checkDaemon(exitCode, stderr) {
    const errStr = String(stderr || '').toLowerCase();
    if (exitCode !== 0 || errStr.includes('failed to connect') || errStr.includes('npipe') || errStr.includes('daemon')) {
      return { active: false, error: 'Docker daemon stopped' };
    }
    return { active: true };
  },

  getFallbackItem() {
    return {
      id: 'docker:stopped',
      group: 'Docker Containers',
      title: 'Docker Desktop is stopped',
      subtitle: 'Click to start the Docker Desktop service',
      actions: [
        { id: 'start-docker', title: 'Start Docker Desktop', shortcut: '↵', run: () => ({ ok: true, started: true }) }
      ]
    };
  }
};

// ---------------------------------------------------------------------------
// 4. GitHub / GitLab Shortcuts
// ---------------------------------------------------------------------------
export const GitHubShortcuts = {
  loadModule() {
    return tryRequire('../src/main/github-shortcuts.js');
  },

  parseShortcut(query) {
    const realMod = this.loadModule();
    if (realMod && typeof realMod.parseQuery === 'function') {
      const res = realMod.parseQuery(query);
      if (res) {
        return {
          ...res,
          type: res.kind
        };
      }
    }

    const q = String(query || '').trim();
    const parts = q.split(/\s+/);
    const prefix = parts[0]?.toLowerCase();
    const sub = parts[1]?.toLowerCase();
    const rest = parts.slice(2).join(' ').trim();

    if (prefix === 'gh') {
      if (sub === 'pr' || sub === 'prs' || sub === 'pulls') {
        return {
          platform: 'github',
          type: 'pr',
          kind: 'pr',
          query: rest,
          url: rest ? `https://github.com/pulls?q=${encodeURIComponent(rest)}` : 'https://github.com/pulls'
        };
      }
      if (sub === 'issue' || sub === 'issues') {
        return {
          platform: 'github',
          type: 'issue',
          kind: 'issue',
          query: rest,
          url: rest ? `https://github.com/issues?q=${encodeURIComponent(rest)}` : 'https://github.com/issues'
        };
      }
      if (sub === 'repo' || sub === 'repos') {
        return {
          platform: 'github',
          type: 'repo',
          kind: 'repo',
          query: rest,
          url: rest ? `https://github.com/search?q=${encodeURIComponent(rest)}&type=repositories` : 'https://github.com'
        };
      }
      // General github search fallback
      const fullQuery = parts.slice(1).join(' ').trim();
      return {
        platform: 'github',
        type: 'search',
        kind: 'search',
        query: fullQuery,
        url: `https://github.com/search?q=${encodeURIComponent(fullQuery)}`
      };
    }

    if (prefix === 'glab' || prefix === 'gl') {
      if (sub === 'mr' || sub === 'mrs' || sub === 'merge_requests') {
        return {
          platform: 'gitlab',
          type: 'mr',
          kind: 'mr',
          query: rest,
          url: rest ? `https://gitlab.com/dashboard/merge_requests?search=${encodeURIComponent(rest)}` : 'https://gitlab.com/dashboard/merge_requests'
        };
      }
      if (sub === 'issue' || sub === 'issues') {
        return {
          platform: 'gitlab',
          type: 'issue',
          kind: 'issue',
          query: rest,
          url: rest ? `https://gitlab.com/dashboard/issues?search=${encodeURIComponent(rest)}` : 'https://gitlab.com/dashboard/issues'
        };
      }
      if (sub === 'repo' || sub === 'repos' || sub === 'project' || sub === 'projects') {
        return {
          platform: 'gitlab',
          type: 'repo',
          kind: 'repo',
          query: rest,
          url: rest ? `https://gitlab.com/explore/projects?name=${encodeURIComponent(rest)}` : 'https://gitlab.com'
        };
      }
    }

    return null;
  }
};

// ---------------------------------------------------------------------------
// 5. Audio Output & Microphone Device Switcher
// ---------------------------------------------------------------------------
export const AudioManager = {
  loadModule() {
    return tryRequire('../src/main/audio-manager.js');
  },

  parseEndpoints(rawOutput) {
    if (!rawOutput) return { playback: [], recording: [] };

    const parseList = (arr, defaultType = 'Playback') => {
      if (!arr) return [];
      const list = Array.isArray(arr) ? arr : [arr];
      return list.filter(Boolean).map(line => {
        const parts = String(line).split('|');
        if (parts.length < 2) return null;
        return {
          id: parts[0].trim(),
          name: parts[1].trim(),
          isDefault: parts[2]?.trim() === '1',
          type: parts[3] ? (parts[3].toLowerCase().includes('rec') ? 'Recording' : 'Playback') : defaultType
        };
      }).filter(Boolean);
    };

    if (typeof rawOutput === 'object') {
      return {
        playback: parseList(rawOutput.Playback || rawOutput.playback, 'Playback'),
        recording: parseList(rawOutput.Recording || rawOutput.recording, 'Recording')
      };
    }

    try {
      const parsed = JSON.parse(rawOutput);
      return {
        playback: parseList(parsed.Playback || parsed.playback, 'Playback'),
        recording: parseList(parsed.Recording || parsed.recording, 'Recording')
      };
    } catch {
      return { playback: [], recording: [] };
    }
  },

  setDefaultDevice(deviceId, devList) {
    const realMod = this.loadModule();
    if (realMod && typeof realMod.setDefaultDevice === 'function') {
      return realMod.setDefaultDevice(deviceId);
    }
    const found = devList.find(d => d.id === deviceId);
    if (!found) {
      return Promise.resolve({ ok: false, error: 'Audio device not found' });
    }
    return Promise.resolve({ ok: true, deviceId, name: found.name });
  }
};

// ---------------------------------------------------------------------------
// 6. Windows Services Manager
// ---------------------------------------------------------------------------
export const ServicesManager = {
  loadModule() {
    return tryRequire('../src/main/services-manager.js');
  },

  parseServices(servicesData) {
    const list = Array.isArray(servicesData) ? servicesData : [];
    return list.map(s => {
      let status = 'Stopped';
      if (s.Status === 4 || s.Status === 'Running' || String(s.Status).toLowerCase() === 'running') {
        status = 'Running';
      } else if (s.Status === 1 || s.Status === 'Stopped' || String(s.Status).toLowerCase() === 'stopped') {
        status = 'Stopped';
      } else if (s.Status === 7 || s.Status === 'Paused') {
        status = 'Paused';
      }

      let startType = 'Manual';
      if (s.StartType === 2 || s.StartType === 'Automatic') startType = 'Automatic';
      else if (s.StartType === 3 || s.StartType === 'Manual') startType = 'Manual';
      else if (s.StartType === 4 || s.StartType === 'Disabled') startType = 'Disabled';

      return {
        name: s.Name || s.name || '',
        displayName: s.DisplayName || s.displayName || s.Name || '',
        status,
        startType
      };
    });
  },

  filterServices(services, query) {
    const q = String(query || '').toLowerCase().trim();
    if (!q) return services;
    return services.filter(s =>
      s.name.toLowerCase().includes(q) || s.displayName.toLowerCase().includes(q)
    );
  },

  controlService(serviceName, action, servicesList) {
    const realMod = this.loadModule();
    if (realMod && typeof realMod.controlService === 'function') {
      return realMod.controlService(serviceName, action);
    }
    const s = servicesList.find(x => x.name.toLowerCase() === serviceName.toLowerCase());
    if (!s) return Promise.resolve({ ok: false, error: 'Service not found' });

    if (action === 'Start') s.status = 'Running';
    else if (action === 'Stop') s.status = 'Stopped';
    else if (action === 'Restart') s.status = 'Running';

    return Promise.resolve({ ok: true, name: s.name, status: s.status, action });
  }
};

// ---------------------------------------------------------------------------
// 7. Environment Variables Manager
// ---------------------------------------------------------------------------
export const EnvManager = {
  loadModule() {
    return tryRequire('../src/main/env-manager.js');
  },

  parsePathEntries(pathValue) {
    if (!pathValue || typeof pathValue !== 'string') return [];
    const segments = pathValue.split(';').map(s => s.trim().replace(/^"(.*)"$/, '$1')).filter(Boolean);
    const seen = new Set();
    const results = [];

    for (const seg of segments) {
      if (seen.has(seg)) continue;
      seen.add(seg);
      let exists = false;
      try {
        exists = fs.existsSync(seg);
      } catch {
        exists = false;
      }
      results.push({ path: seg, exists });
    }
    return results;
  },

  filterEnv(envMap, query) {
    const q = String(query || '').toLowerCase().trim();
    const entries = Object.entries(envMap || {}).map(([key, value]) => ({
      name: key,
      value: String(value || ''),
      scope: key.startsWith('USER_') ? 'User' : 'Machine'
    }));
    if (!q) return entries;
    return entries.filter(e => e.name.toLowerCase().includes(q) || e.value.toLowerCase().includes(q));
  }
};

// ---------------------------------------------------------------------------
// 8. Package Manager Updater (winget)
// ---------------------------------------------------------------------------
export const WingetManager = {
  loadModule() {
    return tryRequire('../src/main/winget-manager.js');
  },

  parseUpgradeTable(stdout) {
    const lines = String(stdout || '').split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length < 2) return [];

    const headerIdx = lines.findIndex(l => l.includes('Name') && l.includes('Id') && l.includes('Version'));
    if (headerIdx === -1 || headerIdx >= lines.length - 1) return [];

    const header = lines[headerIdx];
    const idPos = header.indexOf('Id');
    const verPos = header.indexOf('Version');
    const availPos = header.indexOf('Available');
    const srcPos = header.indexOf('Source');

    const results = [];
    for (let i = headerIdx + 2; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('-') || line.trim().length === 0) continue;

      let name = '', id = '', version = '', available = '', source = 'winget';
      if (idPos !== -1 && verPos !== -1 && availPos !== -1) {
        name = line.slice(0, idPos).trim();
        id = line.slice(idPos, verPos).trim();
        version = line.slice(verPos, availPos).trim();
        available = srcPos !== -1 ? line.slice(availPos, srcPos).trim() : line.slice(availPos).trim();
        source = srcPos !== -1 ? line.slice(srcPos).trim() : 'winget';
      } else {
        const parts = line.trim().split(/\s{2,}/);
        if (parts.length >= 4) {
          name = parts[0];
          id = parts[1];
          version = parts[2];
          available = parts[3];
          source = parts[4] || 'winget';
        }
      }

      if (id && available) {
        results.push({
          name: name || id,
          id,
          currentVersion: version,
          availableVersion: available,
          source
        });
      }
    }
    return results;
  },

  formatDiff(item) {
    return `${item.currentVersion} -> ${item.availableVersion}`;
  },

  buildUpgradeCmd(id) {
    return `winget upgrade --id ${id} --accept-source-agreements --accept-package-agreements`;
  }
};

// ---------------------------------------------------------------------------
// 9. Hosts File Quick Editor
// ---------------------------------------------------------------------------
export const HostsEditor = {
  loadModule() {
    return tryRequire('../src/main/hosts-editor.js');
  },

  parseHosts(content) {
    const lines = String(content || '').split(/\r?\n/);
    const rules = [];

    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx];
      const trimmed = line.trim();
      if (!trimmed) continue;

      let enabled = true;
      let text = trimmed;
      if (text.startsWith('#')) {
        enabled = false;
        text = text.slice(1).trim();
      }

      const inlineCommentIdx = text.indexOf('#');
      let inlineComment = '';
      if (inlineCommentIdx !== -1) {
        inlineComment = text.slice(inlineCommentIdx + 1).trim();
        text = text.slice(0, inlineCommentIdx).trim();
      }

      const parts = text.split(/\s+/);
      const ip = parts[0];
      const domains = parts.slice(1);

      const isIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(ip) || ip.includes(':') || ip === 'localhost';
      if (isIp && domains.length > 0) {
        for (const domain of domains) {
          rules.push({
            id: `host:${domain}:${idx}`,
            lineIndex: idx,
            ip,
            domain,
            enabled,
            comment: inlineComment,
            originalLine: line
          });
        }
      }
    }
    return rules;
  },

  toggleRule(rule, content) {
    const lines = String(content || '').split(/\r?\n/);
    if (rule.lineIndex < 0 || rule.lineIndex >= lines.length) return content;

    const line = lines[rule.lineIndex];
    if (rule.enabled) {
      lines[rule.lineIndex] = `# ${line}`;
    } else {
      lines[rule.lineIndex] = line.replace(/^\s*#\s*/, '');
    }
    return lines.join('\n');
  }
};

// ---------------------------------------------------------------------------
// 10. SMTC / Media Now Playing HUD
// ---------------------------------------------------------------------------
export const MediaHud = {
  loadModule() {
    return tryRequire('../src/main/media-hud.js');
  },

  clampVolume(val) {
    const num = parseInt(val, 10);
    if (isNaN(num)) return 50;
    return Math.max(0, Math.min(100, num));
  },

  parseSession(data) {
    if (!data || data === 'NO_ACTIVE_SESSION' || data.noSession) {
      return { active: false, status: 'No media playing' };
    }
    return {
      active: true,
      title: data.Title || data.title || 'Unknown Title',
      artist: data.Artist || data.artist || 'Unknown Artist',
      album: data.AlbumTitle || data.album || 'Unknown Album',
      status: data.PlaybackStatus || data.status || 'Playing',
      app: data.SourceAppUserModelId || data.app || 'Media Player',
      volume: this.clampVolume(data.volume !== undefined ? data.volume : 50)
    };
  }
};

// ---------------------------------------------------------------------------
// 11. Floating Detached Scratchpad / HUD Mode (Ctrl+Shift+D)
// ---------------------------------------------------------------------------
export const HudWindow = {
  loadModule() {
    return tryRequire('../src/main/hud-window.js');
  },

  createMockHudManager() {
    let isOpen = false;
    let isDestroyed = false;
    let currentPayload = null;

    return {
      hotkey: 'Ctrl+Shift+D',
      windowOptions: {
        width: 380,
        height: 440,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        resizable: true,
        skipTaskbar: false
      },
      isOpen: () => isOpen,
      isDestroyed: () => isDestroyed,
      getPayload: () => currentPayload,
      detach(payload) {
        if (!payload) {
          payload = { type: 'note', title: 'Scratchpad', content: '' };
        }
        currentPayload = payload;
        isOpen = true;
        isDestroyed = false;
        return { ok: true, detached: true, payload };
      },
      toggle() {
        isOpen = !isOpen;
        return { ok: true, isOpen };
      },
      close() {
        isOpen = false;
        isDestroyed = true;
        return { ok: true };
      }
    };
  }
};

// ---------------------------------------------------------------------------
// 12. Parameterized Quicklinks
// ---------------------------------------------------------------------------
export const QuicklinksManager = {
  loadModule() {
    return tryRequire('../src/main/quicklinks-manager.js');
  },

  createEngine(customTemplates = []) {
    const templates = [
      { id: 'ql:jira', name: 'Jira Issue', prefix: 'jira', template: 'https://jira.company.com/browse/{ticket}', description: 'Open Jira issue ticket' },
      { id: 'ql:gh-pr', name: 'GitHub PR', prefix: 'pr', template: 'https://github.com/{owner}/{repo}/pull/{number}', description: 'Open GitHub Pull Request' },
      { id: 'ql:linear', name: 'Linear Issue', prefix: 'lin', template: 'https://linear.app/{workspace}/issue/{issue}', description: 'Open Linear issue' },
      { id: 'ql:npm-pkg', name: 'npm Package', prefix: 'npm', template: 'https://www.npmjs.com/package/{package}', description: 'View npm package page' },
      { id: 'ql:so', name: 'StackOverflow', prefix: 'so', template: 'https://stackoverflow.com/search?q={query}', description: 'Search Stack Overflow' },
      ...customTemplates
    ];

    function interpolate(template, args = []) {
      const placeholders = [...template.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map(m => m[1]);
      if (placeholders.length === 0) return { url: template, missing: [] };

      let url = template;
      const missing = [];
      for (let i = 0; i < placeholders.length; i++) {
        const ph = placeholders[i];
        let val = args[i];
        if (placeholders.length === 1 && args.length > 1) {
          val = args.join(' ');
        }
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          url = url.replace(new RegExp(`\\{${ph}\\}`, 'g'), encodeURIComponent(String(val)));
        } else {
          missing.push(ph);
        }
      }
      return { url, missing };
    }

    function matchQuery(query) {
      const q = String(query || '').trim();
      const parts = q.split(/\s+/);
      const prefix = parts[0]?.toLowerCase();
      const args = parts.slice(1);

      const t = templates.find(item => item.prefix === prefix);
      if (!t) return null;

      const { url, missing } = interpolate(t.template, args);
      return {
        matched: true,
        template: t,
        args,
        resolvedUrl: url,
        isComplete: missing.length === 0,
        missingParams: missing
      };
    }

    return {
      templates,
      interpolate,
      matchQuery,
      addTemplate: (t) => { templates.push(t); return t; },
      deleteTemplate: (id) => {
        const idx = templates.findIndex(t => t.id === id);
        if (idx !== -1) templates.splice(idx, 1);
        return idx !== -1;
      }
    };
  }
};
