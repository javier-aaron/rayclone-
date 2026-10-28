'use strict';

const { shell, clipboard } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const store = require('../store');
const scriptsManager = require('../scripts-manager');
const portInspector = require('../port-inspector');
const gitIndexer = require('../git-indexer');
const dockerManager = require('../docker-manager');
const githubShortcuts = require('../github-shortcuts');
const terminalIntegration = require('../terminal-integration');
const projectLauncher = require('../project-launcher');
const vscodeWorkspaces = require('../vscode-workspaces');
const wslManager = require('../wsl-manager');
const extensionStore = require('../extension-store');
const extensionEngine = require('../extension-engine');
const { fuzzy, scoreItem, HOME } = require('./utils');

function scriptsProvider() {
  return {
    id: 'scripts',
    name: 'Script Commands',
    group: 'Script Commands',
    warm: () => scriptsManager.scan(),
    all: () => {
      const list = scriptsManager.getScripts();
      return list.map((s) => ({
        id: s.id,
        provider: 'scripts',
        group: 'Script Commands',
        title: s.title,
        subtitle: `${s.packageName} · ${s.filename}`,
        filePath: s.filePath,
        packageName: s.packageName,
        description: s.description,
        mode: s.mode,
        icon: { kind: 'glyph', name: 'code' },
        actions: [
          {
            id: 'run',
            title: `Run ${s.title}`,
            shortcut: '↵',
            run: async () => {
              const res = await scriptsManager.runScript(s);
              if (res.ok && res.output) {
                clipboard.writeText(res.output);
              }
              return { hide: s.mode === 'silent', output: res.output, error: res.error };
            }
          },
          {
            id: 'edit',
            title: 'Edit Script',
            shortcut: 'Ctrl+Shift+O',
            run: () => shell.openPath(s.filePath)
          }
        ]
      }));
    },
    search(query) {
      const q = String(query || '').trim();
      if (!q) return [];
      const list = scriptsManager.getScripts();
      return list.map((s) => ({
        id: s.id,
        provider: 'scripts',
        group: 'Script Commands',
        title: s.title,
        subtitle: `${s.packageName} · ${s.filename}`,
        keywords: ['script', s.packageName.toLowerCase(), s.filename.toLowerCase()],
        filePath: s.filePath,
        packageName: s.packageName,
        description: s.description,
        mode: s.mode,
        icon: { kind: 'glyph', name: 'code' },
        actions: [
          {
            id: 'run',
            title: `Run ${s.title}`,
            shortcut: '↵',
            run: async () => {
              const res = await scriptsManager.runScript(s);
              if (res.ok && res.output) {
                clipboard.writeText(res.output);
              }
              return { hide: s.mode === 'silent', output: res.output, error: res.error };
            }
          },
          {
            id: 'edit',
            title: 'Edit Script',
            shortcut: 'Ctrl+Shift+O',
            run: () => shell.openPath(s.filePath)
          }
        ]
      }));
    }
  };
}

// ============================================================ provider: processes


