'use strict';

const { app, shell, clipboard } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { spawn, execFile } = require('node:child_process');
const store = require('../store');
const sysControls = require('../system-controls');
const processManager = require('../process-manager');
const screenAwareness = require('../screen-awareness');
const taskManager = require('../task-manager');
const wifiManager = require('../wifi-manager');
const powerManager = require('../power-manager');
const virtualDesktops = require('../virtual-desktops');
const diskCleanup = require('../disk-cleanup');
const alwaysOnTop = require('../always-on-top');
const screenRecorder = require('../screen-recorder');
const systemDiagnostics = require('../system-diagnostics');
const { fuzzy, scoreItem, HOME } = require('./utils');

function spawnDetached(cmd, args = []) {
  spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: false }).unref();
}

const SYSTEM_COMMANDS = [
  // Windows & Power
  ['lock', 'Lock Screen', 'System', () => spawnDetached('rundll32.exe', ['user32.dll,LockWorkStation'])],
  ['sleep', 'Sleep', 'System', () => spawnDetached('rundll32.exe', ['powrprof.dll,SetSuspendState', '0,1,0'])],
  ['restart', 'Restart Computer', 'System', () => spawnDetached('shutdown', ['/r', '/t', '0'])],
  ['shutdown', 'Shut Down Computer', 'System', () => spawnDetached('shutdown', ['/s', '/t', '0'])],
  ['signout', 'Sign Out', 'System', () => spawnDetached('shutdown', ['/l'])],
  ['empty-trash', 'Empty Recycle Bin', 'System', () => spawnDetached('powershell.exe', ['-NoProfile', '-Command', 'Clear-RecycleBin -Force -ErrorAction SilentlyContinue'])],
  ['toggle-theme', 'Toggle Dark / Light Theme', 'System', () => sysControls.toggleDarkTheme()],

  // Audio & Media
  ['vol-up', 'Volume Up (+10%)', 'Audio & Media', () => sysControls.volumeUp()],
  ['vol-down', 'Volume Down (-10%)', 'Audio & Media', () => sysControls.volumeDown()],
  ['vol-mute', 'Mute / Unmute', 'Audio & Media', () => sysControls.volumeMute()],
  ['media-play', 'Play / Pause Media', 'Audio & Media', () => sysControls.mediaPlayPause()],
  ['media-next', 'Next Track', 'Audio & Media', () => sysControls.mediaNext()],
  ['media-prev', 'Previous Track', 'Audio & Media', () => sysControls.mediaPrev()],
  ['sound-mixer', 'Volume Mixer', 'Audio & Media', () => spawnDetached('sndvol.exe')],

  // Utilities
  ['taskmgr', 'Task Manager', 'Utilities', () => spawnDetached('taskmgr.exe')],
  ['devmgmt', 'Device Manager', 'Utilities', () => spawnDetached('mmc.exe', ['devmgmt.msc'])],
  ['diskmgmt', 'Disk Management', 'Utilities', () => spawnDetached('mmc.exe', ['diskmgmt.msc'])],
  ['services', 'Services', 'Utilities', () => spawnDetached('mmc.exe', ['services.msc'])],
  ['regedit', 'Registry Editor', 'Utilities', () => spawnDetached('regedit.exe')],
  ['control', 'Control Panel', 'Utilities', () => spawnDetached('control.exe')],
  ['terminal', 'Windows Terminal', 'Utilities', () => spawnDetached('wt.exe')],
  ['cmd', 'Command Prompt', 'Utilities', () => spawnDetached('cmd.exe')],
  ['powershell', 'PowerShell', 'Utilities', () => spawnDetached('powershell.exe')],
  ['resmon', 'Resource Monitor', 'Utilities', () => spawnDetached('resmon.exe')],
  ['msinfo', 'System Information', 'Utilities', () => spawnDetached('msinfo32.exe')],
  ['screenclip', 'Take Screenshot', 'Utilities', () => shell.openExternal('ms-screenclip:')],

  // Settings
  ['display', 'Display Settings', 'Settings', () => shell.openExternal('ms-settings:display')],
  ['sound', 'Sound Settings', 'Settings', () => shell.openExternal('ms-settings:sound')],
  ['bluetooth', 'Bluetooth Settings', 'Settings', () => shell.openExternal('ms-settings:bluetooth')],
  ['wifi', 'Wi-Fi Settings', 'Settings', () => shell.openExternal('ms-settings:network-wifi')],
  ['nightlight', 'Night Light Settings', 'Settings', () => shell.openExternal('ms-settings:nightlight')],
  ['focus-assist', 'Focus Assist Settings', 'Settings', () => shell.openExternal('ms-settings:quiethours')],
  ['update', 'Windows Update', 'Settings', () => shell.openExternal('ms-settings:windowsupdate')],
  ['apps-features', 'Installed Apps', 'Settings', () => shell.openExternal('ms-settings:appsfeatures')],
  ['notifications', 'Notifications Settings', 'Settings', () => shell.openExternal('ms-settings:notifications')],
  ['storage', 'Storage Settings', 'Settings', () => shell.openExternal('ms-settings:storagesense')],
  ['privacy', 'Privacy Settings', 'Settings', () => shell.openExternal('ms-settings:privacy')],
  ['datetime', 'Date & Time Settings', 'Settings', () => shell.openExternal('ms-settings:dateandtime')],
  ['project', 'Project Display', 'System', () => shell.openExternal('ms-settings:project')],

  // Extended Hardware & System Controls
  ['vol-0', 'Set Volume to 0%', 'Audio & Media', () => sysControls.setVolumeLevel(0)],
  ['vol-25', 'Set Volume to 25%', 'Audio & Media', () => sysControls.setVolumeLevel(25)],
  ['vol-50', 'Set Volume to 50%', 'Audio & Media', () => sysControls.setVolumeLevel(50)],
  ['vol-75', 'Set Volume to 75%', 'Audio & Media', () => sysControls.setVolumeLevel(75)],
  ['vol-100', 'Set Volume to 100%', 'Audio & Media', () => sysControls.setVolumeLevel(100)],
  ['hidden-files', 'Toggle Hidden Files', 'System', () => sysControls.toggleHiddenFiles()],
  ['sleep-displays', 'Sleep Displays', 'System', () => sysControls.sleepDisplays()],
  ['show-desktop', 'Show Desktop', 'System', () => sysControls.showDesktop()],
  ['hibernate', 'Hibernate Computer', 'System', () => sysControls.hibernate()],
  ['toggle-wifi', 'Toggle Wi-Fi', 'System', () => sysControls.toggleWifi()],
  ['quit-all-apps', 'Quit All Applications', 'System', () => sysControls.quitAllApplications()],
  ['ocr-screen', 'Screen OCR / Extract Text', 'Utilities', async () => {
    const res = await screenAwareness.runOcr();
    return { hide: true, output: res.text };
  }],
  ['paste-latest-shot', 'Paste Latest Screenshot', 'Utilities', () => {
    return screenAwareness.pasteLatestScreenshot();
  }]
];

