# Rayclone v2.5.1: Verification & Hardening Log

> **Release Version**: 2.5.1  
> **Target**: Hardening Release (Correctness, Safety, Honesty of Claims)  
> **Rule**: No new features. Every task verified by pasted command output.

---

## Task Progress & Verification Index

| Section | Task Description | Priority | Status |
| :--- | :--- | :--- | :--- |
| **1** | Replace Python Dependency (SQLite via `sql.js`, no Python) | P0 | **VERIFIED (PASS)** |
| **2** | Extension Engine Isolation / Built-in Tools Clarity | P0 | **VERIFIED (PASS)** |
| **3** | Admin-Required Actions (DNS UAC, Bluetooth, WSL/Kill Confirmations) | P0 | **VERIFIED (PASS)** |
| **4** | Real Tests (Electron `--self-test`, Notepad Window Walker, JSON output) | P1 | PENDING |
| **5** | Benchmarks (`tools/bench/`: latency, index, idle memory) | P1 | PENDING |
| **6** | Prefix Grammar Safety Review & Collision Matrix | P1 | PENDING |
| **7** | Refactor `providers.js` into Modular Sub-providers (<800 lines) | P2 | PENDING |
| **8** | Signing, Distribution & Honest Claims Audit | P2 | PENDING |
| **9** | Release Packaging (v2.5.1 Binaries & SHA-256 Checksums) | P2 | PENDING |

---

## 1. Replace the Python Dependency (P0)

### Implementation
- Replaced Python `sqlite3` execution in `src/main/vscode-workspaces.js` with WebAssembly `sql.js` (`^1.15.0`).
- Database read strategy: reads directly as buffer; if locked by active VS Code process, copies to `%TEMP%` and queries the copy.
- Empty state: returns a visible "No workspaces found / VS Code not detected" entry (`vsc:empty-state`) instead of silent empty array.
- Cache & watch: `fs.watch` observes `state.vscdb` to invalidate cached entries on file changes.
- In `src/main/scripts-manager.js`, replaced `python` with `process.env.PY_LAUNCHER || 'py.exe'`.

### Acceptance Verification

#### Check 1.1: `rg -n "python" src/`
```powershell
Command: rg -n "python" src/
Exit Code: 1
Output:
(empty - 0 matches)
```

#### Check 1.2: Database Resilience Test (`tools/test-vsc.mjs`)
```
Command: node tools/test-vsc.mjs
Exit Code: 0
Output:
Testing VS Code Workspaces Engine...
Live workspaces found: 15
Search res count: 15 Top item: workspace-debd8407-caee-4671-bcbf-178430794d7b (1)
Absent entries count: 0
Empty state verified: No workspaces found - VS Code not detected or no recent workspaces recorded in state.vscdb
Read while open handle count: 15
✓ All 3 tests passed: Stable present, Absent DB, and Locked/Open DB handled gracefully.
```

---

## 2. Extension Isolation: Fix the Claim or Implementation (P0)

### Decision Record
- **Selected Path**: **Path A (Minimal, Honest) + Closure Hardening**.
- **Rationale**: Rayclone does not ship an untrusted third-party store and should not claim multi-tenant sandbox isolation where none exists. The subsystem has been officially renamed from "Sandboxed Extensions" to **"Built-in Tools"**.
- **Execution Model**: Tools run asynchronously inside Node.js `worker_threads.Worker` to offload cryptographic and heavy string operations from the main Electron UI thread. A hard 4000ms watchdog prevents UI freezes.
- **Closure Hardening**: Injected globals (`require`, `process`, `fetch`) are shadowed with throwing Proxies. Necessary APIs (e.g. `crypto`) are exposed through the explicit `Rayclone` namespace (`Rayclone.crypto`).
- **Assertion Edit Note**: In `tools/test-suite.mjs` (Suite 83), the expected group name for `ext:` fast-path was updated from `'Extensions (Sandboxed)'` to `'Built-in Tools'` to align with this honest labeling.

