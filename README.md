# Rayclone (v2.5.1)

> **AI-Assisted Remake**: Rayclone is an independent, open-source, **AI-assisted clean-room remake** of keyboard-first productivity launchers for Windows, developed collaboratively using Google DeepMind's Antigravity AI assistant.
>
> **Legal & Trademark Notice**: Rayclone is an independent open-source educational project. It is **not** endorsed by, affiliated with, or sponsored by Raycast Technologies Ltd. or Microsoft Corporation. "Raycast" is a registered trademark of Raycast Technologies Ltd. "Windows" and "PowerToys" are registered trademarks of Microsoft Corporation. Rayclone contains zero proprietary code, DLLs, or assets from Raycast; it is built entirely from scratch with an open Electron shell, native Win32 APIs, and clean-room JavaScript.
>
> **Code Signing Notice**: Development release builds are cryptographically signed with an open-source development Authenticode certificate. Windows SmartScreen may show an untrusted publisher notice on new machines until a commercial EV/OV certificate is configured.

---

## 1. Overview & Architecture

Rayclone brings fast, keyboard-first desktop productivity workflows to Windows 10 and 11. Built with an open-source Electron host, zero-transpile Vanilla DOM frontend, and asynchronous Win32/Node.js backend, Rayclone delivers sub-millisecond keyboard navigation, rich typed card previews, and deep Windows OS integration.

* **Shell**: Electron `^44.8.0`, Node.js `v24.12.0`, Windows 10/11 x64.
* **Frontend**: Pure Vanilla DOM, zero framework dependencies, CSS custom property tokens, Inter typography.
* **Backend**: CommonJS modular architecture with context isolation via `preload.js` exposing `window.rayclone`.
* **Fast-Path Action Grammar**: Instant single-character prefix routing (`=`, `$`, `:`, `{`, `<`, `!`, `)`, `>`) for immediate single-provider execution.
* **Built-in Tools**: Background worker thread offloading with watchdog execution timers and sandboxed closure protection.

---

## 2. Universal Action Keyword Grammar

| Prefix | Subsystem | Target Action | Latency (p50) |
|:---:|---|---|:---:|
| **`=`** | Calculator & Math | Evaluate mathematical expressions and currency conversions | **0.02 ms** |
| **`$`** | Windows Settings | Fast search across 86 Windows Settings applets (`ms-settings:`) | **0.14 ms** |
| **`:`** | Windows Registry | Browse hives (`HKCU`, `HKLM`), search keys, and launch `regedit` at LastKey | **137.24 ms** |
| **`{`** | VS Code Workspaces | Query recent projects from `state.vscdb` (WASM `sql.js`, no Python) | **0.01 ms** |
| **`<`** | Window Walker | Enumerate active desktop windows, detect hung windows, bring to front | **9.48 ms** |
| **`!`** | Windows Services | Search, inspect, start, stop, or restart Windows services | **0.06 ms** |
| **`)`** | Deep Diagnostics | Query NICs, hardware chronometrics, or arm UEFI firmware reboot | **0.05 ms** |
| **`>`** | Windows Run Dialog | Execute Windows binaries, `%ENV%` expansion, or run as Administrator | **8.37 ms** |

---

## 3. Shipped Feature Suites

### Core Productivity
* **Applications**: Scans both Start Menu trees (`C:\ProgramData` & `%APPDATA%`) and Store/UWP apps (`Get-StartApps`). Real file icons via `app.getFileIcon`.
* **Calculator & History**: Arithmetic (`200 + 10%`), mathematical functions (`sqrt`, `log`, `sin`), currency conversions (`100 usd to eur`), unit conversions, and Calculator History search (`calc:history`).
* **Clipboard History & Sequential Paste**: De-duplicated 250-entry clipboard ring buffer with sequential paste cycle command (`clip:paste-sequential`).
* **Language Translator**: Translate between 50+ languages with auto language detection, offline phrasebook, and live translation fallbacks.
* **Dictionary & Thesaurus**: Word definitions, IPA phonetic pronunciation, parts of speech, usage examples, synonyms, and antonyms.
* **Focus / Pomodoro Timers**: Configurable focus sessions (25 min, 50 min, custom), breaks, pause/resume/complete states, and daily focus stats.
* **Calendar & Meeting Quick Join**: Next meetings schedule, platform detection (Zoom, Meet, Teams, Webex), and 1-click meeting join.
* **Floating Notes**: Persistent markdown scratchpad (`note: <content>`, search notes, delete with `Ctrl+D`).
* **Snippets**: Dynamic template expansion with `{date}`, `{time}`, `{iso}`, `{uuid}` placeholder replacement.