function processProvider() {
  return {
    id: 'processes',
    name: 'Process Manager',
    group: 'Process Manager',
    warm: () => processManager.fetchProcesses(),
    all: () => [],
    search(query) {
      const q = String(query || '').trim().toLowerCase();
      const isProcessSearch = q.startsWith('kill') || q.startsWith('proc ') || q.startsWith('ps ') || q.startsWith('process ');
      const filter = isProcessSearch ? q.replace(/^(kill|proc|ps|process)\s*/i, '').trim() : q;
      if (!isProcessSearch && q.length < 3) return [];

      const list = processManager.getProcessesSync();
      const matches = isProcessSearch
        ? (filter ? list.filter((p) => p.name.toLowerCase().includes(filter) || p.title.toLowerCase().includes(filter)) : list.slice(0, 15))
        : list.filter((p) => p.name.toLowerCase().startsWith(q) || p.title.toLowerCase().includes(q)).slice(0, 6);

      return matches.map((p) => ({
        id: `proc:${p.pid}`,
        provider: 'processes',
        group: 'Process Manager',
        title: p.title || p.name,
        subtitle: `PID: ${p.pid} · Memory: ${p.memoryFormatted}`,
        pid: p.pid,
        memory: p.memoryFormatted,
        keywords: ['kill', 'process', p.name.toLowerCase(), String(p.pid)],
        icon: { kind: 'glyph', name: 'terminal' },
        scoreBoost: isProcessSearch ? 180 : 20,
        actions: [
          {
            id: 'kill',
            title: `Kill Process (${p.name})`,
            shortcut: '↵',
            run: async () => {
              await processManager.killProcess(p.pid);
              return { hide: true };
            }
          },
          {
            id: 'copy-name',
            title: 'Copy Process Name',
            shortcut: 'Ctrl+C',
            run: () => clipboard.writeText(p.name)
          },
          {
            id: 'copy-pid',
            title: 'Copy PID',
            shortcut: 'Ctrl+Shift+C',
            run: () => clipboard.writeText(String(p.pid))
          }
        ]
      }));
    }
  };
}

