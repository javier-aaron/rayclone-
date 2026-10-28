# Project: Rayclone Beyond-Raycast Power User Extension Suite

## Architecture
- **Host Platform**: Windows 10/11 x64, Electron `^44.8.0`, Node.js `v24.12.0`.
- **Packaging**: `electron-builder ^26.15.3` producing NSIS installer and portable executables into `dist/`.
- **Frontend Architecture**: Pure Vanilla DOM (zero-bundle, zero-transpile), semantic HTML/CSS design tokens faithfully matching Raycast.
- **Backend Architecture**: CommonJS in `src/main/` with strict context isolation via `src/preload/preload.js` exposing `window.rayclone`.
- **Provider Registry**: `src/main/providers.js` with `createRegistry()`, 3-tier prefix parsing, fuzzy matching, and frecency ranking.
- **Preview System**: `src/main/preview.js` providing rich typed card models (Quick Look) rendered in two-column launcher view.
- **HUD Mode Architecture**: Secondary detached borderless `BrowserWindow` (`hudWin`) for persistent floating desktop widgets.
- **Test Infrastructure**: Standalone headless runner in `tools/test-suite.mjs` with sandboxed storage under `.cache/test-verify-*`.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Port & Socket Inspector ("Kill Port") | Search listening ports (`port 3000`), inspect PID and process command line, 1-click terminate process | M1 | ORIGINAL_REQUEST §R1 |
| 2 | Local Git Repositories Indexer | Auto-detect `.git` directories across user projects, branch, dirty worktree status, 1-click open in VS Code, Terminal, Explorer | M1 | ORIGINAL_REQUEST §R1 |
| 3 | Docker & Container Manager | Enumerate Docker containers, status (running/stopped), ports, with start/stop/restart/logs actions | M1 | ORIGINAL_REQUEST §R1 |
| 4 | GitHub / GitLab Shortcuts | Rapid query shortcuts (`gh pr`, `gh issue`, `gh repo`, `glab mr`) resolving through CLI or web links | M1 | ORIGINAL_REQUEST §R1 |
| 5 | Audio Output & Mic Device Switcher | Query active playback and recording endpoints, 1-click default device toggle | M2 | ORIGINAL_REQUEST §R2 |
| 6 | Windows Services Manager | Search Windows services (`services: <query>`), inspect status and startup type, Start, Stop, Restart actions | M2 | ORIGINAL_REQUEST §R2 |
| 7 | Environment Variables Manager | Query User and System PATH / variables (`env: <var>`) with path existence validation | M2 | ORIGINAL_REQUEST §R2 |
| 8 | Package Manager Updater (`winget`) | Query available updates (`winget upgrade`), displaying version diffs and 1-click update commands | M2 | ORIGINAL_REQUEST §R2 |
| 9 | Hosts File Quick Editor | View and toggle IP-to-domain rules in `C:\Windows\System32\drivers\etc\hosts` | M2 | ORIGINAL_REQUEST §R2 |
| 10 | SMTC / Media Now Playing HUD | Live track info, artist, album thumbnail, and volume controls in Quick Look preview panel | M3 | ORIGINAL_REQUEST §R3 |
| 11 | Floating Detached Scratchpad / HUD Mode | Pin notes, conversions, or preview cards as compact, translucent always-on-top desktop widget (`Ctrl+Shift+D`) | M3 | ORIGINAL_REQUEST §R3 |
| 12 | Parameterized Quicklinks | Support dynamic templates (`https://jira.company.com/browse/{ticket}`) with inline parameter capture | M3 | ORIGINAL_REQUEST §R3 |
| 13 | Version Bump to 2.2.0 | Update version in `package.json` to `2.2.0` | M4 | ORIGINAL_REQUEST §R4 |
| 14 | 100% Test Suite Verification | Ensure all existing 27 feature suites and new power extensions pass in `tools/test-suite.mjs` | E2E & M4 | ORIGINAL_REQUEST §R4 |
| 15 | Production Distribution Packaging | Rebuild `dist/Rayclone-Setup-2.2.0.exe` and `dist/Rayclone-2.2.0-portable.exe` | M4 | ORIGINAL_REQUEST §R4 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| E2E | E2E Testing Suite Track | Comprehensive opaque-box test suite (Tiers 1-4) covering all features R1–R4, creating `TEST_READY.md` | none | DONE |
| M1 | Developer Tooling Suite (R1) | Implement Port Inspector, Git Repositories Indexer, Docker Manager, and GitHub/GitLab Shortcuts | none | DONE |
| M2 | Windows Superpower Management (R2) | Implement Audio Switcher, Services Manager, Env Vars Manager, Winget Updater, and Hosts Editor | M1 | DONE |
| M3 | Media & Desktop Experience Innovations (R3) | Implement SMTC Now Playing HUD, Floating Detached Scratchpad (`Ctrl+Shift+D`), and Parameterized Quicklinks | M2 | DONE |
| M4 | Final Integration, 100% Test Pass & Distribution (R4) | Phase 1: 100% E2E test pass (Tiers 1-4); Phase 2: Adversarial coverage hardening (Tier 5); Phase 3: Version bump to 2.2.0 & production binary build (`dist/Rayclone-Setup-2.2.0.exe` & `dist/Rayclone-2.2.0-portable.exe`) | M1, M2, M3, E2E | DONE |