### Developer Superpowers
* **Port & Socket Inspector**: Search listening ports (`port 3000`), inspect PID and command line via native `netstat`, protected PID 0/4 guards, 1-click process kill.
* **Local Git Repositories Indexer**: Background scan of project directories, active branch detection, dirty worktree status, 1-click launch in VS Code, Windows Terminal, or Explorer.
* **Docker Container Manager**: Daemon status detection, container enumeration, start/stop/restart/view logs actions, offline daemon fallback card.
* **GitHub & GitLab Shortcuts**: Direct query shortcuts (`gh pr`, `gh issue`, `gh repo`, `gl mr`) resolving through local CLI or direct web URLs.
* **Developer Tools**: JSON Formatter/Validator (`json <str>`), Base64 Encode/Decode (`b64e`/`b64d`), Hashes (`sha256`, `md5`, `sha1`), UUID v4 generator, Unix epoch converter (`epoch`).
* **Custom Script Commands**: Hot-reloading script runner supporting PowerShell (`.ps1`), Batch (`.bat`), Python (`.py`), and Node (`.js`).
* **Model Context Protocol (MCP)**: Client supporting Filesystem, Memory Graph, Fetch, and GitHub tools with interactive parameter execution.
* **VS Code Workspaces**: Pure WebAssembly SQLite (`sql.js`) reader querying `state.vscdb` without requiring Python installed on the host machine.
* **WSL Distribution Manager**: Discover and manage Windows Subsystem for Linux distributions (`wsl -l -v`) with UTF-16LE table parsing and two-stage termination safety.

### Windows Native Superpowers
* **Audio Endpoint Switcher**: Enumerate active CoreAudio COM playback and recording endpoints, `IPolicyConfigExact` default device toggle.
* **Windows Services Manager**: Search Windows services (`services: <query>`), inspect service status and startup type, Start/Stop/Restart with elevated UAC staging.
* **Environment Variables Manager**: Query User and System PATH / variables (`env: <var>`), filesystem existence validation, whitespace/quote sanitization.
* **Winget Package Manager Updater**: Search available package upgrades (`winget upgrade`), version diff table parsing, 1-click update command generation.
* **Hosts File Quick Editor**: Parse `C:\Windows\System32\drivers\etc\hosts` with strict IPv4/IPv6 regex, comment exclusion, rule toggling, elevated staging in `%TEMP%`, and `ipconfig /flushdns`.
* **SMTC Media Now Playing HUD**: Windows Media Transport Controls (`GlobalSystemMediaTransportControlsSessionManager`) with Win32 virtual media key fallback (`0xB3`/`0xB0`/`0xB1`).
* **Floating Detached HUD Mode**: Secondary frameless translucent acrylic `BrowserWindow` with `Ctrl+Shift+D` global shortcut, `hud:detach` IPC channel, independent persistence on blur.
* **Parameterized Quicklinks**: Dynamic URL templates (`https://jira.company.com/browse/{ticket}`) with regex placeholders, multi-argument joining, URI encoding.
* **Screen Awareness & OCR**: Native Windows WinRT OCR text extraction on screenshots, screenshot indexer, paste latest capture, visual context dispatch to AI.
* **Window Snapping Engine**: 20+ window layouts (Left/Right/Top/Bottom halves, quarters, thirds, center, maximize, resize) via native Win32 `SetWindowPos`.
* **System Controls (48 Commands)**: Lock, sleep, hibernate, restart, shutdown, empty Recycle Bin, Task Manager, sleep displays, toggle hidden files, toggle taskbar, toggle Wi-Fi, volume presets (0%, 25%, 50%, 75%, 100%), and quit all apps.