// ============================================================ provider: devtools


function systemProvider() {
  const items = SYSTEM_COMMANDS.map(([key, title, subgroup, run]) => ({
    id: `sys:${key}`,
    provider: 'system',
    group: 'Commands',
    subgroup,
    title,
    subtitle: subgroup,
    keywords: [key, subgroup.toLowerCase()],
    icon: { kind: 'glyph', name: key },
    actions: [{ id: 'run', title, shortcut: '↵', run }]
  }));

  items.push({
    id: 'sys:data-folder',
    provider: 'system',
    group: 'Commands',
    subgroup: 'Rayclone',
    title: 'Open Data Folder',
    subtitle: 'Rayclone',
    icon: { kind: 'glyph', name: 'folder' },
    actions: [{ id: 'run', title: 'Open Data Folder', shortcut: '↵', run: () => shell.openPath(app.getPath('userData')) }]
  });

  items.push({
    id: 'sys:scripts-folder',
    provider: 'system',
    group: 'Commands',
    subgroup: 'Rayclone',
    title: 'Open Scripts Folder',
    subtitle: 'Rayclone Custom Scripts',
    icon: { kind: 'glyph', name: 'code' },
    actions: [{ id: 'run', title: 'Open Scripts Folder', shortcut: '↵', run: () => shell.openPath(settings.getSettings().scriptsDir) }]
  });

  items.push({
    id: 'sys:settings',
    provider: 'system',
    group: 'Commands',
    subgroup: 'Rayclone',
    title: 'Open Settings',
    subtitle: 'Preferences & Hotkeys',
    icon: { kind: 'glyph', name: 'theme' },
    actions: [{ id: 'run', title: 'Open Settings', shortcut: '↵', run: () => ({ openSettings: true }) }]
  });

  items.push({
    id: 'sys:confetti',
    provider: 'system',
    group: 'Commands',
    subgroup: 'Rayclone',
    title: 'Confetti',
    subtitle: 'Raycast Celebration Particles',
    keywords: ['confetti', 'celebrate', 'party', 'fun'],
    icon: { kind: 'glyph', name: 'sparkle' },
    actions: [{ id: 'run', title: 'Celebrate with Confetti', shortcut: '↵', run: () => ({ confetti: true, hide: false }) }]
  });

  items.push({
    id: 'sys:toggle-taskbar',
    provider: 'system',
    group: 'Commands',
    subgroup: 'Window Management',
    title: 'Toggle Taskbar',
    subtitle: 'Windows Taskbar Visibility',
    keywords: ['taskbar', 'toggle taskbar', 'hide taskbar', 'show taskbar'],
    icon: { kind: 'glyph', name: 'monitor' },
    actions: [{ id: 'run', title: 'Toggle Taskbar', shortcut: '↵', run: () => sysControls.toggleTaskbar() }]
  });

  items.push({
    id: 'sys:uninstall-apps',
    provider: 'system',
    group: 'Commands',
    subgroup: 'System Settings',
    title: 'Uninstall Applications',
    subtitle: 'Windows Installed Apps & Features',
    keywords: ['uninstall', 'remove program', 'installed apps', 'add or remove'],
    icon: { kind: 'glyph', name: 'trash' },
    actions: [{ id: 'run', title: 'Open Installed Apps', shortcut: '↵', run: () => sysControls.uninstallApplications() }]
  });

  items.push({
    id: 'sys:export-data',
    provider: 'system',
    group: 'Commands',
    subgroup: 'Rayclone',
    title: 'Export Settings & Data',
    subtitle: 'Backup notes, snippets, settings and history',
    keywords: ['backup', 'export', 'export data', 'export settings'],
    icon: { kind: 'glyph', name: 'download' },
    actions: [{ id: 'run', title: 'Export Data', shortcut: '↵', run: () => sysControls.exportData() }]
  });

  items.push({
    id: 'sys:import-data',
    provider: 'system',
    group: 'Commands',
    subgroup: 'Rayclone',
    title: 'Import Settings & Data',
    subtitle: 'Restore notes, snippets and settings from backup JSON',
    keywords: ['restore', 'import', 'import data', 'import settings'],
    icon: { kind: 'glyph', name: 'download' },
    actions: [{ id: 'run', title: 'Import Data', shortcut: '↵', run: () => {
      const backupPath = path.join(os.homedir(), 'Downloads', 'rayclone-backup.json');
      return sysControls.importData(backupPath);
    } }]
  });

  return {
    id: 'system',
    name: 'Commands',
    group: 'Commands',
    all: () => items,
    search: () => items
  };
}

