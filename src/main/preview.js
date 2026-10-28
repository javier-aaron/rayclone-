'use strict';

const fs = require('node:fs');
const path = require('node:path');

const TEXT_EXTS = new Set([
  '.txt', '.md', '.markdown', '.js', '.jsx', '.ts', '.tsx', '.json',
  '.html', '.css', '.scss', '.py', '.ps1', '.bat', '.cmd', '.sh',
  '.xml', '.yaml', '.yml', '.ini', '.log', '.toml', '.env'
]);

const IMAGE_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.bmp'
]);

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return bytes + ' B';
}

async function getPreviewForItem(item) {
  if (!item) return null;

  // 1. File Preview
  if (item.filePath || (item.group === 'Files' && item.subtitle)) {
    const targetPath = item.filePath || item.subtitle;
    try {
      if (fs.existsSync(targetPath)) {
        const stat = fs.statSync(targetPath);
        if (stat.isDirectory()) {
          const entries = fs.readdirSync(targetPath);
          return {
            type: 'folder',
            title: path.basename(targetPath),
            path: targetPath,
            size: `${entries.length} items`,
            modified: stat.mtime.toLocaleString(),
            content: entries.slice(0, 15).join('\n') + (entries.length > 15 ? `\n...and ${entries.length - 15} more` : '')
          };
        }

        const ext = path.extname(targetPath).toLowerCase();
        const base = {
          type: 'file',
          title: path.basename(targetPath),
          path: targetPath,
          size: formatBytes(stat.size),
          modified: stat.mtime.toLocaleString()
        };

        if (IMAGE_EXTS.has(ext) && stat.size < 6 * 1024 * 1024) {
          try {
            const buf = fs.readFileSync(targetPath);
            const mime = ext === '.svg' ? 'image/svg+xml' : `image/${ext.slice(1)}`;
            return {
              ...base,
              type: 'image',
              dataUrl: `data:${mime};base64,${buf.toString('base64')}`
            };
          } catch {}
        }

        if (TEXT_EXTS.has(ext) && stat.size < 2 * 1024 * 1024) {
          try {
            const text = fs.readFileSync(targetPath, 'utf8');
            const lines = text.split(/\r?\n/);
            return {
              ...base,
              type: 'text',
              content: lines.slice(0, 80).join('\n') + (lines.length > 80 ? '\n...[truncated]' : ''),
              lineCount: lines.length
            };
          } catch {}
        }

        return base;
      }
    } catch { /* stat failed */ }
  }

  // 2. Note Preview
  if (item.group === 'Notes') {
    return {
      type: 'note',
      title: item.title,
      content: item.fullContent || item.subtitle || '',
      modified: item.modified || 'Saved note'
    };
  }

  // 3. Snippet Preview
  if (item.group === 'Snippets') {
    return {
      type: 'snippet',
      title: item.title,
      content: item.fullContent || item.subtitle || ''
    };
  }

  // 4. Process Preview
  if (item.group === 'Process Manager' || item.group === 'Processes') {
    return {
      type: 'process',
      title: item.title,
      pid: item.pid,
      memory: item.memory,
      path: item.subtitle
    };
  }

  // 5. Script Commands Preview
  if (item.group === 'Script Commands' || item.provider === 'scripts') {
    return {
      type: 'script',
      title: item.title,
      packageName: item.packageName || 'Script Commands',
      description: item.description || item.subtitle || '',
      path: item.filePath,
      mode: item.mode || 'compact'
    };
  }

  // 6. Emojis Preview
  if (item.group === 'Emojis & Symbols') {
    return {
      type: 'emoji',
      title: item.title,
      subtitle: item.subtitle
    };
  }

  // 7. Translator Preview
  if (item.provider === 'translator' || item.group === 'Translator') {
    return {
      type: 'translator',
      title: item.title,
      sourceText: item.sourceText || item.title,
      translatedText: item.translatedText || item.fullContent || item.subtitle,
      sourceLang: item.sourceLang,
      targetLang: item.targetLang,
      provider: item.translatorProvider || 'Neural Engine'
    };
  }

  // 8. Dictionary Preview
  if (item.provider === 'dictionary' || item.group === 'Dictionary') {
    return {
      type: 'dictionary',
      title: item.word || item.title,
      phonetic: item.phonetic || '',
      meanings: item.meanings || [],
      synonyms: item.synonyms || [],
      antonyms: item.antonyms || []
    };
  }

  // 9. Focus Preview
  if (item.provider === 'focus' || item.group === 'Raycast Focus') {
    return {
      type: 'focus',
      title: item.title,
      state: item.state || 'idle',
      remainingFormatted: item.remainingFormatted || '25:00',
      category: item.category || 'Work',
      progressPercent: item.progressPercent || 0,
      stats: item.stats || {}
    };
  }

  // 10. Calendar Preview
  if (item.provider === 'calendar' || item.group === 'Calendar') {
    return {
      type: 'calendar',
      title: item.title,
      date: item.dateFormatted || item.subtitle,
      platform: item.platform || 'Virtual Meeting',
      meetingUrl: item.meetingUrl,
      notes: item.notes || ''
    };
  }

  // 11. Weather Preview
  if (item.provider === 'weather' || item.group === 'Weather') {
    return {
      type: 'weather',
      title: item.title,
      city: item.city || item.title,
      temp: item.tempFormatted || item.subtitle,
      condition: item.condition || '',
      humidity: item.humidity,
      wind: item.wind
    };
  }

  // 12. Contacts Preview
  if (item.provider === 'contacts' || item.group === 'Contacts') {
    return {
      type: 'contacts',
      title: item.title,
      company: item.company,
      role: item.role,
      email: item.email,
      phone: item.phone,
      notes: item.notes
    };
  }

  // 13. MCP Preview
  if (item.provider === 'mcp' || item.group === 'MCP') {
    return {
      type: 'mcp',
      title: item.title,
      description: item.description || item.subtitle,
      transport: item.transport,
      serverName: item.serverName,
      tools: item.tools || []
    };
  }

  // 14. Typing Preview
  if (item.provider === 'typing' || item.group === 'Typing Practice') {
    return {
      type: 'typing',
      title: item.title,
      text: item.passageText,
      author: item.author,
      bestScore: item.bestScore
    };
  }

  // 15. Windows Run Preview
  if (item.provider === 'windows-run' || item.group === 'Run') {
    return {
      type: 'windows-run',
      title: item.title,
      command: item.command || item.subtitle,
      description: item.description
    };
  }

  // 16. Window Switcher Preview
  if (item.provider === 'navigation' || item.group === 'Navigation') {
    return {
      type: 'navigation',
      title: item.title,
      processName: item.processName,
      pid: item.pid
    };
  }

  // 17. Dictation Preview
  if (item.provider === 'dictation' || item.group === 'Dictation') {
    return {
      type: 'dictation',
      title: item.title,
      text: item.fullText || item.subtitle,
      source: item.source || 'Voice Typing',
      timestamp: item.timestamp || 'Recent'
    };
  }

  // 18. Games Preview
  if (item.provider === 'games' || item.group === 'Games') {
    return {
      type: 'games',
      title: item.title,
      platform: item.platform || 'PC Game',
      genre: item.genre || 'Action',
      description: item.description || item.subtitle,
      launchUrl: item.launchUrl || item.url
    };
  }

  // 19. Port & Socket Inspector Preview
  if (item.provider === 'ports' || item.group === 'Listening Ports' || item.portData) {
    const data = item.portData || {};
    return {
      type: 'port',
      title: item.title,
      port: data.port || item.port,
      pid: data.pid || item.pid,
      processName: data.processName || item.processName || 'Unknown',
      commandLine: data.commandLine || item.commandLine || '',
      state: item.state || data.state || 'LISTENING',
      address: item.address || (item.port ? `0.0.0.0:${item.port}` : ''),
      memory: item.memory || ''
    };
  }

  // 20. Git Repository Preview
  if (item.provider === 'git' || item.group === 'Git Repositories' || item.gitData) {
    const data = item.gitData || {};
    const dirty = data.dirty !== undefined ? data.dirty : !!item.dirty;
    const dirtyCount = data.dirtyCount !== undefined ? data.dirtyCount : (item.dirtyCount || 0);
    return {
      type: 'git',
      title: item.title,
      name: item.title,
      repoName: item.title,
      path: data.path || item.path || '',
      branch: data.branch || item.branch || 'main',
      dirty,
      isDirty: dirty,
      dirtyCount,
      modifiedCount: dirtyCount,
      lastCommit: item.lastCommit || ''
    };
  }

  // 21. Docker Container Preview
  if (item.provider === 'docker' || item.group === 'Docker Containers' || item.dockerData) {
    const data = item.dockerData || {};
    return {
      type: 'docker',
      title: item.title,
      id: data.id || item.containerId || item.id || '',
      name: data.name || item.title,
      containerName: data.name || item.title,
      image: data.image || item.image || '',
      status: data.status || item.status || 'unknown',
      state: item.state || data.status || 'unknown',
      ports: data.ports || item.ports || '',
      logsSnippet: item.logsSnippet || ''
    };
  }

  // 22. GitHub / GitLab Shortcuts Preview
  if (item.provider === 'github-shortcuts' || item.group === 'GitHub / GitLab') {
    return {
      type: 'quicklink',
      title: item.title,
      url: item.targetUrl || item.subtitle || '',
      platform: item.platform || 'GitHub',
      query: item.query || ''
    };
  }

  // 23. Audio Switcher Preview (M2)
  if (item.provider === 'audio' || item.group === 'Audio Endpoints' || item.audioData) {
    const data = item.audioData || {};
    const isDef = data.isDefault !== undefined ? data.isDefault : !!item.isDefault;
    const kind = data.type ? (data.type.toLowerCase().includes('rec') ? 'Recording' : 'Playback') : (item.deviceType || 'Playback');
    return {
      type: 'audio',
      title: item.title,
      id: data.id || item.deviceId || item.id,
      deviceId: data.id || item.deviceId || item.id,
      name: data.name || item.endpointName || item.title,
      endpointName: data.name || item.endpointName || item.title,
      kind,
      deviceType: kind,
      isDefault: isDef
    };
  }

  // 24. Windows Service Preview (M2)
  if (item.provider === 'services' || item.group === 'Windows Services' || item.serviceData) {
    const data = item.serviceData || {};
    return {
      type: 'service',
      title: item.title,
      name: data.name || item.serviceName || item.name || '',
      serviceName: data.name || item.serviceName || item.name || '',
      displayName: data.displayName || item.displayName || item.title || '',
      status: data.status || item.status || 'Stopped',
      startType: data.startType || item.startType || 'Manual',
      binaryPath: item.binaryPath || ''
    };
  }

  // 25. Environment Variable Preview (M2)
  if (item.provider === 'env' || item.group === 'Environment Variables' || item.envData) {
    const data = item.envData || {};
    const val = data.value !== undefined ? data.value : (item.value || '');
    const paths = data.paths || (val ? val.split(';').map((p) => ({ path: p.trim(), exists: false })) : []);
    return {
      type: 'env',
      title: item.title,
      name: data.name || item.varName || item.name || '',
      varName: data.name || item.varName || item.name || '',
      scope: data.scope || item.scope || 'Machine',
      value: val,
      paths,
      pathEntries: paths
    };
  }

  // 26. Winget Software Upgrade Preview (M2)
  if (item.provider === 'winget' || item.group === 'Software Updates' || item.wingetData) {
    const data = item.wingetData || {};
    return {
      type: 'winget',
      title: item.title,
      id: data.id || item.id || '',
      name: data.name || item.packageName || item.name || '',
      packageName: data.name || item.packageName || item.name || '',
      version: data.currentVersion || item.currentVersion || '',
      currentVersion: data.currentVersion || item.currentVersion || '',
      availableVersion: data.availableVersion || item.availableVersion || '',
      source: item.source || 'winget'
    };
  }

  // 27. Hosts File Preview (M2)
  if (item.provider === 'hosts' || item.group === 'Hosts File' || item.hostsData) {
    const data = item.hostsData || {};
    const enabled = data.enabled !== undefined ? data.enabled : (item.enabled !== undefined ? item.enabled : true);
    return {
      type: 'hosts',
      title: item.title,
      ip: data.ip || item.ip || '127.0.0.1',
      domain: data.domain || item.domain || '',
      enabled,
      isEnabled: enabled,
      comment: data.comment || item.comment || '',
      totalRules: item.totalRules || 1
    };
  }

  // 28. Media Now Playing Preview (M3)
  if (item.provider === 'media' || item.group === 'Now Playing' || item.mediaData) {
    const data = item.mediaData || {};
    return {
      type: 'media',
      title: data.title || item.title || 'Unknown Title',
      artist: data.artist || item.artist || 'Unknown Artist',
      album: data.album || item.album || 'Unknown Album',
      status: data.status || item.status || 'Playing',
      app: data.app || item.app || 'Media Player',
      volume: data.volume !== undefined ? data.volume : (item.volume !== undefined ? item.volume : 50)
    };
  }

  // 29. Parameterized Quicklinks Preview (M3)
  if (item.provider === 'quicklinks-param' || item.quicklinkData) {
    const data = item.quicklinkData || {};
    return {
      type: 'quicklink',
      title: item.title,
      templateName: data.name || item.title,
      templatePattern: data.template || item.template || '',
      resolvedUrl: data.resolvedUrl || item.targetUrl || item.url || '',
      url: data.resolvedUrl || item.targetUrl || item.url || '',
      params: data.params || []
    };
  }

  // 30. Color Picker Preview
  if (item.provider === 'color-picker' || item.group === 'Color Picker') {
    const hex = (item.title && item.title.match(/#[0-9A-Fa-f]{6}/)) ? item.title.match(/#[0-9A-Fa-f]{6}/)[0] : '#FF6363';
    return {
      type: 'color',
      title: item.title,
      hex,
      subtitle: item.subtitle
    };
  }

  // 31. Wi-Fi Preview
  if (item.provider === 'wifi' || item.group === 'Wi-Fi') {
    return {
      type: 'wifi',
      title: item.title,
      subtitle: item.subtitle,
      network: item.title.replace('Wi-Fi Network: ', '').replace(/"/g, '')
    };
  }

  // 32. Power & Battery Preview
  if (item.provider === 'power' || item.group === 'Power & Battery') {
    return {
      type: 'power',
      title: item.title,
      subtitle: item.subtitle
    };
  }

  // 33. Reminders Preview
  if (item.provider === 'reminders' || item.group === 'Reminders') {
    return {
      type: 'reminder',
      title: item.title,
      subtitle: item.subtitle
    };
  }

  // 34. Extension Store Preview
  if (item.provider === 'extension-store' || item.group === 'Extensions') {
    return {
      type: 'extension',
      title: item.title,
      subtitle: item.subtitle
    };
  }

  // 35. Windows Settings Preview
  if (item.provider === 'windows-settings' || item.group === 'Windows Settings') {
    return {
      type: 'windows-setting',
      title: item.title,
      subtitle: item.subtitle,
      area: (item.subtitle || '').split('•')[0].trim()
    };
  }

  // 36. Registry Preview
  if (item.provider === 'registry' || item.group === 'Registry') {
    return {
      type: 'registry',
      title: item.title,
      subtitle: item.subtitle
    };
  }

  // 37. VS Code Workspace Preview
  if (item.provider === 'vscode-workspaces' || item.group === 'VS Code Workspaces') {
    return {
      type: 'vscode-workspace',
      title: item.title,
      subtitle: item.subtitle
    };
  }

  // 38. Window Walker Preview
  if (item.provider === 'window-walker' || item.group === 'Window Walker') {
    return {
      type: 'window-walker',
      title: item.title,
      subtitle: item.subtitle
    };
  }

  // 39. System Diagnostics & Chronometrics Preview
  if (item.provider === 'diagnostics' || item.group === 'System Diagnostics' || item.provider === 'chronometrics' || item.group === 'Time & Chronometrics') {
    return {
      type: 'diagnostics',
      title: item.title,
      subtitle: item.subtitle
    };
  }

  // 40. WSL Distribution Preview
  if (item.provider === 'wsl' || item.group === 'WSL Distributions') {
    return {
      type: 'wsl-distro',
      title: item.title,
      subtitle: item.subtitle,
      wslData: item.wslData || null
    };
  }

  // 41. Bluetooth Device Preview
  if (item.provider === 'bluetooth' || item.group === 'Bluetooth Devices') {
    return {
      type: 'bluetooth-device',
      title: item.title,
      subtitle: item.subtitle,
      bluetoothData: item.bluetoothData || null
    };
  }

  // 42. DNS Switcher Preview
  if (item.provider === 'dns' || item.group === 'DNS Presets') {
    return {
      type: 'dns-preset',
      title: item.title,
      subtitle: item.subtitle,
      dnsData: item.dnsData || null
    };
  }

  // 43. Sandboxed Extension Preview
  if (item.provider === 'sandboxed-extensions' || item.group === 'Extensions (Sandboxed)') {
    return {
      type: 'sandboxed-extension',
      title: item.title,
      subtitle: item.subtitle,
      extensionData: item.extensionData || null
    };
  }

  // 44. Generic preview
  return {
    type: 'generic',
    title: item.title,
    subtitle: item.subtitle,
    group: item.group
  };
}

module.exports = {
  getPreviewForItem
};
