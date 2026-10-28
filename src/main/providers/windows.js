'use strict';

const { shell, clipboard } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const store = require('../store');
const windowsRun = require('../windows-run');
const servicesManager = require('../services-manager');
const envManager = require('../env-manager');
const wingetManager = require('../winget-manager');
const hostsEditor = require('../hosts-editor');
const windowsSettings = require('../windows-settings');
const registryExplorer = require('../registry-explorer');
const windowWalker = require('../window-walker');
const dnsSwitcher = require('../dns-switcher');
const { fuzzy, scoreItem, HOME } = require('./utils');

function windowsRunProvider() {
  return {
    id: 'windows-run',
    name: 'Run',
    group: 'Run',
    all: () => [
      {
        id: 'run:dialog',
        provider: 'windows-run',
        group: 'Run',
        title: 'Open Run: Execute Shell Commands & Binaries',
        subtitle: 'Prefix queries with ">" to run Windows executables, cpl, or msc tools',
        icon: { kind: 'glyph', name: 'terminal' },
        actions: [
          {
            id: 'open',
            title: 'Open Run Prompt',
            shortcut: '↵',
            run: () => windowsRun.execute('cmd.exe')
          }
        ]
      }
    ],
    search(query) {
      const q = String(query || '').trim();
      if (!q.startsWith('>') && !/^run\s+/i.test(q)) return [];

      const results = windowsRun.searchRun(q);
      return results.map((r) => ({
        id: r.id,
        provider: 'windows-run',
        group: 'Run',
        title: r.title,
        subtitle: r.description || `Execute "${r.command}"`,
        command: r.command,
        description: r.description,
        scoreBoost: 260,
        icon: { kind: 'glyph', name: 'terminal' },
        actions: [
          {
            id: 'exec',
            title: `Run "${r.command}"`,
            shortcut: '↵',
            run: () => windowsRun.execute(r.command, false)
          },
          {
            id: 'exec-admin',
            title: 'Run as Administrator',
            shortcut: 'Ctrl+Shift+↵',
            run: () => windowsRun.execute(r.command, true)
          },
          {
            id: 'copy',
            title: 'Copy Command',
            shortcut: 'Ctrl+C',
            run: () => clipboard.writeText(r.command)
          }
        ]
      }));
    }
  };
}

// ============================================================ provider: typing practice


function windowsServicesProvider() {
  function toItem(s, isPrefixed) {
    const isRunning = s.status === 'Running';
    const statusBadge = isRunning ? '● Running' : '○ Stopped';
    const actions = [];

    if (isRunning) {
      actions.push({
        id: 'restart',
        title: `Restart Service (${s.displayName || s.name})`,
        shortcut: '↵',
        run: () => servicesManager.controlService(s.name, 'Restart')
      });
      actions.push({
        id: 'stop',
        title: `Stop Service (${s.displayName || s.name})`,
        shortcut: 'Ctrl+S',
        run: () => servicesManager.controlService(s.name, 'Stop')
      });
    } else {
      actions.push({
        id: 'start',
        title: `Start Service (${s.displayName || s.name})`,
        shortcut: '↵',
        run: () => servicesManager.controlService(s.name, 'Start')
      });
    }
    actions.push({
      id: 'copy-name',
      title: `Copy Service Name (${s.name})`,
      shortcut: 'Ctrl+C',
      run: () => {
        if (clipboard && typeof clipboard.writeText === 'function') {
          clipboard.writeText(s.name);
        }
        return Promise.resolve(s.name);
      }
    });

    return {
      id: `service:${s.name}`,
      provider: 'services',
      group: 'Windows Services',
      title: `${s.displayName} (${s.name})`,
      subtitle: `${statusBadge} · Startup: ${s.startType} · ${s.name}`,
      keywords: ['service', 'services', s.name, s.displayName, s.status, s.startType],
      scoreBoost: isPrefixed ? 260 : 150,
      icon: { kind: 'glyph', name: 'process' },
      serviceName: s.name,
      displayName: s.displayName,
      status: s.status,
      startType: s.startType,
      serviceData: {
        name: s.name,
        displayName: s.displayName,
        status: s.status,
        startType: s.startType
      },
      actions
    };
  }

  return {
    id: 'services',
    name: 'Windows Services',
    group: 'Windows Services',
    warm: () => servicesManager.getServices(),
    all: () => servicesManager.getCachedServices().map((s) => toItem(s, false)),
    async search(query) {
      const q = String(query || '').trim();
      if (!q) return [];

      const isPrefixed = /^(?:services?:?|svc:?)\b/i.test(q);
      const cleanQ = q.replace(/^(?:services?:?|svc:?)\s*/i, '').trim().toLowerCase();

      const services = isPrefixed ? await servicesManager.getServices() : (servicesManager.getCachedServices() || []);

      if (isPrefixed) {
        if (!cleanQ) return services.slice(0, 30).map((s) => toItem(s, true));
        return servicesManager.filterServices(services, cleanQ).map((s) => toItem(s, true));
      }

      if (q.length < 3) return [];
      return servicesManager.filterServices(services, cleanQ).map((s) => toItem(s, false));
    }
  };
}