// ============================================================ provider: dictation


function taskManagerProvider() {
  return {
    id: 'task-manager',
    name: 'Task & Process Manager',
    all: () => [
      {
        id: 'task:view-top',
        provider: 'task-manager',
        group: 'Task Manager',
        title: 'Task Manager: View Top Processes',
        subtitle: 'Inspect memory and CPU consuming background tasks',
        icon: '📊',
        keywords: ['task', 'manager', 'process', 'cpu', 'ram'],
        actions: [
          {
            id: 'view',
            title: 'Inspect Processes',
            shortcut: '↵',
            run: async () => {
              const procs = await taskManager.getTopProcesses(10);
              return { ok: true, processes: procs };
            }
          }
        ]
      }
    ],
    search: async (query) => {
      const q = String(query || '').trim().toLowerCase();
      if (!q) return [];
      if (['task', 'process', 'cpu', 'ram', 'kill', 'ps'].some((k) => q.includes(k))) {
        const top = await taskManager.getTopProcesses(8);
        return top.map((p) => ({
          id: `task:proc:${p.pid}`,
          provider: 'task-manager',
          group: 'Task Manager',
          title: `${p.name} (PID: ${p.pid})`,
          subtitle: `RAM: ${p.memoryFormatted} • CPU: ${p.cpuSeconds}s • ${p.title}`,
          icon: '⚡',
          scoreBoost: 140,
          keywords: ['task', 'kill', p.name, String(p.pid)],
          actions: [
            {
              id: 'kill',
              title: `Kill Process (${p.name})`,
              shortcut: '↵',
              run: async () => taskManager.killProcessByPid(p.pid)
            }
          ]
        }));
      }
      return [];
    }
  };
}


