'use strict';

const { exec, execFile } = require('node:child_process');
const os = require('node:os');

const DNS_PRESETS = [
  {
    id: 'cloudflare',
    name: 'Cloudflare (1.1.1.1)',
    description: 'Fastest consumer DNS with strict privacy & no-log policy',
    primary: '1.1.1.1',
    secondary: '1.0.0.1',
    icon: '⚡',
    tag: 'Privacy & Speed'
  },
  {
    id: 'google',
    name: 'Google Public DNS',
    description: 'Worldwide Anycast infrastructure with resilient high uptime',
    primary: '8.8.8.8',
    secondary: '8.8.4.4',
    icon: '🌐',
    tag: 'Reliability'
  },
  {
    id: 'quad9',
    name: 'Quad9 (Malware Blocking)',
    description: 'Automated threat intelligence blocking malicious & phishing domains',
    primary: '9.9.9.9',
    secondary: '149.112.112.112',
    icon: '🛡️',
    tag: 'Security'
  },
  {
    id: 'adguard',
    name: 'AdGuard DNS',
    description: 'Default ad-blocking & tracker prevention at DNS query level',
    primary: '94.140.14.14',
    secondary: '94.140.15.15',
    icon: '🚫',
    tag: 'Ad-Blocking'
  },
  {
    id: 'dhcp',
    name: 'Automatic (DHCP)',
    description: 'Reset DNS to your local router or ISP default dynamic allocation',
    primary: null,
    secondary: null,
    icon: '🔄',
    tag: 'Default'
  }
];

function getActiveNetworkAdapter() {
  return new Promise((resolve) => {
    const ps = `
      $r = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object { $_.InterfaceAlias -notmatch 'vEthernet|Hyper-V|VMware|VirtualBox|TAP|WireGuard|Tailscale|Loopback|WSL' } |
        Sort-Object RouteMetric |
        Select-Object -First 1
      if ($r) { $r.InterfaceAlias } else { '' }
    `;
    execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { timeout: 3000 }, (err, stdout) => {
      const alias = String(stdout || '').trim();
      if (!err && alias) {
        return resolve(alias);
      }
      // Fallback: examine os.networkInterfaces() excluding virtual keywords
      const ifaces = os.networkInterfaces();
      for (const [name, addrs] of Object.entries(ifaces)) {
        if (/vEthernet|Hyper-V|VMware|VirtualBox|TAP|WireGuard|Tailscale|Loopback|WSL/i.test(name)) continue;
        if (addrs.some((a) => !a.internal && a.family === 'IPv4')) {
          return resolve(name);
        }
      }
      return resolve('Wi-Fi');
    });
  });
}

function getCurrentDns(adapterName = null) {
  return new Promise(async (resolve) => {
    const adapter = adapterName || (await getActiveNetworkAdapter());
    const ps = `
      Get-DnsClientServerAddress -InterfaceAlias "${adapter}" -AddressFamily IPv4 -ErrorAction SilentlyContinue |
      Select-Object -ExpandProperty ServerAddresses
    `;
    execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { timeout: 3000 }, (err, stdout) => {
      if (err || !stdout) {
        return resolve({ adapter, servers: [] });
      }
      const servers = stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      resolve({ adapter, servers });
    });
  });
}

function runElevatedPs(command) {
  return new Promise((resolve) => {
    // Attempt standard execution first
    execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', command], { timeout: 4000 }, (err) => {
      if (!err) return resolve({ ok: true, elevated: false });

      // If failed or permission denied, invoke UAC elevation helper via EncodedCommand
      const b64 = Buffer.from(command, 'utf16le').toString('base64');
      const elevateScript = `Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile', '-NonInteractive', '-EncodedCommand', '${b64}' -WindowStyle Hidden -Wait`;
      execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', elevateScript], { timeout: 15000 }, (elevateErr) => {
        if (elevateErr) {
          resolve({ ok: false, elevated: true, error: elevateErr.message || 'UAC elevation denied or failed' });
        } else {
          resolve({ ok: true, elevated: true });
        }
      });
    });
  });
}

