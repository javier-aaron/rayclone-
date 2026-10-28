'use strict';

const { shell } = require('electron');
const { exec } = require('node:child_process');

const WINDOWS_SETTINGS_CATALOG = [
  // 1. System
  { name: 'Display', command: 'ms-settings:display', area: 'System', altNames: ['resolution', 'brightness', 'scale', 'monitor', 'hdr', 'multiple displays', 'refresh rate'] },
  { name: 'Sound', command: 'ms-settings:sound', area: 'System', altNames: ['volume', 'audio', 'speakers', 'microphone', 'headphones', 'output device', 'input device'] },
  { name: 'Notifications', command: 'ms-settings:notifications', area: 'System', altNames: ['alerts', 'dnd', 'do not disturb', 'focus', 'badges'] },
  { name: 'Focus Assist', command: 'ms-settings:quiethours', area: 'System', altNames: ['quiet hours', 'do not disturb', 'mute notifications', 'gaming focus'] },
  { name: 'Power & Battery', command: 'ms-settings:powersleep', area: 'System', altNames: ['sleep', 'screen timeout', 'battery saver', 'energy', 'power mode'] },
  { name: 'Storage', command: 'ms-settings:storagesense', area: 'System', altNames: ['disk', 'storage sense', 'clean temp', 'hard drive', 'free space'] },
  { name: 'Nearby Sharing', command: 'ms-settings:crossdevice', area: 'System', altNames: ['airdrop', 'bluetooth transfer', 'share files'] },
  { name: 'Multitasking', command: 'ms-settings:multitasking', area: 'System', altNames: ['snap', 'virtual desktop', 'alt tab', 'title bar window shake'] },
  { name: 'Activation', command: 'ms-settings:activation', area: 'System', altNames: ['product key', 'license', 'windows genuine', 'upgrade edition'] },
  { name: 'Troubleshoot', command: 'ms-settings:troubleshoot', area: 'System', altNames: ['fix', 'repair', 'diagnostic', 'network troubleshoot'] },
  { name: 'Recovery', command: 'ms-settings:recovery', area: 'System', altNames: ['reset pc', 'advanced startup', 'go back', 'reinstall windows'] },
  { name: 'Projecting to this PC', command: 'ms-settings:project', area: 'System', altNames: ['miracast', 'wireless display', 'cast screen'] },
  { name: 'Remote Desktop', command: 'ms-settings:remotedesktop', area: 'System', altNames: ['rdp', 'remote access', 'connect pc'] },
  { name: 'About Your PC', command: 'ms-settings:about', area: 'System', altNames: ['specs', 'processor', 'ram', 'device name', 'windows version', 'build'] },

  // 2. Bluetooth & Devices
  { name: 'Bluetooth & Devices', command: 'ms-settings:bluetooth', area: 'Devices', altNames: ['pair', 'wireless', 'headphones', 'airpods', 'controller'] },
  { name: 'Printers & Scanners', command: 'ms-settings:printers', area: 'Devices', altNames: ['print', 'fax', 'scanner', 'add printer'] },
  { name: 'Phone Link', command: 'ms-settings:mobile-devices', area: 'Devices', altNames: ['android', 'iphone', 'your phone', 'mobile link'] },
  { name: 'Cameras', command: 'ms-settings:camera', area: 'Devices', altNames: ['webcam', 'integrated camera', 'privacy camera'] },
  { name: 'Mouse', command: 'ms-settings:mousetouchpad', area: 'Devices', altNames: ['pointer speed', 'primary button', 'scroll wheel', 'cursor'] },
  { name: 'Touchpad', command: 'ms-settings:devices-touchpad', area: 'Devices', altNames: ['gestures', 'pinch zoom', 'three finger tap', 'sensitivity'] },
  { name: 'Pen & Windows Ink', command: 'ms-settings:pen', area: 'Devices', altNames: ['stylus', 'handwriting', 'font smoothing'] },
  { name: 'AutoPlay', command: 'ms-settings:autoplay', area: 'Devices', altNames: ['usb plug', 'removable drive action', 'memory card'] },
  { name: 'USB', command: 'ms-settings:usb', area: 'Devices', altNames: ['usb notifications', 'battery saver usb'] },

  // 3. Network & Internet
  { name: 'Network & Internet', command: 'ms-settings:network', area: 'Network', altNames: ['connection', 'status', 'adapter', 'ip status'] },
  { name: 'Wi-Fi', command: 'ms-settings:network-wifi', area: 'Network', altNames: ['wireless', 'hotspot', 'wifi network', 'manage known networks'] },
  { name: 'Ethernet', command: 'ms-settings:network-ethernet', area: 'Network', altNames: ['lan', 'cable', 'wired network', 'gigabit'] },
  { name: 'VPN', command: 'ms-settings:network-vpn', area: 'Network', altNames: ['virtual private network', 'tunnel', 'secure connection'] },
  { name: 'Mobile Hotspot', command: 'ms-settings:network-mobilehotspot', area: 'Network', altNames: ['tethering', 'share internet', 'wifi hotspot'] },
  { name: 'Airplane Mode', command: 'ms-settings:network-airplanemode', area: 'Network', altNames: ['flight mode', 'disable wireless', 'radio off'] },
  { name: 'Proxy', command: 'ms-settings:network-proxy', area: 'Network', altNames: ['pac file', 'proxy server', 'manual proxy', 'lan settings'] },
  { name: 'Advanced Network Settings', command: 'ms-settings:network-advancedsettings', area: 'Network', altNames: ['network reset', 'data usage', 'adapter options'] },

  // 4. Personalization
  { name: 'Personalization', command: 'ms-settings:personalization', area: 'Personalization', altNames: ['customize', 'look and feel', 'ui'] },
  { name: 'Background & Wallpaper', command: 'ms-settings:personalization-background', area: 'Personalization', altNames: ['wallpaper', 'desktop image', 'slideshow', 'picture'] },
  { name: 'Colors & Dark Mode', command: 'ms-settings:colors', area: 'Personalization', altNames: ['dark mode', 'light mode', 'accent color', 'transparency effects'] },
  { name: 'Themes', command: 'ms-settings:themes', area: 'Personalization', altNames: ['windows theme', 'sound scheme', 'mouse cursor theme'] },
  { name: 'Lock Screen', command: 'ms-settings:lockscreen', area: 'Personalization', altNames: ['windows spotlight', 'login screen image', 'status widgets'] },
  { name: 'Text Input & Touch Keyboard', command: 'ms-settings:keyboard', area: 'Personalization', altNames: ['touch keyboard theme', 'emoji panel skin'] },
  { name: 'Start Menu Settings', command: 'ms-settings:personalization-start', area: 'Personalization', altNames: ['start layout', 'recent apps', 'show folders'] },
  { name: 'Taskbar Behaviors', command: 'ms-settings:taskbar', area: 'Personalization', altNames: ['taskbar alignment', 'center taskbar', 'auto hide taskbar', 'system tray icons'] },
  { name: 'Fonts', command: 'ms-settings:fonts', area: 'Personalization', altNames: ['installed fonts', 'typography', 'add font'] },

  // 5. Apps
  { name: 'Installed Apps', command: 'ms-settings:appsfeatures', area: 'Apps', altNames: ['uninstall', 'app list', 'remove programs', 'manage apps'] },
  { name: 'Default Apps', command: 'ms-settings:defaultapps', area: 'Apps', altNames: ['default browser', 'mail handler', 'file associations', 'choose defaults'] },
  { name: 'Optional Features', command: 'ms-settings:optionalfeatures', area: 'Apps', altNames: ['windows features', 'wsl', 'hyper-v', 'media player'] },
  { name: 'Startup Apps', command: 'ms-settings:startupapps', area: 'Apps', altNames: ['auto start', 'boot programs', 'disable startup'] },
  { name: 'Video Playback', command: 'ms-settings:videoplayback', area: 'Apps', altNames: ['hdr video', 'battery video optimization'] },

  // 6. Accounts
  { name: 'Your Info', command: 'ms-settings:yourinfo', area: 'Accounts', altNames: ['profile picture', 'microsoft account', 'local account'] },
  { name: 'Sign-in Options', command: 'ms-settings:signinoptions', area: 'Accounts', altNames: ['windows hello', 'pin', 'fingerprint', 'face unlock', 'password'] },
  { name: 'Family & Other Users', command: 'ms-settings:otherusers', area: 'Accounts', altNames: ['add user', 'guest account', 'family safety'] },
  { name: 'Windows Backup & Sync', command: 'ms-settings:backup', area: 'Accounts', altNames: ['onedrive backup', 'remember preferences', 'sync settings'] },

  // 7. Time & Language
  { name: 'Date & Time', command: 'ms-settings:dateandtime', area: 'Time', altNames: ['clock', 'timezone', 'set time automatically', 'sync clock'] },
  { name: 'Language & Region', command: 'ms-settings:regionlanguage', area: 'Time', altNames: ['locale', 'display language', 'keyboard layout', 'country'] },
  { name: 'Typing & Autocorrect', command: 'ms-settings:typing', area: 'Time', altNames: ['spell check', 'text suggestions', 'autocorrect'] },
  { name: 'Speech', command: 'ms-settings:speech', area: 'Time', altNames: ['voice recognition', 'tts', 'dictation language'] },

  // 8. Gaming
  { name: 'Game Bar', command: 'ms-settings:gaming-gamebar', area: 'Gaming', altNames: ['xbox game bar', 'overlay', 'win+g', 'record clips'] },
  { name: 'Game Captures', command: 'ms-settings:gaming-gamedvr', area: 'Gaming', altNames: ['dvr', 'record gameplay', 'screenshots folder', 'fps'] },
  { name: 'Game Mode', command: 'ms-settings:gaming-gamemode', area: 'Gaming', altNames: ['optimize pc for games', 'fps boost', 'game performance'] },

  // 9. Accessibility
  { name: 'Text Size', command: 'ms-settings:easeofaccess-display', area: 'Accessibility', altNames: ['make text bigger', 'scaling', 'font size'] },
  { name: 'Visual Effects', command: 'ms-settings:easeofaccess-visualeffects', area: 'Accessibility', altNames: ['animation effects', 'always show scrollbars'] },
  { name: 'Mouse Pointer & Touch', command: 'ms-settings:easeofaccess-mousepointer', area: 'Accessibility', altNames: ['cursor size', 'pointer color', 'touch indicator'] },
  { name: 'Color Filters', command: 'ms-settings:easeofaccess-colorfilter', area: 'Accessibility', altNames: ['color blind', 'grayscale', 'inverted colors'] },
  { name: 'Contrast Themes', command: 'ms-settings:easeofaccess-highcontrast', area: 'Accessibility', altNames: ['high contrast', 'dark high contrast'] },
  { name: 'Narrator', command: 'ms-settings:easeofaccess-narrator', area: 'Accessibility', altNames: ['screen reader', 'voice assistant for blind'] },
  { name: 'Magnifier', command: 'ms-settings:easeofaccess-magnifier', area: 'Accessibility', altNames: ['zoom in', 'screen zoom', 'lens mode'] },

  // 10. Privacy & Security
  { name: 'Windows Security', command: 'ms-settings:windowsdefender', area: 'Privacy', altNames: ['antivirus', 'defender', 'firewall', 'virus threat protection'] },
  { name: 'Find My Device', command: 'ms-settings:findmydevice', area: 'Privacy', altNames: ['location tracking', 'lost laptop', 'locate pc'] },
  { name: 'Device Encryption / BitLocker', command: 'ms-settings:deviceencryption', area: 'Privacy', altNames: ['bitlocker', 'tpm', 'disk encryption', 'security key'] },
  { name: 'App Permissions: Camera', command: 'ms-settings:privacy-webcam', area: 'Privacy', altNames: ['webcam access', 'disable camera for apps'] },
  { name: 'App Permissions: Microphone', command: 'ms-settings:privacy-microphone', area: 'Privacy', altNames: ['mic access', 'disable mic for apps'] },
  { name: 'App Permissions: Location', command: 'ms-settings:privacy-location', area: 'Privacy', altNames: ['gps', 'geolocation', 'map permissions'] },

  // 11. Windows Update
  { name: 'Windows Update', command: 'ms-settings:windowsupdate', area: 'Update', altNames: ['check for updates', 'patch', 'service pack', 'upgrade windows'] },
  { name: 'Update History', command: 'ms-settings:windowsupdate-history', area: 'Update', altNames: ['installed patches', 'kb updates', 'uninstall update'] },
  { name: 'Advanced Update Options', command: 'ms-settings:windowsupdate-options', area: 'Update', altNames: ['pause updates', 'active hours', 'metered updates'] },
  { name: 'Windows Insider Program', command: 'ms-settings:windowsinsider', area: 'Update', altNames: ['beta channel', 'dev channel', 'preview builds'] },

  // 12. Classic Control Panel & MMC Applets (.cpl, .msc)
  { name: 'Device Manager', command: 'devmgmt.msc', area: 'Control Panel', altNames: ['hardware', 'drivers', 'gpu', 'pci', 'sound card', 'usb devices'] },
  { name: 'Disk Management', command: 'diskmgmt.msc', area: 'Control Panel', altNames: ['partition', 'format drive', 'shrink volume', 'create partition'] },
  { name: 'Services Management Console', command: 'services.msc', area: 'Control Panel', altNames: ['daemons', 'background services', 'spooler'] },
  { name: 'Computer Management', command: 'compmgmt.msc', area: 'Control Panel', altNames: ['event viewer', 'disk manager', 'shared folders'] },
  { name: 'Classic Control Panel', command: 'control.exe', area: 'Control Panel', altNames: ['legacy settings', 'all control panel items'] },
  { name: 'Network Connections (ncpa.cpl)', command: 'ncpa.cpl', area: 'Control Panel', altNames: ['adapters', 'change adapter options', 'ip configuration'] },
  { name: 'System Properties (sysdm.cpl)', command: 'sysdm.cpl', area: 'Control Panel', altNames: ['environment variables', 'hardware profiles', 'system protection'] },
  { name: 'Programs and Features (appwiz.cpl)', command: 'appwiz.cpl', area: 'Control Panel', altNames: ['classic uninstall', 'turn windows features on or off'] },
  { name: 'Power Options (powercfg.cpl)', command: 'powercfg.cpl', area: 'Control Panel', altNames: ['choose power buttons', 'high performance plan'] },
  { name: 'Sound Control Panel (mmsys.cpl)', command: 'mmsys.cpl', area: 'Control Panel', altNames: ['recording devices', 'playback devices', 'sound scheme'] },
  { name: 'Internet Options (inetcpl.cpl)', command: 'inetcpl.cpl', area: 'Control Panel', altNames: ['proxy settings', 'certificates', 'tls settings'] },
  { name: 'User Account Control (UserAccountControlSettings.exe)', command: 'UserAccountControlSettings.exe', area: 'Control Panel', altNames: ['uac', 'uac slider', 'admin prompts'] },
  { name: 'Windows Firewall (firewall.cpl)', command: 'firewall.cpl', area: 'Control Panel', altNames: ['inbound rules', 'outbound rules', 'allow app through firewall'] }
];