// ============================================================ Environment Variables Manager (M2)


function environmentVariablesProvider() {
  function toItem(e, isPrefixed, isExact = false) {
    const previewVal = e.value.length > 70 ? e.value.slice(0, 67) + '...' : e.value;
    return {
      id: `env:${e.scope}:${e.name}`,
      provider: 'env',
      group: 'Environment Variables',
      title: `${e.name} (${e.scope})`,
      subtitle: `${previewVal || '[empty]'}`,
      keywords: ['env', 'environment', 'variable', 'path', e.name, e.scope],
      scoreBoost: (isPrefixed ? 260 : 150) + (isExact ? 80 : 0),
      icon: { kind: 'glyph', name: 'app' },
      varName: e.name,
      scope: e.scope,
      value: e.value,
      envData: {
        name: e.name,
        value: e.value,
        scope: e.scope,
        paths: envManager.parsePathEntries(e.value)
      },
      actions: [
        {
          id: 'copy-val',
          title: `Copy Value`,
          shortcut: '↵',
          run: () => {
            envManager.copyToClipboard(e.value);
            return Promise.resolve({ ok: true, value: e.value });
          }
        },
        {
          id: 'open-dialog',
          title: 'Open Environment Variables GUI',
          shortcut: 'Ctrl+E',
          run: () => Promise.resolve({ ok: envManager.openEnvironmentDialog() })
        },
        {
          id: 'copy-name',
          title: `Copy Variable Name (${e.name})`,
          shortcut: 'Ctrl+Shift+C',
          run: () => {
            envManager.copyToClipboard(e.name);
            return Promise.resolve({ ok: true, name: e.name });
          }
        }
      ]
    };
  }

  return {
    id: 'env',
    name: 'Environment Variables',
    group: 'Environment Variables',
    warm: () => envManager.getEnvVariables(),
    all: () => envManager.getCachedVariables().map((e) => toItem(e, false)),
    async search(query) {
      const q = String(query || '').trim();
      if (!q) return [];

      const isPrefixed = /^(?:env:?|variables?:?)\b/i.test(q);
      const cleanQ = q.replace(/^(?:env:?|variables?:?)\s*/i, '').trim().toLowerCase();

      const vars = isPrefixed ? await envManager.getEnvVariables() : (envManager.getCachedVariables() || []);

      if (isPrefixed) {
        if (!cleanQ) return vars.slice(0, 30).map((e) => toItem(e, true));
        return envManager.filterEnv(vars, cleanQ).map((e) => toItem(e, true, e.name.toLowerCase() === cleanQ));
      }

      if (q.length < 3 && q.toLowerCase() !== 'path') return [];
      return envManager.filterEnv(vars, cleanQ).map((e) => toItem(e, false, e.name.toLowerCase() === cleanQ));
    }
  };
}

// ============================================================ Winget Package Updater (M2)