function portInspectorProvider() {
  function toItem(p, isExplicit) {
    const procLabel = p.processName && p.processName !== 'Unknown' ? p.processName : `PID ${p.pid}`;
    return {
      id: `port:${p.port}`,
      provider: 'ports',
      group: 'Listening Ports',
      title: `Port ${p.port} (${procLabel})`,
      subtitle: `PID: ${p.pid} · ${p.address} · ${p.state || 'LISTENING'}`,
      keywords: ['port', 'kill port', 'killport', 'listen', 'socket', String(p.port), String(p.pid), p.processName],
      scoreBoost: isExplicit ? 260 : 160,
      icon: { kind: 'glyph', name: 'process' },
      port: p.port,
      pid: p.pid,
      processName: p.processName,
      commandLine: p.commandLine,
      state: p.state || 'LISTENING',
      address: p.address,
      memory: p.memory,
      portData: {
        port: p.port,
        pid: p.pid,
        processName: p.processName,
        commandLine: p.commandLine
      },
      actions: [
        {
          id: 'kill',
          title: `Kill Process on Port ${p.port} (${procLabel})`,
          shortcut: '↵',
          run: () => portInspector.killPort(p.port)
        },
        {
          id: 'copy-pid',
          title: `Copy PID (${p.pid})`,
          shortcut: 'Ctrl+C',
          run: () => {
            if (clipboard && typeof clipboard.writeText === 'function') {
              clipboard.writeText(String(p.pid));
            }
            return Promise.resolve(p.pid);
          }
        },
        {
          id: 'copy-port',
          title: `Copy Port (${p.port})`,
          shortcut: 'Ctrl+Shift+C',
          run: () => {
            if (clipboard && typeof clipboard.writeText === 'function') {
              clipboard.writeText(String(p.port));
            }
            return Promise.resolve(p.port);
          }
        }
      ]
    };
  }

  return {
    id: 'ports',
    name: 'Port Inspector',
    group: 'Listening Ports',
    warm: () => portInspector.scanPorts(),
    all: () => (portInspector.getCachedPorts() || []).map((p) => toItem(p, false)),
    async search(query) {
      const q = String(query || '').trim();
      if (!q) return [];

      const portNumMatch = q.match(/^(?:kill\s+port|killport|port)\s*(\d+)?$/i);
      const isKillOnly = q.match(/^kill\s+(\d+)$/i);
      const isPortQuery = /^port\b/i.test(q) || /^kill\s+port\b/i.test(q) || /^killport\b/i.test(q);

      const ports = (portNumMatch || isKillOnly || isPortQuery) ? await portInspector.scanPorts() : (portInspector.getCachedPorts() || []);

      if (portNumMatch) {
        const targetNum = portNumMatch[1];
        if (targetNum) {
          const matched = ports.filter((p) => String(p.port) === targetNum || String(p.port).startsWith(targetNum));
          return matched.map((p) => toItem(p, true));
        }
        return ports.map((p) => toItem(p, true));
      }

      if (isKillOnly) {
        const targetNum = isKillOnly[1];
        const matched = ports.filter((p) => String(p.port) === targetNum || String(p.pid) === targetNum);
        if (matched.length > 0) {
          return matched.map((p) => toItem(p, true));
        }
      }

      if (isPortQuery) {
        const rest = q.replace(/^(?:kill\s+port|killport|port)\s*/i, '').toLowerCase();
        if (!rest) return ports.map((p) => toItem(p, true));
        return ports
          .filter((p) => String(p.port).includes(rest) || String(p.pid).includes(rest) || (p.processName && p.processName.toLowerCase().includes(rest)))
          .map((p) => toItem(p, true));
      }

      return ports
        .filter((p) => String(p.port) === q || (p.processName && p.processName.toLowerCase().includes(q.toLowerCase())))
        .map((p) => toItem(p, false));
    }
  };
}

// ============================================================ Git Repositories Indexer (M1)


function gitRepositoriesProvider() {
  function toItem(r, isPrefixed) {
    const dirtyLabel = r.dirty ? `● dirty (${r.dirtyCount || 1})` : '✓ clean';
    return {
      id: `git:${r.name}:${r.path}`,
      provider: 'git',
      group: 'Git Repositories',
      title: r.name,
      subtitle: `${r.branch} ${dirtyLabel} · ${r.path}`,
      keywords: ['git', 'repo', 'repository', r.name, r.branch],
      scoreBoost: isPrefixed ? 250 : 150,
      icon: { kind: 'glyph', name: 'app' },
      path: r.path,
      name: r.name,
      repoName: r.name,
      branch: r.branch,
      dirty: r.dirty,
      dirtyCount: r.dirtyCount,
      gitData: {
        path: r.path,
        branch: r.branch,
        dirty: r.dirty,
        dirtyCount: r.dirtyCount
      },
      actions: [
        {
          id: 'code',
          title: `Open in VS Code`,
          shortcut: '↵',
          run: () => gitIndexer.openInVSCode(r.path)
        },
        {
          id: 'terminal',
          title: `Open in Terminal`,
          shortcut: 'Ctrl+T',
          run: () => gitIndexer.openInTerminal(r.path)
        },
        {
          id: 'explorer',
          title: `Open in File Explorer`,
          shortcut: 'Ctrl+E',
          run: () => gitIndexer.openInExplorer(r.path)
        }
      ]
    };
  }

  return {
    id: 'git',
    name: 'Git Repositories',
    group: 'Git Repositories',
    warm: () => gitIndexer.scanRepositories(),
    all: () => gitIndexer.getRepositories().map((r) => toItem(r, false)),
    async search(query) {
      const q = String(query || '').trim();
      if (!q) return [];

      let repos = gitIndexer.getRepositories();
      if (!repos || repos.length === 0) {
        repos = await gitIndexer.scanRepositories();
      }

      const isPrefixed = /^git\s+/i.test(q) || /^repo\s+/i.test(q);
      const cleanQ = q.replace(/^(?:git|repo)\s+/i, '').trim().toLowerCase();

      if (q.toLowerCase() === 'git' || q.toLowerCase() === 'repo') {
        return repos.map((r) => toItem(r, true));
      }

      if (!cleanQ) {
        return repos.map((r) => toItem(r, isPrefixed));
      }

      return repos
        .filter((r) => r.name.toLowerCase().includes(cleanQ) || r.branch.toLowerCase().includes(cleanQ) || r.path.toLowerCase().includes(cleanQ))
        .map((r) => toItem(r, isPrefixed));
    }
  };
}