function wifiProvider() {
  return {
    id: 'wifi',
    name: 'Wi-Fi & Network Switcher',
    all: () => [
      {
        id: 'wifi:status',
        provider: 'wifi',
        group: 'Wi-Fi',
        title: 'Wi-Fi: View Saved Networks & Passwords',
        subtitle: 'Inspect saved wireless profiles and credentials',
        icon: '📶',
        keywords: ['wifi', 'network', 'password', 'wlan', 'internet'],
        actions: [
          {
            id: 'view-profiles',
            title: 'List Wi-Fi Profiles',
            shortcut: '↵',
            run: async () => wifiManager.getSavedProfiles()
          }
        ]
      }
    ],
    search: async (query) => {
      const q = String(query || '').trim().toLowerCase();
      if (!q) return [];
      if (['wifi', 'wlan', 'network', 'ssid', 'password'].some((k) => q.includes(k))) {
        const profiles = await wifiManager.getSavedProfiles();
        return profiles.slice(0, 6).map((prof) => ({
          id: `wifi:prof:${prof}`,
          provider: 'wifi',
          group: 'Wi-Fi',
          title: `Wi-Fi Network: "${prof}"`,
          subtitle: 'Press Enter to reveal & copy saved password',
          icon: '📶',
          scoreBoost: 150,
          keywords: ['wifi', prof],
          actions: [
            {
              id: 'copy-password',
              title: 'Copy Wi-Fi Password',
              shortcut: '↵',
              run: async () => {
                const pass = await wifiManager.getProfilePassword(prof);
                if (pass) clipboard.writeText(pass);
                return { ok: true, password: pass };
              }
            },
            {
              id: 'connect',
              title: `Connect to "${prof}"`,
              run: async () => wifiManager.connectToNetwork(prof)
            }
          ]
        }));
      }
      return [];
    }
  };
}


function powerProvider() {
  return {
    id: 'power',
    name: 'Power & Battery Manager',
    all: () => [
      {
        id: 'power:battery-status',
        provider: 'power',
        group: 'Power & Battery',
        title: 'Battery & Power Health',
        subtitle: 'Inspect charge, power status, and active scheme',
        icon: '🔋',
        keywords: ['battery', 'power', 'charge', 'health'],
        actions: [
          {
            id: 'check-battery',
            title: 'Check Status',
            shortcut: '↵',
            run: async () => powerManager.getBatteryStatus()
          }
        ]
      }
    ],
    search: async (query) => {
      const q = String(query || '').trim().toLowerCase();
      if (!q) return [];
      if (['power', 'battery', 'charge', 'plan', 'scheme'].some((k) => q.includes(k))) {
        const plans = await powerManager.getPowerPlans();
        const items = plans.map((p) => ({
          id: `power:plan:${p.guid}`,
          provider: 'power',
          group: 'Power & Battery',
          title: `Power Plan: ${p.name}${p.active ? ' (Active)' : ''}`,
          subtitle: `GUID: ${p.guid} • Switch Windows power mode`,
          icon: p.active ? '⚡' : '🔋',
          scoreBoost: 140,
          keywords: ['power', 'plan', p.name],
          actions: [
            {
              id: 'activate',
              title: `Activate "${p.name}" Plan`,
              shortcut: '↵',
              run: async () => powerManager.setActivePowerPlan(p.guid)
            }
          ]
        }));
        return items;
      }
      return [];
    }
  };
}


function virtualDesktopsProvider() {
  return {
    id: 'virtual-desktops',
    name: 'Virtual Desktops',
    all: () => [
      {
        id: 'vd:next',
        provider: 'virtual-desktops',
        group: 'Virtual Desktops',
        title: 'Next Virtual Desktop',
        subtitle: 'Switch to the desktop on the right (Win+Ctrl+Right)',
        icon: '🖥️',
        keywords: ['desktop', 'virtual', 'switch', 'next'],
        actions: [{ id: 'switch', title: 'Next Desktop', shortcut: '↵', run: () => virtualDesktops.nextDesktop() }]
      },
      {
        id: 'vd:prev',
        provider: 'virtual-desktops',
        group: 'Virtual Desktops',
        title: 'Previous Virtual Desktop',
        subtitle: 'Switch to the desktop on the left (Win+Ctrl+Left)',
        icon: '🖥️',
        keywords: ['desktop', 'virtual', 'switch', 'previous'],
        actions: [{ id: 'switch', title: 'Previous Desktop', shortcut: '↵', run: () => virtualDesktops.prevDesktop() }]
      },
      {
        id: 'vd:new',
        provider: 'virtual-desktops',
        group: 'Virtual Desktops',
        title: 'New Virtual Desktop',
        subtitle: 'Create a new blank virtual desktop (Win+Ctrl+D)',
        icon: '➕',
        keywords: ['desktop', 'new', 'create'],
        actions: [{ id: 'create', title: 'Create Desktop', shortcut: '↵', run: () => virtualDesktops.createDesktop() }]
      }
    ],
    search: (query) => {
      const q = String(query || '').trim().toLowerCase();
      if (!q) return [];
      if (['desktop', 'virtual'].some((k) => q.includes(k))) {
        return virtualDesktopsProvider().all();
      }
      return [];
    }
  };
}


