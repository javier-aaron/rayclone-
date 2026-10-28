'use strict';

const { spawn } = require('node:child_process');
const store = require('./store');

const COMMON_RUN_TARGETS = [
  { name: 'dxdiag', title: 'DirectX Diagnostics', description: 'Detailed system & GPU diagnostic report' },
  { name: 'regedit', title: 'Registry Editor', description: 'Windows configuration registry tool' },
  { name: 'services.msc', title: 'Windows Services', description: 'Manage background Windows services' },
  { name: 'gpedit.msc', title: 'Group Policy Editor', description: 'Manage local machine policies' },
  { name: 'diskmgmt.msc', title: 'Disk Management', description: 'Partition and disk volumes manager' },
  { name: 'devmgmt.msc', title: 'Device Manager', description: 'Hardware devices and drivers' },
  { name: 'compmgmt.msc', title: 'Computer Management', description: 'All-in-one system management console' },
  { name: 'eventvwr.msc', title: 'Event Viewer', description: 'View system, application, and security event logs' },
  { name: 'appwiz.cpl', title: 'Programs and Features', description: 'Add/Remove installed Windows programs' },
  { name: 'ncpa.cpl', title: 'Network Connections', description: 'Manage Ethernet, Wi-Fi, and adapter settings' },
  { name: 'sysdm.cpl', title: 'System Properties', description: 'Environment variables, computer name, domain' },
  { name: 'cleanmgr', title: 'Disk Cleanup', description: 'Free up disk space and remove temp files' },
  { name: 'msconfig', title: 'System Configuration', description: 'Boot options, services, and startup config' },
  { name: 'resmon', title: 'Resource Monitor', description: 'Real-time CPU, RAM, Disk, and Network graphs' },
  { name: 'taskmgr', title: 'Task Manager', description: 'Process and system performance monitor' },
  { name: 'wt', title: 'Windows Terminal', description: 'Modern tabbed Windows Terminal' },
  { name: 'cmd', title: 'Command Prompt', description: 'Windows Command Line Interpreter' },
  { name: 'powershell', title: 'Windows PowerShell', description: 'PowerShell 5.1 automation console' },
  { name: 'pwsh', title: 'PowerShell 7', description: 'PowerShell 7 cross-platform console' }
];

function expandEnv(str) {
  if (!str) return '';
  return str.replace(/%([^%]+)%/g, (_, n) => process.env[n] || `%${n}%`);
}

function execute(cmdString, asAdmin = false) {
  const expanded = expandEnv(cmdString.trim());
  if (!expanded) return { ok: false, error: 'Empty command' };

  if (asAdmin) {
    const ps = `Start-Process -FilePath "cmd.exe" -ArgumentList '/c "${expanded.replace(/"/g, '`"')}"' -Verb RunAs`;
    spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    }).unref();
    return { ok: true, admin: true, command: expanded };
  }

  // Normal execution via cmd.exe /c start ""
  spawn('cmd.exe', ['/c', 'start', '""', expanded], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  }).unref();

  return { ok: true, admin: false, command: expanded };
}

function getSavedAliases() {
  return store.read('run_aliases', {}) || {};
}

function saveAlias(alias, targetCommand) {
  const aliases = getSavedAliases();
  aliases[alias.trim().toLowerCase()] = targetCommand.trim();
  store.write('run_aliases', aliases);
  return aliases;
}

function deleteAlias(alias) {
  const aliases = getSavedAliases();
  delete aliases[alias.trim().toLowerCase()];
  store.write('run_aliases', aliases);
  return aliases;
}

function searchRun(query) {
  const q = String(query || '').trim();
  const isPrefixed = q.startsWith('>') || /^run\s+/i.test(q);
  const cleanQuery = q.replace(/^>\s*/, '').replace(/^run\s+/i, '').trim();

  const results = [];
  const aliases = getSavedAliases();

  if (cleanQuery) {
    // Check if matching custom aliases
    for (const [a, target] of Object.entries(aliases)) {
      if (a.includes(cleanQuery.toLowerCase()) || target.toLowerCase().includes(cleanQuery.toLowerCase())) {
        results.push({
          id: `run:alias:${a}`,
          alias: a,
          command: target,
          title: `Run Alias: ${a} (${target})`,
          isCustom: true
        });
      }
    }

    // Check matching common targets
    for (const ct of COMMON_RUN_TARGETS) {
      if (ct.name.includes(cleanQuery.toLowerCase()) || ct.title.toLowerCase().includes(cleanQuery.toLowerCase())) {
        results.push({
          id: `run:common:${ct.name}`,
          alias: ct.name,
          command: ct.name,
          title: `Run ${ct.name} — ${ct.title}`,
          description: ct.description,
          isCustom: false
        });
      }
    }

    // Also offer direct arbitrary execution
    results.unshift({
      id: `run:exec:${cleanQuery}`,
      alias: cleanQuery,
      command: cleanQuery,
      title: `Run "${cleanQuery}"`,
      description: 'Execute in Windows shell or PATH',
      isCustom: false
    });
  } else if (isPrefixed) {
    // Show top common targets when user just types ">"
    for (const ct of COMMON_RUN_TARGETS.slice(0, 10)) {
      results.push({
        id: `run:common:${ct.name}`,
        alias: ct.name,
        command: ct.name,
        title: `Run ${ct.name} — ${ct.title}`,
        description: ct.description,
        isCustom: false
      });
    }
  }

  return results;
}

module.exports = {
  COMMON_RUN_TARGETS,
  expandEnv,
  execute,
  getSavedAliases,
  saveAlias,
  deleteAlias,
  searchRun
};