function wingetUpdatesProvider() {
  function toItem(p, isPrefixed) {
    const diffLabel = wingetManager.formatDiff(p);
    return {
      id: `winget:${p.id}`,
      provider: 'winget',
      group: 'Software Updates',
      title: `${p.name} (${diffLabel})`,
      subtitle: `ID: ${p.id} · ${p.currentVersion} -> ${p.availableVersion} · Source: ${p.source}`,
      keywords: ['winget', 'update', 'upgrade', 'software', p.name, p.id],
      scoreBoost: isPrefixed ? 260 : 150,
      icon: { kind: 'glyph', name: 'app' },
      packageName: p.name,
      currentVersion: p.currentVersion,
      availableVersion: p.availableVersion,
      source: p.source,
      wingetData: {
        id: p.id,
        name: p.name,
        currentVersion: p.currentVersion,
        availableVersion: p.availableVersion
      },
      actions: [
        {
          id: 'upgrade-pkg',
          title: `Update ${p.name} (${p.availableVersion})`,
          shortcut: '↵',
          run: () => wingetManager.executeUpgrade(p.id)
        },
        {
          id: 'upgrade-all',
          title: `Upgrade All Packages (winget upgrade --all)`,
          shortcut: 'Ctrl+Shift+U',
          run: () => wingetManager.executeUpgrade('--all')
        },
        {
          id: 'copy-cmd',
          title: `Copy Upgrade Command`,
          shortcut: 'Ctrl+C',
          run: () => {
            const cmd = wingetManager.buildUpgradeCmd(p.id);
            if (clipboard && typeof clipboard.writeText === 'function') {
              clipboard.writeText(cmd);
            }
            return Promise.resolve({ ok: true, command: cmd });
          }
        }
      ]
    };
  }

  return {
    id: 'winget',
    name: 'Software Updates',
    group: 'Software Updates',
    warm: () => wingetManager.scanUpgrades(),
    all: () => wingetManager.getCachedUpgrades().map((p) => toItem(p, false)),
    async search(query) {
      const q = String(query || '').trim();
      if (!q) return [];

      const isPrefixed = /^(?:winget|update|upgrade|packages?):?\s*/i.test(q);
      const cleanQ = q.replace(/^(?:winget|update|upgrade|packages?):?\s*/i, '').trim().toLowerCase();

      const upgrades = isPrefixed ? await wingetManager.scanUpgrades() : (wingetManager.getCachedUpgrades() || []);

      if (isPrefixed) {
        if (!cleanQ) return upgrades.map((p) => toItem(p, true));
        return upgrades
          .filter((p) => p.name.toLowerCase().includes(cleanQ) || p.id.toLowerCase().includes(cleanQ))
          .map((p) => toItem(p, true));
      }

      if (q.length < 3) return [];
      return upgrades
        .filter((p) => p.name.toLowerCase().includes(cleanQ) || p.id.toLowerCase().includes(cleanQ))
        .map((p) => toItem(p, false));
    }
  };
}

// ============================================================ Hosts File Quick Editor (M2)