function diskCleanupProvider() {
  return {
    id: 'disk-cleanup',
    name: 'Disk Cleanup',
    all: () => [
      {
        id: 'disk:clean-temp',
        provider: 'disk-cleanup',
        group: 'Disk Cleanup',
        title: 'Clean Temporary Files',
        subtitle: 'Clear cached logs and temporary files from %TEMP%',
        icon: '🧹',
        keywords: ['clean', 'temp', 'disk', 'cache', 'storage'],
        actions: [
          {
            id: 'clean',
            title: 'Clean Temp Files',
            shortcut: '↵',
            run: () => diskCleanup.cleanTempFiles()
          }
        ]
      },
      {
        id: 'disk:empty-recycle-bin',
        provider: 'disk-cleanup',
        group: 'Disk Cleanup',
        title: 'Empty Recycle Bin',
        subtitle: 'Permanently purge all deleted files from Recycle Bin',
        icon: '🗑️',
        keywords: ['recycle', 'bin', 'empty', 'trash', 'clean'],
        actions: [
          {
            id: 'empty',
            title: 'Empty Recycle Bin',
            shortcut: '↵',
            run: () => diskCleanup.emptyRecycleBin()
          }
        ]
      }
    ],
    search: (query) => {
      const q = String(query || '').trim().toLowerCase();
      if (!q) return [];
      if (['disk', 'clean', 'temp', 'recycle', 'trash', 'purge'].some((k) => q.includes(k))) {
        return diskCleanupProvider().all();
      }
      return [];
    }
  };
}


function alwaysOnTopProvider() {
  return {
    id: 'always-on-top',
    name: 'Always-On-Top Toggle',
    all: () => [
      {
        id: 'window:always-on-top',
        provider: 'always-on-top',
        group: 'Window Management',
        title: 'Toggle Always-On-Top for Active Window',
        subtitle: 'Pin the currently focused window on top of all other windows',
        icon: '📌',
        keywords: ['pin', 'top', 'topmost', 'always on top'],
        actions: [
          {
            id: 'toggle-pin',
            title: 'Toggle Pin',
            shortcut: '↵',
            run: async () => alwaysOnTop.toggleForegroundAlwaysOnTop()
          }
        ]
      }
    ],
    search: (query) => {
      const q = String(query || '').trim().toLowerCase();
      if (!q) return [];
      if (['top', 'pin', 'topmost', 'always'].some((k) => q.includes(k))) {
        return alwaysOnTopProvider().all();
      }
      return [];
    }
  };
}


function screenRecorderProvider() {
  return {
    id: 'screen-recorder',
    name: 'Screenshot & Screen Recording',
    all: () => [
      {
        id: 'screen:snip',
        provider: 'screen-recorder',
        group: 'Commands',
        title: 'Snip Screen Area',
        subtitle: 'Open Windows Snipping Tool overlay (Win+Shift+S)',
        icon: '✂️',
        keywords: ['snip', 'screenshot', 'capture', 'screen'],
        actions: [
          {
            id: 'snip',
            title: 'Snip Screen Area',
            shortcut: '↵',
            run: () => screenRecorder.triggerScreenSnip()
          }
        ]
      }
    ],
    search: (query) => {
      const q = String(query || '').trim().toLowerCase();
      if (!q) return [];
      if (['snip', 'screenshot', 'capture', 'record'].some((k) => q.includes(k))) {
        return screenRecorderProvider().all();
      }
      return [];
    }
  };
}


