'use strict';

const { shell, clipboard } = require('electron');
const store = require('../store');
const audioManager = require('../audio-manager');
const mediaHud = require('../media-hud');
const spotifySearch = require('../spotify-search');
const bluetoothManager = require('../bluetooth-manager');
const { fuzzy, scoreItem } = require('./utils');

function audioSwitcherProvider() {
  function toItem(d, isPrefixed) {
    const isDefaultBadge = d.isDefault ? '✓ Default' : 'Set as default';
    return {
      id: `audio:${d.id}`,
      provider: 'audio',
      group: 'Audio Endpoints',
      title: `${d.name} (${d.type})`,
      subtitle: `${isDefaultBadge} · ${d.id}`,
      keywords: ['audio', 'sound', 'speaker', 'speakers', 'mic', 'microphone', 'headphones', d.name, d.type],
      scoreBoost: isPrefixed ? 260 : 160,
      icon: { kind: 'glyph', name: d.type === 'Recording' ? 'process' : 'app' },
      endpointName: d.name,
      deviceType: d.type,
      isDefault: d.isDefault,
      deviceId: d.id,
      audioData: {
        id: d.id,
        name: d.name,
        type: d.type.toLowerCase(),
        isDefault: d.isDefault
      },
      actions: [
        {
          id: 'set-default',
          title: `Set as Default ${d.type} Device`,
          shortcut: '↵',
          run: () => audioManager.setDefaultDevice(d.id)
        },
        {
          id: 'open-settings',
          title: 'Open Sound Settings',
          shortcut: 'Ctrl+S',
          run: () => audioManager.openSoundSettings()
        },
        {
          id: 'copy-id',
          title: 'Copy Device ID',
          shortcut: 'Ctrl+C',
          run: () => {
            if (clipboard && typeof clipboard.writeText === 'function') {
              clipboard.writeText(d.id);
            }
            return Promise.resolve(d.id);
          }
        }
      ]
    };
  }

  return {
    id: 'audio',
    name: 'Audio Switcher',
    group: 'Audio Endpoints',
    warm: () => audioManager.getDevices(),
    all: () => {
      const cached = audioManager.getCachedEndpoints();
      return [...cached.playback, ...cached.recording].map((d) => toItem(d, false));
    },
    async search(query) {
      const q = String(query || '').trim();
      if (!q) return [];

      const isAudioQuery = /^(?:audio|sound|speaker|speakers|mic|microphone|endpoint|playback|recording):?\s*/i.test(q);
      const devices = isAudioQuery ? await audioManager.getDevices() : audioManager.getCachedEndpoints();
      const allDevs = [...(devices.playback || []), ...(devices.recording || [])];

      if (isAudioQuery) {
        const rest = q.replace(/^(?:audio|sound|speaker|speakers|mic|microphone|endpoint|playback|recording):?\s*/i, '').trim().toLowerCase();
        if (!rest) return allDevs.map((d) => toItem(d, true));
        return allDevs
          .filter((d) => d.name.toLowerCase().includes(rest) || d.type.toLowerCase().includes(rest) || d.id.toLowerCase().includes(rest))
          .map((d) => toItem(d, true));
      }

      if (q.length < 2) return [];

      const cleanQ = q.toLowerCase();
      return allDevs
        .filter((d) => d.name.toLowerCase().includes(cleanQ) || d.type.toLowerCase().includes(cleanQ))
        .map((d) => toItem(d, false));
    }
  };
}

// ============================================================ Windows Services Manager (M2)