// ============================================================ Docker & Container Manager (M1)


function dockerManagerProvider() {
  return {
    id: 'docker',
    name: 'Docker Manager',
    group: 'Docker Containers',
    warm: () => dockerManager.checkDockerStatus(),
    all: () => [],
    async search(query) {
      const q = String(query || '').trim();
      if (!q) return [];

      const isDockerQuery = /^docker\b/i.test(q) || /^dps\b/i.test(q) || /^container\b/i.test(q);
      if (!isDockerQuery) return [];

      const status = await dockerManager.checkDockerStatus();

      if (!status.running) {
        if (!isDockerQuery) return [];
        return [
          {
            id: 'docker:status:stopped',
            provider: 'docker',
            group: 'Docker Containers',
            title: 'Docker Desktop is stopped',
            subtitle: status.message || 'Docker daemon is not running. Click to launch Docker Desktop.',
            scoreBoost: 260,
            icon: { kind: 'glyph', name: 'process' },
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
                run: () => dockerManager.startDockerDesktop()
              }
            ]
          }
        ];
      }

      const containers = await dockerManager.listContainers();
      const term = q.replace(/^(?:docker|dps|container)\s*/i, '').trim().toLowerCase();

      const filtered = term
        ? containers.filter((c) => c.name.toLowerCase().includes(term) || c.image.toLowerCase().includes(term) || c.id.toLowerCase().includes(term))
        : containers;

      return filtered.map((c) => {
        const isRunning = c.running || c.state === 'running';
        const actions = [];
        if (isRunning) {
          actions.push({
            id: 'stop',
            title: `Stop Container (${c.name})`,
            shortcut: '↵',
            run: () => dockerManager.stopContainer(c.id)
          });
          actions.push({
            id: 'restart',
            title: `Restart Container (${c.name})`,
            shortcut: 'Ctrl+R',
            run: () => dockerManager.restartContainer(c.id)
          });
        } else {
          actions.push({
            id: 'start',
            title: `Start Container (${c.name})`,
            shortcut: '↵',
            run: () => dockerManager.startContainer(c.id)
          });
        }
        actions.push({
          id: 'logs',
          title: `View Logs (tail 50)`,
          shortcut: 'Ctrl+L',
          run: () => dockerManager.getContainerLogs(c.id, 50)
        });

        return {
          id: `docker:${c.id}`,
          provider: 'docker',
          group: 'Docker Containers',
          title: `${c.name} (${c.id.slice(0, 12)})`,
          subtitle: `${c.image} · ${c.status || c.state}${c.ports ? ' · ' + c.ports : ''}`,
          scoreBoost: isDockerQuery ? 250 : 160,
          icon: { kind: 'glyph', name: 'process' },
          containerId: c.id,
          image: c.image,
          state: c.state,
          status: c.status,
          ports: c.ports,
          dockerData: {
            id: c.id,
            name: c.name,
            image: c.image,
            status: c.status,
            ports: c.ports
          },
          actions
        };
      });
    }
  };
}

// ============================================================ GitHub / GitLab Shortcuts (M1)