---

## 4. Benchmarks & Performance

Reproducible benchmark scripts are included in `tools/bench/`. Measured on Windows 11 x64, Intel/AMD 8-core, Node.js `v24.12.0`:

### Search Latency (`tools/bench/search-latency.mjs`)
* **Unified Omnibox Search (`"note"`)**:
  * p50: **16.66 ms**
  * p95: **178.40 ms**
  * Average: **48.95 ms**
* **Prefix Fast-Paths (200 query median)**:
  * Calculator (`=`): **0.02 ms**
  * Windows Settings (`$`): **0.14 ms**
  * VS Code Workspaces (`{`): **0.01 ms**
  * Windows Services (`!`): **0.06 ms**
  * Windows Run (`>`): **8.37 ms**
  * Window Walker (`<`): **9.48 ms**
  * Windows Registry (`:`): **137.24 ms**

### Settings Indexing (`tools/bench/settings-index.mjs`)
* Catalog Size: **86 Windows Settings applets** with AltNames
* 50 Queries Execution Time: **8.75 ms**
* Average Query Latency: **0.175 ms / query**

### Memory Working Set (`tools/bench/idle-memory.mjs`)
* Initial Process Memory:
  * RSS: **59.11 MB**
  * Heap Used: **8.81 MB**
* Loaded Registry Memory (50+ Active Providers):
  * RSS: **103.54 MB**
  * Heap Used: **32.89 MB**

---

## 5. Keyboard Navigation & Shortcuts

| Shortcut | Action |
|---|---|
| **`Alt+Space`** | Toggle Rayclone window (configurable in Settings) |
| **`Ctrl+K`** | Open Actions Menu popover for the selected item |
| **`Ctrl+,`** | Open Settings & Theme Studio modal |
| **`Ctrl+P`** | Toggle Quick Look / Live Preview pane |
| **`Ctrl+Shift+D`**| Toggle Detached Floating HUD scratchpad window |
| **`↑` / `↓`** | Navigate through search results |
| **`Enter`** | Execute primary action |
| **`Esc`** | Dismiss popover, modal, or hide window |
| **`Ctrl+C`** | Copy primary result or text |
| **`Ctrl+Shift+C`**| Copy file path, URL, or alternate attribute |
| **`Ctrl+Shift+O`**| Reveal item in Windows File Explorer |
| **`Ctrl+D`** | Delete item (note, snippet, contact, or kill process) |
| **`F12`** | Toggle Chromium Developer Tools |

---

## 6. Verification & Test Suite

Rayclone includes a standalone, opaque-box test runner covering all 50+ providers and system integrations:

```bash
# Run the complete test suite (85 suites, 100% pass rate)
node tools/test-suite.mjs

# Run search latency benchmark
node tools/bench/search-latency.mjs

# Run settings indexing benchmark
node tools/bench/settings-index.mjs

# Run working set memory benchmark
node tools/bench/idle-memory.mjs
```

**Verification Policy**:
* **No business-logic mocks**: All module queries, conversions, parsing, and data models execute against real implementation code.
* **Headless fallbacks**: Documented fallbacks exist only for Electron-only desktop APIs (`clipboard`, `dialog`, `shell`) when executing in pure Node.js environments.
* Machine-readable verification results are generated automatically to `tools/test-results.json`.

---

## 7. Building Production Binaries

```bash
# Install dependencies
npm install

# Run in development mode
npm start

# Build production NSIS installer & portable binaries
npm run dist
```

Production artifacts are output to `dist/`:
* `dist/Rayclone-Setup-2.5.1.exe`: NSIS installer with desktop and Start Menu shortcut integration.
* `dist/Rayclone-2.5.1-portable.exe`: Single-file portable executable with zero installation required.

---

## 8. License

MIT License. Copyright (c) 2026 Jay King.