## Code Layout
```
src/
├── main/
│   ├── main.js                   # Application lifecycle, BrowserWindow, IPC handlers, HUD window
│   ├── providers.js              # Central provider registry, fuzzy scoring, frecency, prefix routing
│   ├── preview.js                # Quick Look preview card generator
│   ├── store.js                  # Persistent JSON storage in userData
│   ├── settings.js               # User settings
│   ├── port-inspector.js         # [M1] Port & Socket Inspector (netstat, taskkill)
│   ├── git-indexer.js            # [M1] Local Git Repositories Indexer (.git scan, branch, dirty status)
│   ├── docker-manager.js         # [M1] Docker & Container Manager (docker ps, start/stop/restart/logs)
│   ├── github-shortcuts.js       # [M1] GitHub / GitLab Shortcuts (CLI / web links)
│   ├── audio-manager.js          # [M2] Audio Output & Microphone Switcher (CoreAudio COM)
│   ├── audio-helper.ps1          # [M2] Audio COM helper script
│   ├── services-manager.js       # [M2] Windows Services Manager (Get-Service, Start/Stop/Restart)
│   ├── env-manager.js            # [M2] Environment Variables Manager (User/System env, path validation)
│   ├── winget-manager.js         # [M2] Winget Package Updater (winget upgrade, version diffs)
│   ├── hosts-editor.js           # [M2] Hosts File Editor (parse, toggle, UAC elevated stage)
│   ├── media-hud.js              # [M3] SMTC / Media Now Playing HUD (WinRT SMTC session, transport keys)
│   ├── media-helper.ps1          # [M3] WinRT SMTC session probe script
│   ├── hud-window.js             # [M3] Floating Detached Scratchpad / HUD Mode window manager
│   ├── quicklinks-manager.js     # [M3] Parameterized Quicklinks template engine
│   └── ... (existing modules)
├── preload/
│   └── preload.js                # Context bridge exposing window.rayclone
├── renderer/
│   ├── index.html                # Launcher DOM + Detached HUD DOM
│   ├── renderer.js               # UI controller, preview renderer, shortcuts
│   └── styles.css                # Visual design tokens and HUD styles
tools/
├── test-suite.mjs                # Comprehensive test suite covering all 27+ feature suites
└── ...
dist/
├── Rayclone-Setup-2.2.0.exe      # [M4] NSIS Installer binary
└── Rayclone-2.2.0-portable.exe   # [M4] Portable single-file binary
```

## Interface Contracts

### 1. Provider Contract (`src/main/providers.js`)
```typescript
interface ProviderItem {
  id: string;                     // Unique item ID, e.g. 'port:3000', 'git:rayclone', 'service:wuauserv'
  provider: string;               // Provider identifier
  group: string;                  // Display group, e.g. 'Developer Tools', 'Windows Services'
  title: string;                  // Primary label
  subtitle?: string;              // Secondary info
  scoreBoost?: number;            // Match boost
  keywords?: string[];            // Extra matching tokens
  icon?: { kind: 'glyph' | 'data' | 'file', name?: string, value?: string, path?: string };
  actions: Array<{
    id: string;
    title: string;
    shortcut?: string;
    run: () => Promise<any> | any;
  }>;
  // Metadata fields forwarded to preview.js:
  portData?: { port: number, pid: number, processName: string, commandLine: string };
  gitData?: { path: string, branch: string, dirty: boolean, dirtyCount: number };
  dockerData?: { id: string, name: string, image: string, status: string, ports: string };
  serviceData?: { name: string, displayName: string, status: string, startType: string };
  audioData?: { id: string, name: string, type: 'playback' | 'recording', isDefault: boolean };
  envData?: { name: string, value: string, scope: 'User' | 'Machine', isValidPath?: boolean };
  wingetData?: { id: string, name: string, currentVersion: string, availableVersion: string };
  hostsData?: { ip: string, domain: string, enabled: boolean, comment?: string };
  mediaData?: { title: string, artist: string, album: string, status: string, app: string };
}
```

### 2. Preview Contract (`src/main/preview.js`)
`getPreviewForItem(item)` returns discriminated union objects:
- `type: 'port'` -> `{ port, pid, processName, commandLine, state }`
- `type: 'git'` -> `{ name, path, branch, dirty, dirtyCount, lastCommit }`
- `type: 'docker'` -> `{ id, name, image, status, ports, state }`
- `type: 'service'` -> `{ name, displayName, status, startType }`
- `type: 'audio'` -> `{ id, name, kind, isDefault }`
- `type: 'env'` -> `{ name, value, scope, paths: Array<{ path, exists }> }`
- `type: 'winget'` -> `{ id, name, version, availableVersion }`
- `type: 'hosts'` -> `{ ip, domain, enabled, comment }`
- `type: 'media'` -> `{ title, artist, album, status, app, volume }`

### 3. IPC & Window Contracts (`src/main/main.js` & `src/preload/preload.js`)
- `hud:detach`: Renderer -> Main: detaches the active item / scratchpad into the floating HUD window.
- Shortcut `Ctrl+Shift+D`: Toggles HUD scratchpad mode.
- Hotkey and Settings IPC interfaces remain backward-compatible.