function githubShortcutsProvider() {
  return {
    id: 'github-shortcuts',
    name: 'GitHub / GitLab',
    group: 'GitHub / GitLab',
    warm: () => Promise.all([githubShortcuts.checkGhCli(), githubShortcuts.checkGlabCli()]),
    all: () => [],
    async search(query) {
      const q = String(query || '').trim();
      if (!q) return [];

      const parsed = githubShortcuts.parseQuery(q);
      if (!parsed) return [];

      const isGithub = parsed.platform === 'github';
      const platformName = isGithub ? 'GitHub' : 'GitLab';
      const kindLabels = {
        pr: 'Pull Requests',
        issue: 'Issues',
        repo: isGithub ? 'Repositories' : 'Projects',
        mr: 'Merge Requests'
      };
      const kindLabel = kindLabels[parsed.kind] || parsed.kind.toUpperCase();

      const title = parsed.query
        ? `Search ${platformName} ${kindLabel}: "${parsed.query}"`
        : `Open ${platformName} ${kindLabel}`;

      return [
        {
          id: `${parsed.platform}:${parsed.kind}:${parsed.query || 'dashboard'}`,
          provider: 'github-shortcuts',
          group: 'GitHub / GitLab',
          title,
          subtitle: `Open ${parsed.url}`,
          scoreBoost: 260,
          targetUrl: parsed.url,
          platform: platformName,
          query: parsed.query,
          icon: { kind: 'glyph', name: 'globe' },
          actions: [
            {
              id: 'open',
              title: `Open in Browser`,
              shortcut: '↵',
              run: () => githubShortcuts.openUrl(parsed.url)
            },
            {
              id: 'copy',
              title: `Copy URL`,
              shortcut: 'Ctrl+C',
              run: () => {
                if (clipboard && typeof clipboard.writeText === 'function') {
                  clipboard.writeText(parsed.url);
                }
                return Promise.resolve(parsed.url);
              }
            }
          ]
        }
      ];
    }
  };
}

// ============================================================ Audio Switcher (M2)


function terminalIntegrationProvider() {
  return {
    id: 'terminal',
    name: 'Terminal & SSH',
    all: () => {
      const profiles = terminalIntegration.getTerminalProfiles();
      return profiles.map((p) => ({
        id: `term:profile:${p.name}`,
        provider: 'terminal',
        group: 'Terminal',
        title: `Open Terminal: "${p.name}"`,
        subtitle: `Command: ${p.commandline}`,
        icon: '💻',
        keywords: ['terminal', 'wt', 'console', p.name],
        actions: [
          {
            id: 'launch',
            title: `Open ${p.name}`,
            shortcut: '↵',
            run: () => terminalIntegration.launchTerminalProfile(p.name)
          }
        ]
      }));
    },
    search: (query) => {
      const q = String(query || '').trim().toLowerCase();
      if (!q) return [];
      if (['term', 'wt', 'ssh', 'bash', 'console'].some((k) => q.includes(k))) {
        const hosts = terminalIntegration.getSshHosts();
        const items = terminalIntegrationProvider().all();
        for (const h of hosts) {
          items.push({
            id: `ssh:host:${h.name}`,
            provider: 'terminal',
            group: 'Terminal',
            title: `SSH Connect: "${h.name}"`,
            subtitle: `ssh ${h.user ? h.user + '@' : ''}${h.hostname} -p ${h.port}`,
            icon: '🌐',
            scoreBoost: 160,
            keywords: ['ssh', h.name, h.hostname],
            actions: [
              {
                id: 'connect',
                title: 'Connect via Terminal',
                shortcut: '↵',
                run: () => terminalIntegration.connectToSshHost(h.name)
              }
            ]
          });
        }
        return items;
      }
      return [];
    }
  };
}


function projectLauncherProvider() {
  return {
    id: 'projects',
    name: 'Project Workspace Launcher',
    all: () => {
      const projects = projectLauncher.listProjects();
      return projects.map((p) => ({
        id: `proj:launch:${p.id}`,
        provider: 'projects',
        group: 'Projects',
        title: `Launch Project: "${p.name}"`,
        subtitle: `Opens VS Code + Terminal in ${p.directory}`,
        icon: '🚀',
        keywords: ['project', 'workspace', p.name],
        actions: [
          {
            id: 'launch',
            title: 'Launch Workspace',
            shortcut: '↵',
            run: () => projectLauncher.launchProject(p.id)
          }
        ]
      }));
    },
    search: (query) => {
      const q = String(query || '').trim().toLowerCase();
      if (!q) return [];
      if (['project', 'proj', 'workspace'].some((k) => q.includes(k))) {
        return projectLauncherProvider().all();
      }
      return [];
    }
  };
}


