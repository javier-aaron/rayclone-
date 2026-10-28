'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const store = require('./store');

let electron = null;
try { electron = require('electron'); } catch {}
const shell = electron && electron.shell;

const RETRO_GAMES = [
  { id: 'game-2048', title: '2048', platform: 'Web', genre: 'Puzzle', url: 'https://play2048.co', description: 'Join the numbers and get to the 2048 tile!' },
  { id: 'game-snake', title: 'Google Snake', platform: 'Web', genre: 'Arcade', url: 'https://www.google.com/search?q=play+snake', description: 'Classic retro snake game in your browser' },
  { id: 'game-wordle', title: 'Wordle', platform: 'Web', genre: 'Word', url: 'https://www.nytimes.com/games/wordle/index.html', description: 'Guess the daily 5-letter hidden word' },
  { id: 'game-tetris', title: 'Tetris', platform: 'Web', genre: 'Classic', url: 'https://tetris.com/play-tetris', description: 'The official world-famous block puzzle game' },
  { id: 'game-minesweeper', title: 'Minesweeper', platform: 'Web', genre: 'Logic', url: 'https://minesweeperonline.com', description: 'Classic retro Windows minesweeper' }
];

let cachedInstalledGames = [];
let lastScan = 0;

function scanSteamGames() {
  const games = [];
  const steamPaths = [
    'C:\\Program Files (x86)\\Steam\\steamapps',
    'C:\\Program Files\\Steam\\steamapps',
    'D:\\SteamLibrary\\steamapps',
    'E:\\SteamLibrary\\steamapps'
  ];

  for (const sp of steamPaths) {
    if (!fs.existsSync(sp)) continue;
    try {
      const files = fs.readdirSync(sp);
      for (const f of files) {
        if (!f.startsWith('appmanifest_') || !f.endsWith('.acf')) continue;
        try {
          const content = fs.readFileSync(path.join(sp, f), 'utf8');
          const nameMatch = content.match(/"name"\s+"([^"]+)"/i);
          const appIdMatch = content.match(/"appid"\s+"([^"]+)"/i);
          if (nameMatch && appIdMatch) {
            const title = nameMatch[1];
            const appId = appIdMatch[1];
            // Skip Steamworks redistributables
            if (title.includes('Steamworks') || title.includes('Proton')) continue;
            games.push({
              id: `steam-${appId}`,
              title,
              platform: 'Steam',
              appId,
              genre: 'PC Game',
              launchUrl: `steam://rungameid/${appId}`,
              description: `Steam Game (AppID: ${appId})`
            });
          }
        } catch {}
      }
    } catch {}
  }
  return games;
}

function scanEpicGames() {
  const games = [];
  const manifestDir = 'C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests';
  if (fs.existsSync(manifestDir)) {
    try {
      const files = fs.readdirSync(manifestDir);
      for (const f of files) {
        if (!f.endsWith('.item')) continue;
        try {
          const data = JSON.parse(fs.readFileSync(path.join(manifestDir, f), 'utf8'));
          if (data && data.DisplayName && data.AppName) {
            games.push({
              id: `epic-${data.AppName}`,
              title: data.DisplayName,
              platform: 'Epic Games',
              appId: data.AppName,
              genre: 'PC Game',
              launchUrl: `com.epicgames.launcher://apps/${data.AppName}?action=launch&silent=true`,
              description: `Epic Games Store Title (${data.InstallationList?.[0] || 'Installed'})`
            });
          }
        } catch {}
      }
    } catch {}
  }
  return games;
}

function getInstalledGames() {
  if (Date.now() - lastScan < 60000 && cachedInstalledGames.length > 0) {
    return cachedInstalledGames;
  }

  const list = [];
  try {
    list.push(...scanSteamGames());
    list.push(...scanEpicGames());
  } catch {}

  // Common popular platform launchers
  const commonLaunchers = [
    { id: 'steam-client', title: 'Steam', platform: 'Valve', genre: 'Game Store', launchUrl: 'steam://open/main', description: 'Steam Gaming Platform & Library' },
    { id: 'epic-client', title: 'Epic Games Launcher', platform: 'Epic Games', genre: 'Game Store', launchUrl: 'com.epicgames.launcher://', description: 'Epic Games Store & Library' },
    { id: 'xbox-app', title: 'Xbox App', platform: 'Microsoft', genre: 'Game Pass', launchUrl: 'ms-windows-store://pdp/?productid=9MV0B5HZVK9Z', description: 'Xbox Game Pass and PC games hub' },
    { id: 'riot-client', title: 'Riot Client', platform: 'Riot Games', genre: 'Game Launcher', launchUrl: 'riotclient://', description: 'Valorant and League of Legends launcher' },
    { id: 'battlenet', title: 'Battle.net', platform: 'Blizzard', genre: 'Game Launcher', launchUrl: 'battlenet://', description: 'Blizzard Battle.net launcher' }
  ];

  for (const cl of commonLaunchers) {
    if (!list.some((g) => g.title.toLowerCase() === cl.title.toLowerCase())) {
      list.push(cl);
    }
  }

  cachedInstalledGames = list;
  lastScan = Date.now();
  return list;
}

function searchGames(query) {
  const q = String(query || '').trim().toLowerCase();
  const installed = getInstalledGames();
  const all = [...installed, ...RETRO_GAMES];
  if (!q || q === 'game' || q === 'games' || q === 'retro' || q === 'play') return all.slice(0, 16);

  const stem = q.endsWith('s') && q.length > 3 ? q.slice(0, -1) : q;
  return all.filter((g) => {
    const t = g.title.toLowerCase();
    const p = g.platform.toLowerCase();
    const gen = (g.genre || '').toLowerCase();
    const d = (g.description || '').toLowerCase();
    return t.includes(q) || t.includes(stem)
      || p.includes(q) || p.includes(stem)
      || gen.includes(q) || gen.includes(stem)
      || d.includes(q) || d.includes(stem);
  });
}

function launchGame(game) {
  if (!game) return { ok: false, error: 'No game specified' };
  const target = game.launchUrl || game.url;
  if (!target) return { ok: false, error: 'No launch target' };

  if (shell && typeof shell.openExternal === 'function') {
    shell.openExternal(target);
    return { ok: true, launched: game.title, url: target };
  }

  spawn('cmd.exe', ['/c', 'start', '""', target], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  }).unref();

  return { ok: true, launched: game.title, url: target };
}

module.exports = {
  RETRO_GAMES,
  getInstalledGames,
  searchGames,
  launchGame
};