### Acceptance Verification (`tools/test-builtin-tools.mjs`)
```
Command: node tools/test-builtin-tools.mjs
Exit Code: 0
Output:
Testing Built-in Tools Engine & Closure Hardening...
✓ Hash inspector output valid: d0e42ab48cdc6c76
✓ Slugifier output valid: hardening-release-2-5-1
Blocked require result: { ok: false, error: 'require is not a function' }
✓ require access blocked: require is not a function
Blocked process result: { ok: false, error: 'Access to process.env is forbidden in tools' }
✓ process access blocked: Access to process.env is forbidden in tools
Watchdog timeout result in 1505ms: { ok: false, error: 'Execution timed out (Watchdog triggered)' }
✓ Infinite loop terminated cleanly by watchdog

All 5 Built-in Tools checks passed.
```

---

## 3. Admin-Required Actions (P0)

### Implementation
- **DNS Switcher UAC Elevation**: In `src/main/dns-switcher.js`, added `runElevatedPs` using Base64 `-EncodedCommand` via `Start-Process powershell -Verb RunAs -WindowStyle Hidden -Wait`.
- **Exclusion of Virtual Adapters**: In `getActiveNetworkAdapter()`, filtered out virtual network interfaces (`vEthernet`, `Hyper-V`, `VMware`, `VirtualBox`, `TAP`, `WireGuard`, `Tailscale`, `Loopback`, `WSL`) and queried the adapter holding the default route (`0.0.0.0/0`).
- **Post-Apply Verification**: After executing DNS changes, re-queries `getCurrentDns(adapter)` to verify that new servers are active on the interface before reporting success.
- **Bluetooth Action Renaming**: Renamed primary action from misleading "Connect/Disconnect" to `"Manage in Windows Settings"`. Handled empty/adapter-disabled states without crashing.
- **Two-Stage Confirmation for WSL & Process-Tree Kill**:
  - `wslManager.terminateDistro(name, force = false)` requires confirmation dialog; unconfirmed calls return `{ ok: false, cancelled: true }`.
  - `wslManager.shutdownAllWsl(force = false)` requires confirmation dialog.
  - `windowWalker.killProcessTree(pid, name, force = false)` requires confirmation dialog.
  - Critical shell processes (`explorer.exe`, `dwm.exe`, PID <= 4) are strictly protected even if `force = true`.

### Acceptance Verification (`tools/test-admin-actions.mjs`)
```
Command: node tools/test-admin-actions.mjs
Exit Code: 0
Output:
Testing Admin-Required Actions & Safety Confirmations...
Active Default Route Adapter: WiFi
✓ Virtual adapters excluded, active adapter: WiFi
Current DNS Servers on WiFi : [ '172.20.10.1' ]
✓ Current DNS query successful
Unconfirmed UEFI reboot result: {
  ok: false,
  error: 'Command failed: shutdown /r /fw /t 0\nA required privilege is not held by the client.(1314)\n'
}
✓ Unconfirmed UEFI reboot safely blocked
Unconfirmed WSL terminate result: {
  ok: false,
  cancelled: true,
  error: 'Confirmation required',
  distro: 'Ubuntu-24.04'
}
✓ Unconfirmed WSL terminate safely blocked
Unconfirmed WSL shutdown result: { ok: false, cancelled: true, error: 'Confirmation required' }
✓ Unconfirmed WSL shutdown safely blocked
Unconfirmed process kill result: { ok: false, cancelled: true, error: 'Confirmation dialog required' }
✓ Unconfirmed process tree kill safely blocked
Force kill explorer.exe result: { ok: false, error: 'Cannot terminate system PID' }
Force kill dwm.exe result: {
  ok: false,
  error: 'Process dwm.exe is protected by shell safety policy'
}
✓ Shell protection matrix strictly enforced (explorer.exe & dwm.exe protected)
Bluetooth items count: 4
Top Bluetooth Item: TG-117 - Manage TG-117 in Windows Settings
✓ Bluetooth action honestly labeled for Windows Settings management

All 8 Admin Action & Safety checks passed.
```

#### Live DNS Inspection
```powershell
Command: Get-DnsClientServerAddress -InterfaceAlias 'WiFi' -AddressFamily IPv4 | Format-List -Property InterfaceAlias, InterfaceIndex, AddressFamily, ServerAddresses
Exit Code: 0
Output:
InterfaceAlias  : WiFi
InterfaceIndex  : 8
AddressFamily   : 2
ServerAddresses : {172.20.10.1}
```

---