function extensionStoreProvider() {
  return {
    id: 'extension-store',
    name: 'Rayclone Extension Store',
    all: () => {
      const list = extensionStore.listExtensions();
      return list.map((ext) => ({
        id: `ext:store:${ext.id}`,
        provider: 'extension-store',
        group: 'Extensions',
        title: `${ext.name} (v${ext.version}) ${ext.installed ? '• Installed' : ''}`,
        subtitle: `${ext.description} • By ${ext.author}`,
        icon: ext.icon,
        keywords: ['store', 'extension', 'plugin', ext.name, ext.category],
        actions: [
          {
            id: ext.installed ? 'uninstall' : 'install',
            title: ext.installed ? 'Uninstall Extension' : 'Install Extension',
            shortcut: '↵',
            run: () => (ext.installed ? extensionStore.uninstallExtension(ext.id) : extensionStore.installExtension(ext.id))
          }
        ]
      }));
    },
    search: (query) => {
      const q = String(query || '').trim().toLowerCase();
      if (!q) return [];
      if (['store', 'extension', 'plugin', 'addon'].some((k) => q.includes(k))) {
        return extensionStoreProvider().all();
      }
      return [];
    }
  };
}


function vscodeWorkspacesProvider() {
  return {
    id: 'vscode-workspaces',
    name: 'VS Code Workspaces',
    all: async () => {
      const items = await vscodeWorkspaces.loadRecentWorkspaces();
      return items.slice(0, 8).map(vscodeWorkspaces.formatWorkspaceItem);
    },
    search: async (query) => {
      const q = String(query || '').trim();
      const isExplicit = q.startsWith('{') || q.toLowerCase().startsWith('vsc:');
      const clean = q.replace(/^(\{|vsc:\s*)/i, '').trim();
      if (!isExplicit && !['vscode', 'workspace', 'code'].some((k) => q.toLowerCase().includes(k))) return [];

      await vscodeWorkspaces.loadRecentWorkspaces();
      const items = vscodeWorkspaces.searchWorkspaces(clean);
      return items.map((it) => {
        const item = it.group ? it : vscodeWorkspaces.formatWorkspaceItem(it);
        if (isExplicit) item.scoreBoost = (item.scoreBoost || 0) + 250;
        return item;
      });
    }
  };
}


function wslProvider() {
  return {
    id: 'wsl',
    name: 'WSL Distributions',
    all: async () => {
      const list = await wslManager.listDistros();
      return list.map(wslManager.formatDistroItem);
    },
    search: async (query) => {
      const q = String(query || '').trim().toLowerCase();
      if (!q) return [];
      if (q.startsWith('wsl') || ['ubuntu', 'debian', 'distro', 'linux', 'bash'].some((k) => q.includes(k))) {
        return wslManager.searchWsl(query);
      }
      return [];
    }
  };
}


function sandboxedExtensionProvider() {
  return {
    id: 'sandboxed-extensions',
    name: 'Built-in Tools',
    all: () => {
      return extensionEngine.BUILTIN_EXTENSIONS.map(extensionEngine.formatExtensionItem);
    },
    search: async (query) => {
      const q = String(query || '').trim().toLowerCase();
      if (!q) return [];
      if (q.startsWith('ext') || ['extension', 'plugin', 'hash', 'slug', 'lorem', 'sandbox'].some((k) => q.includes(k))) {
        return extensionEngine.searchExtensions(query);
      }
      return [];
    }
  };
}

// ============================================================ registry



module.exports = {
  scriptsProvider,
  portInspectorProvider,
  gitRepositoriesProvider,
  dockerManagerProvider,
  githubShortcutsProvider,
  terminalIntegrationProvider,
  projectLauncherProvider,
  extensionStoreProvider,
  vscodeWorkspacesProvider,
  wslProvider,
  sandboxedExtensionProvider
};
