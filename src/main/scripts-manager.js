'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

let scriptsDir = null;
let cachedScripts = [];
let watcher = null;

function parseMetadata(content, filename) {
  const meta = {
    id: `script:${filename}`,
    filename,
    title: path.parse(filename).name.replace(/[-_]/g, ' '),
    description: '',
    mode: 'compact', // compact, fullOutput, silent
    icon: 'code',
    packageName: 'Script Commands',
    arguments: []
  };

  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    // Stop parsing headers when reaching non-comment lines
    if (!trimmed.startsWith('#') && !trimmed.startsWith('//') && !trimmed.startsWith('rem ') && !trimmed.startsWith('::') && trimmed !== '') {
      break;
    }
    const match = trimmed.match(/(?:#|\/\/|rem|::)\s*@raycast\.(\w+)\s+(.+)$/i);
    if (match) {
      const key = match[1].toLowerCase();
      const val = match[2].trim();
      if (key === 'title') meta.title = val;
      else if (key === 'description') meta.description = val;
      else if (key === 'mode') meta.mode = val.toLowerCase();
      else if (key === 'icon') meta.icon = val;
      else if (key === 'packagename') meta.packageName = val;
      else if (key.startsWith('argument')) {
        try {
          meta.arguments.push(JSON.parse(val));
        } catch {
          meta.arguments.push({ type: 'text', placeholder: val });
        }
      }
    }
  }

  return meta;
}

function ensureStarterScripts(dir) {
  const dnsScript = path.join(dir, 'flush-dns.ps1');
  if (!fs.existsSync(dnsScript)) {
    const content = `# @raycast.title Flush DNS Cache
# @raycast.description Clears Windows DNS resolver cache
# @raycast.mode compact
# @raycast.icon 🌐
# @raycast.packageName Network Tools

Clear-DnsClientCache
Write-Output "DNS Cache Flushed Successfully"
`;
    try { fs.writeFileSync(dnsScript, content, 'utf8'); } catch {}
  }

  const uptimeScript = path.join(dir, 'system-uptime.ps1');
  if (!fs.existsSync(uptimeScript)) {
    const content = `# @raycast.title System Uptime
# @raycast.description Displays current system uptime
# @raycast.mode compact
# @raycast.icon ⏱️
# @raycast.packageName System Tools

$uptime = (Get-Date) - (Get-CimInstance Win32_OperatingSystem).LastBootUpTime
Write-Output ("Uptime: {0} days, {1} hours, {2} minutes" -f $uptime.Days, $uptime.Hours, $uptime.Minutes)
`;
    try { fs.writeFileSync(uptimeScript, content, 'utf8'); } catch {}
  }
}

function scan() {
  if (!scriptsDir || !fs.existsSync(scriptsDir)) {
    cachedScripts = [];
    return cachedScripts;
  }

  const files = fs.readdirSync(scriptsDir);
  const result = [];
  const validExts = ['.ps1', '.bat', '.cmd', '.py', '.js'];

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    if (!validExts.includes(ext)) continue;
    const fullPath = path.join(scriptsDir, file);
    try {
      const content = fs.readFileSync(fullPath, 'utf8');
      const meta = parseMetadata(content, file);
      meta.filePath = fullPath;
      meta.ext = ext;
      result.push(meta);
    } catch { /* skip invalid */ }
  }

  cachedScripts = result;
  return cachedScripts;
}

function init(targetDir) {
  scriptsDir = targetDir;
  try {
    fs.mkdirSync(scriptsDir, { recursive: true });
    ensureStarterScripts(scriptsDir);
    scan();
    if (watcher) watcher.close();
    watcher = fs.watch(scriptsDir, { persistent: false }, () => {
      scan();
    });
  } catch {}
}

function runScript(scriptMeta, args = []) {
  return new Promise((resolve) => {
    let cmd, cmdArgs;
    const fullPath = scriptMeta.filePath;

    switch (scriptMeta.ext) {
      case '.ps1':
        cmd = 'powershell.exe';
        cmdArgs = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', fullPath, ...args];
        break;
      case '.bat':
      case '.cmd':
        cmd = 'cmd.exe';
        cmdArgs = ['/c', fullPath, ...args];
        break;
      case '.py':
        cmd = process.env.PY_LAUNCHER || 'py.exe';
        cmdArgs = ['-3', fullPath, ...args];
        break;
      case '.js':
        cmd = 'node';
        cmdArgs = [fullPath, ...args];
        break;
      default:
        return resolve({ ok: false, error: 'Unsupported script extension' });
    }

    const proc = spawn(cmd, cmdArgs, { windowsHide: true });
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d) => { stdout += d.toString('utf8'); });
    proc.stderr.on('data', (d) => { stderr += d.toString('utf8'); });

    const timeout = setTimeout(() => {
      try { proc.kill(); } catch {}
      resolve({ ok: false, error: 'Script execution timed out (15s)' });
    }, 15000);

    proc.on('close', (code) => {
      clearTimeout(timeout);
      const out = stdout.trim();
      const err = stderr.trim();
      if (code === 0) {
        resolve({ ok: true, output: out || 'Done', code });
      } else {
        resolve({ ok: false, error: err || `Script exited with code ${code}`, output: out, code });
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      resolve({ ok: false, error: err.message });
    });
  });
}

module.exports = {
  init,
  scan,
  getScripts: () => cachedScripts,
  runScript,
  parseMetadata
};