function applyDnsPreset(presetId, adapterName = null) {
  return new Promise(async (resolve) => {
    const preset = DNS_PRESETS.find((p) => p.id === presetId);
    if (!preset) return resolve({ ok: false, error: 'Unknown preset' });
    const adapter = adapterName || (await getActiveNetworkAdapter());

    let psCmd = '';
    if (preset.id === 'dhcp') {
      psCmd = `Set-DnsClientServerAddress -InterfaceAlias '${adapter}' -ResetServerAddresses`;
    } else {
      psCmd = `Set-DnsClientServerAddress -InterfaceAlias '${adapter}' -ServerAddresses @('${preset.primary}','${preset.secondary}')`;
    }

    const runResult = await runElevatedPs(psCmd);
    if (!runResult.ok) {
      return resolve({
        ok: false,
        preset: preset.name,
        adapter,
        error: runResult.error || 'Failed to apply DNS configuration'
      });
    }

    // Task 3.3: Verify after apply - re-read DNS and check the actual result
    const verification = await getCurrentDns(adapter);
    const hasApplied = preset.id === 'dhcp'
      ? verification.servers.length === 0 || !verification.servers.includes(preset.primary)
      : verification.servers.includes(preset.primary);

    resolve({
      ok: hasApplied,
      preset: preset.name,
      adapter,
      elevated: runResult.elevated,
      verifiedServers: verification.servers
    });
  });
}

function formatDnsPresetItem(preset, currentServers = []) {
  const isMatch = preset.primary && currentServers.includes(preset.primary);
  const isDhcpActive = preset.id === 'dhcp' && currentServers.length === 0;
  const isCurrent = isMatch || isDhcpActive;
  const badge = isCurrent ? ' (Active)' : '';

  return {
    id: `dns:preset:${preset.id}`,
    title: `${preset.name}${badge}`,
    subtitle: `${preset.tag} • ${preset.primary ? `${preset.primary}, ${preset.secondary}` : 'Dynamic router DNS'}`,
    icon: preset.icon,
    group: 'DNS Presets',
    keywords: ['dns', 'cloudflare', 'google', 'quad9', 'dhcp', preset.id, preset.name.toLowerCase()],
    scoreBoost: isCurrent ? 260 : 200,
    dnsData: preset,
    actions: [
      {
        id: 'apply',
        title: `Apply ${preset.name}`,
        shortcut: '↵',
        run: () => applyDnsPreset(preset.id)
      },
      {
        id: 'copy-primary',
        title: 'Copy Primary DNS IP',
        shortcut: 'Ctrl+Shift+C',
        run: () => {
          if (!preset.primary) return { ok: true, dhcp: true };
          try {
            const electron = require('electron');
            if (electron && electron.clipboard && typeof electron.clipboard.writeText === 'function') {
              electron.clipboard.writeText(preset.primary);
            }
          } catch {}
          return { ok: true, copied: preset.primary };
        }
      }
    ]
  };
}

async function searchDns(query) {
  const q = String(query || '').replace(/^(dns:?|\$dns)/i, '').trim().toLowerCase();
  const current = await getCurrentDns();
  if (!q) {
    return DNS_PRESETS.map((p) => formatDnsPresetItem(p, current.servers));
  }
  return DNS_PRESETS
    .filter((p) => p.name.toLowerCase().includes(q) || p.id.includes(q) || (p.primary && p.primary.includes(q)) || p.tag.toLowerCase().includes(q))
    .map((p) => formatDnsPresetItem(p, current.servers));
}

module.exports = {
  DNS_PRESETS,
  getActiveNetworkAdapter,
  getCurrentDns,
  applyDnsPreset,
  formatDnsPresetItem,
  searchDns
};