// Pre-computed token index for sub-millisecond keyword lookups
const TOKEN_INDEX = new Map();

function tokenize(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function buildTokenIndex() {
  TOKEN_INDEX.clear();
  for (let idx = 0; idx < WINDOWS_SETTINGS_CATALOG.length; idx++) {
    const item = WINDOWS_SETTINGS_CATALOG[idx];
    const tokens = new Set([
      ...tokenize(item.name),
      ...tokenize(item.area),
      ...tokenize(item.command),
      ...item.altNames.flatMap(tokenize)
    ]);
    for (const tok of tokens) {
      if (!TOKEN_INDEX.has(tok)) TOKEN_INDEX.set(tok, []);
      TOKEN_INDEX.get(tok).push(idx);
    }
  }
}
buildTokenIndex();

function searchSettings(query) {
  const raw = String(query || '').trim().toLowerCase();
  if (!raw) return WINDOWS_SETTINGS_CATALOG.slice(0, 15);

  const queryTokens = tokenize(raw);
  if (queryTokens.length === 0) return WINDOWS_SETTINGS_CATALOG.slice(0, 15);

  const candidateScores = new Map();

  for (const qTok of queryTokens) {
    // Check exact & prefix token matches from index
    for (const [indexedTok, indices] of TOKEN_INDEX.entries()) {
      if (indexedTok.startsWith(qTok)) {
        const weight = indexedTok === qTok ? 10 : 5;
        for (const idx of indices) {
          candidateScores.set(idx, (candidateScores.get(idx) || 0) + weight);
        }
      }
    }
  }

  // Substring matches on name/command/altNames for non-token matches
  for (let idx = 0; idx < WINDOWS_SETTINGS_CATALOG.length; idx++) {
    const item = WINDOWS_SETTINGS_CATALOG[idx];
    if (item.name.toLowerCase().includes(raw)) {
      candidateScores.set(idx, (candidateScores.get(idx) || 0) + 20);
    } else if (item.command.toLowerCase().includes(raw)) {
      candidateScores.set(idx, (candidateScores.get(idx) || 0) + 15);
    } else if (item.altNames.some((alt) => alt.toLowerCase().includes(raw))) {
      candidateScores.set(idx, (candidateScores.get(idx) || 0) + 12);
    }
  }

  const sorted = Array.from(candidateScores.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([idx]) => WINDOWS_SETTINGS_CATALOG[idx]);

  return sorted.slice(0, 25);
}

function launchSetting(command) {
  if (command.startsWith('ms-settings:')) {
    shell.openExternal(command);
  } else {
    exec(command);
  }
}

function formatSettingItem(item) {
  return {
    id: `win-setting:${item.name.replace(/\s+/g, '-').toLowerCase()}`,
    title: item.name,
    subtitle: `${item.area} • ${item.command}`,
    icon: '⚙️',
    group: 'Windows Settings',
    keywords: [item.name, item.area, item.command, ...item.altNames],
    actions: [
      {
        id: 'open',
        title: `Open ${item.name}`,
        shortcut: '↵',
        run: () => launchSetting(item.command)
      },
      {
        id: 'copy-command',
        title: 'Copy Command URI',
        run: () => {
          try {
            const electron = require('electron');
            if (electron && electron.clipboard && typeof electron.clipboard.writeText === 'function') {
              electron.clipboard.writeText(item.command);
            }
          } catch {}
          return { ok: true, copied: item.command };
        }
      }
    ]
  };
}

module.exports = {
  WINDOWS_SETTINGS_CATALOG,
  searchSettings,
  launchSetting,
  formatSettingItem
};