function mediaHudProvider() {
  return {
    id: 'media',
    name: 'Now Playing',
    group: 'Now Playing',
    warm: () => mediaHud.getSession(),
    all: () => {
      const s = mediaHud.getCachedSession();
      if (!s || !s.active) return [];
      return [
        {
          id: 'media:now-playing',
          provider: 'media',
          group: 'Now Playing',
          title: `${s.title} — ${s.artist}`,
          subtitle: `${s.album} · ${s.status} · ${s.app}`,
          scoreBoost: 220,
          mediaData: { ...s },
          icon: { kind: 'glyph', name: 'music' },
          actions: [
            { id: 'playpause', title: s.status === 'Playing' ? 'Pause' : 'Play', shortcut: '↵', run: () => mediaHud.playPause() },
            { id: 'next', title: 'Next Track', shortcut: 'Ctrl+Right', run: () => mediaHud.nextTrack() },
            { id: 'prev', title: 'Previous Track', shortcut: 'Ctrl+Left', run: () => mediaHud.prevTrack() },
            { id: 'vol-up', title: 'Volume Up (+10%)', shortcut: 'Ctrl+Up', run: () => mediaHud.adjustVolume(10) },
            { id: 'vol-down', title: 'Volume Down (-10%)', shortcut: 'Ctrl+Down', run: () => mediaHud.adjustVolume(-10) }
          ]
        }
      ];
    },
    search: async (query) => {
      const q = String(query || '').toLowerCase().trim();
      const isMediaKeyword = /^(media|now playing|music|song|track|play|pause|next|prev|spotify)/i.test(q);

      const cached = mediaHud.getCachedSession();
      if (!isMediaKeyword && (!cached || !cached.active)) {
        return [];
      }

      const session = isMediaKeyword ? await mediaHud.getSession() : cached;
      const s = session && session.active ? session : mediaHud.getCachedSession();

      if (!s || !s.active) {
        if (isMediaKeyword) {
          return [
            {
              id: 'media:no-session',
              provider: 'media',
              group: 'Now Playing',
              title: 'No Media Playing',
              subtitle: 'Windows System Media Transport Controls (SMTC) is idle',
              scoreBoost: 200,
              mediaData: { active: false, status: 'No media playing', title: 'No Media Playing', artist: 'Idle', album: '', app: '', volume: 50 },
              icon: { kind: 'glyph', name: 'music' },
              actions: [
                { id: 'refresh', title: 'Check Now Playing', shortcut: '↵', run: () => mediaHud.getSession() }
              ]
            }
          ];
        }
        return [];
      }

      const titleMatch = s.title.toLowerCase().includes(q);
      const artistMatch = s.artist.toLowerCase().includes(q);
      const albumMatch = s.album.toLowerCase().includes(q);

      if (isMediaKeyword || titleMatch || artistMatch || albumMatch) {
        return [
          {
            id: 'media:now-playing',
            provider: 'media',
            group: 'Now Playing',
            title: `${s.title} — ${s.artist}`,
            subtitle: `${s.album} · ${s.status} · ${s.app}`,
            scoreBoost: isMediaKeyword ? 260 : 200,
            mediaData: { ...s },
            icon: { kind: 'glyph', name: 'music' },
            actions: [
              { id: 'playpause', title: s.status === 'Playing' ? 'Pause' : 'Play', shortcut: '↵', run: () => mediaHud.playPause() },
              { id: 'next', title: 'Next Track', shortcut: 'Ctrl+Right', run: () => mediaHud.nextTrack() },
              { id: 'prev', title: 'Previous Track', shortcut: 'Ctrl+Left', run: () => mediaHud.prevTrack() },
              { id: 'vol-up', title: 'Volume Up (+10%)', shortcut: 'Ctrl+Up', run: () => mediaHud.adjustVolume(10) },
              { id: 'vol-down', title: 'Volume Down (-10%)', shortcut: 'Ctrl+Down', run: () => mediaHud.adjustVolume(-10) }
            ]
          }
        ];
      }
      return [];
    }
  };
}


function spotifyProvider() {
  return {
    id: 'spotify',
    name: 'Spotify Music Search',
    all: () => [],
    search: (query) => {
      const q = String(query || '').trim();
      if (!q || !q.toLowerCase().startsWith('spotify ')) return [];
      const term = q.slice(8).trim();
      return spotifySearch.searchSpotify(term);
    }
  };
}


function bluetoothProvider() {
  return {
    id: 'bluetooth',
    name: 'Bluetooth Devices',
    all: async () => {
      const list = await bluetoothManager.getPairedDevices();
      return list.map(bluetoothManager.formatBluetoothItem);
    },
    search: async (query) => {
      const q = String(query || '').trim().toLowerCase();
      if (!q) return [];
      if (q.startsWith('bt') || q.startsWith('bluetooth') || ['headphone', 'earphone', 'airpod', 'buds', 'mouse', 'keyboard'].some((k) => q.includes(k))) {
        return bluetoothManager.searchBluetooth(query);
      }
      return [];
    }
  };
}


module.exports = {
  audioSwitcherProvider,
  mediaHudProvider,
  spotifyProvider,
  bluetoothProvider
};