function hostsEditorProvider() {
  function toItem(r, isPrefixed) {
    const statusLabel = r.enabled ? '✓ Enabled' : '○ Disabled (#)';
    const commentSuffix = r.comment ? ` · ${r.comment}` : '';
    return {
      id: `host:${r.domain}:${r.lineIndex}`,
      provider: 'hosts',
      group: 'Hosts File',
      title: `${r.domain} -> ${r.ip} (${r.enabled ? 'Enabled' : 'Disabled'})`,
      subtitle: `${statusLabel}${commentSuffix} · Line ${r.lineIndex + 1}`,
      keywords: ['hosts', 'host', 'dns', 'ip', r.domain, r.ip, r.comment].filter(Boolean),
      scoreBoost: isPrefixed ? 260 : 150,
      icon: { kind: 'glyph', name: 'globe' },
      domain: r.domain,
      ip: r.ip,
      enabled: r.enabled,
      isEnabled: r.enabled,
      comment: r.comment,
      hostsData: {
        ip: r.ip,
        domain: r.domain,
        enabled: r.enabled,
        comment: r.comment
      },
      actions: [
        {
          id: 'toggle',
          title: r.enabled ? `Disable Rule (${r.domain})` : `Enable Rule (${r.domain})`,
          shortcut: '↵',
          run: () => hostsEditor.toggleHostRule(r)
        },
        {
          id: 'flush-dns',
          title: 'Flush DNS Resolver Cache',
          shortcut: 'Ctrl+F',
          run: () => hostsEditor.flushDns()
        },
        {
          id: 'copy-ip',
          title: `Copy IP (${r.ip})`,
          shortcut: 'Ctrl+C',
          run: () => {
            if (clipboard && typeof clipboard.writeText === 'function') {
              clipboard.writeText(r.ip);
            }
            return Promise.resolve({ ok: true, ip: r.ip });
          }
        },
        {
          id: 'copy-domain',
          title: `Copy Domain (${r.domain})`,
          shortcut: 'Ctrl+Shift+C',
          run: () => {
            if (clipboard && typeof clipboard.writeText === 'function') {
              clipboard.writeText(r.domain);
            }
            return Promise.resolve({ ok: true, domain: r.domain });
          }
        }
      ]
    };
  }

  return {
    id: 'hosts',
    name: 'Hosts File',
    group: 'Hosts File',
    warm: () => hostsEditor.getRules(),
    all: () => hostsEditor.getRules().map((r) => toItem(r, false)),
    async search(query) {
      const q = String(query || '').trim();
      if (!q) return [];

      const isPrefixed = /^(?:hosts?:?|dns:?)\b/i.test(q);
      const cleanQ = q.replace(/^(?:hosts?:?|dns:?)\s*/i, '').trim().toLowerCase();

      const rules = hostsEditor.getRules();

      if (isPrefixed) {
        if (!cleanQ) return rules.map((r) => toItem(r, true));
        return rules
          .filter((r) => r.domain.toLowerCase().includes(cleanQ) || r.ip.toLowerCase().includes(cleanQ) || (r.comment && r.comment.toLowerCase().includes(cleanQ)))
          .map((r) => toItem(r, true));
      }

      if (q.length < 3) return [];
      return rules
        .filter((r) => r.domain.toLowerCase().includes(cleanQ) || r.ip.toLowerCase().includes(cleanQ) || (r.comment && r.comment.toLowerCase().includes(cleanQ)))
        .map((r) => toItem(r, false));
    }
  };
}


function windowsSettingsCatalogProvider() {
  return {
    id: 'windows-settings',
    name: 'Windows Settings',
    all: () => {
      return windowsSettings.WINDOWS_SETTINGS_CATALOG.map(windowsSettings.formatSettingItem);
    },
    search: (query) => {
      const raw = String(query || '').replace(/^\$+/, '').trim();
      if (!raw) return windowsSettingsCatalogProvider().all();
      const items = windowsSettings.searchSettings(raw);
      return items.map((it) => {
        const item = windowsSettings.formatSettingItem(it);
        item.scoreBoost = (item.scoreBoost || 0) + (query.startsWith('$') ? 300 : 80);
        return item;
      });
    }
  };
}


function registryExplorerProvider() {
  return {
    id: 'registry',
    name: 'Windows Registry Explorer',
    all: () => registryExplorer.searchRegistry(''),
    search: async (query) => {
      const q = String(query || '').trim();
      if (!q.startsWith(':') && !q.toLowerCase().startsWith('reg:')) return [];
      const clean = q.replace(/^(:|reg:\s*)/i, '').trim();
      if (!clean) return registryExplorer.searchRegistry('');

      const res = await registryExplorer.queryRegistryKey(clean);
      const items = [];

      // Open Key Action
      items.push({
        id: `reg:open:${res.key}`,
        provider: 'registry',
        group: 'Registry',
        title: `Open in Regedit: "${res.key}"`,
        subtitle: 'Auto-navigate directly to this key in Registry Editor',
        icon: '🗄️',
        scoreBoost: 260,
        actions: [
          { id: 'open', title: 'Open in Regedit', shortcut: '↵', run: () => registryExplorer.openInRegedit(res.key) },
          { id: 'copy', title: 'Copy Key Path', run: () => clipboard.writeText(res.key) }
        ]
      });

      // Subkeys
      for (const sub of (res.subkeys || []).slice(0, 8)) {
        const shortName = sub.split('\\').pop();
        items.push({
          id: `reg:sub:${sub}`,
          provider: 'registry',
          group: 'Registry',
          title: `📁 ${shortName}`,
          subtitle: sub,
          icon: '📁',
          scoreBoost: 230,
          actions: [
            { id: 'open', title: 'Open Subkey in Regedit', shortcut: '↵', run: () => registryExplorer.openInRegedit(sub) },
            { id: 'copy', title: 'Copy Path', run: () => { if (clipboard && clipboard.writeText) clipboard.writeText(sub); return { ok: true }; } }
          ]
        });
      }

      // Values
      for (const val of (res.values || []).slice(0, 8)) {
        items.push({
          id: `reg:val:${res.key}:${val.name}`,
          provider: 'registry',
          group: 'Registry',
          title: `${val.name} (${val.type})`,
          subtitle: `Data: ${val.data}`,
          icon: '🏷️',
          scoreBoost: 210,
          actions: [
            { id: 'copy-data', title: 'Copy Value Data', shortcut: '↵', run: () => { if (clipboard && clipboard.writeText) clipboard.writeText(val.data); return { ok: true }; } },
            { id: 'copy-name', title: 'Copy Value Name', run: () => { if (clipboard && clipboard.writeText) clipboard.writeText(val.name); return { ok: true }; } }
          ]
        });
      }

      return items;
    }
  };
}