function systemDiagnosticsProvider() {
  return {
    id: 'diagnostics',
    name: 'System Diagnostics & UEFI',
    all: () => [
      {
        id: 'diag:uefi',
        provider: 'diagnostics',
        group: 'System Diagnostics',
        title: 'Reboot to UEFI / BIOS Firmware',
        subtitle: 'Restarts computer directly into motherboard BIOS setup (Requires confirmation)',
        icon: '⚠️',
        keywords: ['uefi', 'bios', 'reboot', 'firmware', 'restart'],
        actions: [
          { id: 'reboot', title: 'Confirm: Reboot to UEFI Firmware', shortcut: 'Ctrl+Shift+↵', danger: true, run: () => systemDiagnostics.rebootToUefi() }
        ]
      },
      {
        id: 'diag:network',
        provider: 'diagnostics',
        group: 'System Diagnostics',
        title: 'Network Adapter Diagnostics',
        subtitle: 'Inspect link speeds, gateway, DNS servers, and IP addresses',
        icon: '🌐',
        keywords: ['nic', 'ethernet', 'wifi', 'gateway', 'dns', 'speed'],
        actions: [
          { id: 'inspect', title: 'Inspect Network Adapters', shortcut: '↵', run: () => systemDiagnostics.getNetworkDiagnostics() }
        ]
      }
    ],
    search: (query) => {
      const q = String(query || '').trim().toLowerCase();
      if (!q) return [];
      if (['uefi', 'bios', 'firmware', 'nic', 'adapter', 'diagnostics', 'gateway', 'dns'].some((k) => q.includes(k))) {
        return systemDiagnosticsProvider().all();
      }
      return [];
    }
  };
}


function chronometricsProvider() {
  return {
    id: 'chronometrics',
    name: 'Time & Chronometrics',
    all: () => {
      const c = systemDiagnostics.getChronometrics();
      return [
        {
          id: 'chrono:iso',
          provider: 'chronometrics',
          group: 'Time & Chronometrics',
          title: `ISO 8601: ${c.iso}`,
          subtitle: `Week ${c.weekOfYear} of year • Day ${c.dayOfYear}`,
          icon: '🕒',
          keywords: ['time', 'date', 'iso', 'now'],
          actions: [{ id: 'copy', title: 'Copy ISO 8601', shortcut: '↵', run: () => { if (clipboard && clipboard.writeText) clipboard.writeText(c.iso); return { ok: true }; } }]
        },
        {
          id: 'chrono:filetime',
          provider: 'chronometrics',
          group: 'Time & Chronometrics',
          title: `Windows FileTime: ${c.fileTime}`,
          subtitle: '64-bit timestamp (100-nanoseconds since 1601 UTC)',
          icon: '🕒',
          keywords: ['filetime', 'windows', 'timestamp', 'ft'],
          actions: [{ id: 'copy', title: 'Copy FileTime', shortcut: '↵', run: () => { if (clipboard && clipboard.writeText) clipboard.writeText(c.fileTime); return { ok: true }; } }]
        },
        {
          id: 'chrono:stats',
          provider: 'chronometrics',
          group: 'Time & Chronometrics',
          title: `Week ${c.weekOfYear} • Day ${c.dayOfYear} of ${c.isLeapYear ? '366' : '365'}`,
          subtitle: `${c.daysRemainingInMonth} days remaining in current month • Excel: ${c.excel1900}`,
          icon: '📅',
          keywords: ['calendar', 'week', 'day', 'month'],
          actions: [{ id: 'copy', title: 'Copy Date', shortcut: '↵', run: () => { if (clipboard && clipboard.writeText) clipboard.writeText(c.local); return { ok: true }; } }]
        }
      ];
    },
    search: (query) => {
      const q = String(query || '').trim().toLowerCase();
      if (!q) return [];
      if (q.startsWith(')') || ['time', 'date', 'filetime', 'iso', 'week', 'now', 'chrono'].some((k) => q.includes(k))) {
        const items = chronometricsProvider().all();
        if (q.startsWith(')')) {
          for (const it of items) it.scoreBoost = 260;
        }
        return items;
      }
      return [];
    }
  };
}


module.exports = {
  processProvider,
  systemProvider,
  taskManagerProvider,
  wifiProvider,
  powerProvider,
  virtualDesktopsProvider,
  diskCleanupProvider,
  alwaysOnTopProvider,
  screenRecorderProvider,
  systemDiagnosticsProvider,
  chronometricsProvider
};