function windowWalkerProvider() {
  return {
    id: 'window-walker',
    name: 'Window Walker',
    all: async () => {
      const windows = await windowWalker.getRunningWindows();
      return windows.slice(0, 10).map((w) => ({
        id: `ww:win:${w.hwnd}`,
        provider: 'window-walker',
        group: 'Window Walker',
        title: `${w.isHung ? '⚠️ [Not Responding] ' : ''}${w.title}`,
        subtitle: `PID: ${w.pid} • Bring application to foreground`,
        icon: w.isHung ? '⚠️' : '🪟',
        scoreBoost: w.isHung ? 240 : 180,
        actions: [
          { id: 'focus', title: 'Switch to Window', shortcut: '↵', run: () => windowWalker.focusWindow(w.hwnd) },
          { id: 'kill-tree', title: 'Terminate Process Tree', shortcut: 'Ctrl+Shift+Delete', run: () => windowWalker.killProcessTree(w.pid, w.title) }
        ]
      }));
    },
    search: async (query) => {
      const q = String(query || '').trim();
      const isExplicit = q.startsWith('<');
      const clean = q.replace(/^</, '').trim().toLowerCase();
      if (!isExplicit && !['walker', 'window', 'hung', 'switch'].some((k) => q.toLowerCase().includes(k))) return [];

      const windows = await windowWalker.searchWindowWalker(clean);
      return windows.map((w) => ({
        id: `ww:win:${w.hwnd}`,
        provider: 'window-walker',
        group: 'Window Walker',
        title: `${w.isHung ? '⚠️ [Not Responding] ' : ''}${w.title}`,
        subtitle: `PID: ${w.pid} • HWND: ${w.hwnd}`,
        icon: w.isHung ? '⚠️' : '🪟',
        scoreBoost: isExplicit ? 280 : 180,
        actions: [
          { id: 'focus', title: 'Switch to Window', shortcut: '↵', run: () => windowWalker.focusWindow(w.hwnd) },
          { id: 'kill-tree', title: 'Terminate Process Tree', shortcut: 'Ctrl+Shift+Delete', run: () => windowWalker.killProcessTree(w.pid, w.title) }
        ]
      }));
    }
  };
}


function dnsSwitcherProvider() {
  return {
    id: 'dns',
    name: 'DNS Switcher',
    all: async () => {
      const current = await dnsSwitcher.getCurrentDns();
      return dnsSwitcher.DNS_PRESETS.map((p) => dnsSwitcher.formatDnsPresetItem(p, current.servers));
    },
    search: async (query) => {
      const q = String(query || '').trim().toLowerCase();
      if (!q) return [];
      if (q.startsWith('dns') || ['cloudflare', 'google', 'quad9', 'dhcp', 'nameserver', '1.1.1.1', '8.8.8.8'].some((k) => q.includes(k))) {
        return dnsSwitcher.searchDns(query);
      }
      return [];
    }
  };
}


module.exports = {
  windowsRunProvider,
  windowsServicesProvider,
  environmentVariablesProvider,
  wingetUpdatesProvider,
  hostsEditorProvider,
  windowsSettingsCatalogProvider,
  registryExplorerProvider,
  windowWalkerProvider,
  dnsSwitcherProvider
};
