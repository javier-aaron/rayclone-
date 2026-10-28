'use strict';

const { spawn } = require('node:child_process');
const path = require('node:path');

const SNAP_SCRIPT = path.join(__dirname, 'snap.ps1');

function sendVbKey(charCode) {
  spawn('mshta', [`vbscript:Execute("CreateObject(""WScript.Shell"").SendKeys(chr(${charCode})):close")`], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  }).unref();
}

function snapWindow(action) {
  spawn('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy', 'Bypass',
    '-File', SNAP_SCRIPT,
    '-action', action
  ], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  }).unref();
}

function runPsCommand(psScript) {
  spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psScript], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  }).unref();
}

function toggleDarkTheme() {
  const ps = `
    $key = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize"
    $cur = (Get-ItemProperty -Path $key -Name AppsUseLightTheme).AppsUseLightTheme
    $new = if ($cur -eq 1) { 0 } else { 1 }
    Set-ItemProperty -Path $key -Name AppsUseLightTheme -Value $new
    Set-ItemProperty -Path $key -Name SystemUsesLightTheme -Value $new
  `;
  runPsCommand(ps);
}

function toggleHiddenFiles() {
  const ps = `
    $key = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced"
    $cur = (Get-ItemProperty -Path $key -Name Hidden).Hidden
    $new = if ($cur -eq 1) { 2 } else { 1 }
    Set-ItemProperty -Path $key -Name Hidden -Value $new
    # Broadcast setting change to explorer windows without terminating process
    $shell = New-Object -ComObject Shell.Application
    $windows = $shell.Windows()
    for ($i = 0; $i -lt $windows.Count; $i++) {
        try { $windows.Item($i).Refresh() } catch {}
    }
  `;
  runPsCommand(ps);
}

function sleepDisplays() {
  const ps = `
    Add-Type -TypeDefinition @"
    using System;
    using System.Runtime.InteropServices;
    public class Pwr {
        [DllImport("user32.dll")]
        public static extern int SendMessage(int hWnd, int hMsg, int wParam, int lParam);
    }
"@
    [Pwr]::SendMessage(0xffff, 0x0112, 0xf170, 2)
  `;
  runPsCommand(ps);
}

function showDesktop() {
  const ps = `(New-Object -ComObject Shell.Application).ToggleDesktop()`;
  runPsCommand(ps);
}

function setVolumeLevel(percent) {
  // Use Windows AudioEndpointVolume or simulate keystrokes
  // Volume mute = 0%
  if (percent === 0) {
    sendVbKey(173); // Mute
    return;
  }
  // Otherwise set via PowerShell audio endpoint
  const ps = `
    Add-Type -TypeDefinition @"
    using System.Runtime.InteropServices;
    [Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioEndpointVolume {
        int f(); int g(); int h(); int j();
        int SetMasterVolumeLevelScalar(float fLevel, System.Guid pguidEventContext);
    }
    [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDevice {
        int Activate(ref System.Guid id, int clsCtx, int a, out IAudioEndpointVolume aev);
    }
    [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDeviceEnumerator {
        int f();
        int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint);
    }
    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDevEnum {}
    public class Audio {
        public static void SetVolume(float val) {
            var enumerator = new MMDevEnum() as IMMDeviceEnumerator;
            IMMDevice dev;
            enumerator.GetDefaultAudioEndpoint(0, 1, out dev);
            var iid = typeof(IAudioEndpointVolume).GUID;
            IAudioEndpointVolume epv;
            dev.Activate(ref iid, 23, 0, out epv);
            epv.SetMasterVolumeLevelScalar(val, System.Guid.Empty);
        }
    }
"@ -ErrorAction SilentlyContinue
    [Audio]::SetVolume(${percent / 100})
  `;
  runPsCommand(ps);
}

function toggleWifi() {
  const ps = `
    $adapter = Get-NetAdapter | Where-Object { $_.InterfaceDescription -match "Wi-Fi|Wireless|802.11" -or $_.Name -match "Wi-Fi" } | Select-Object -First 1
    if ($adapter) {
      if ($adapter.Status -eq "Up") {
        Disable-NetAdapter -Name $adapter.Name -Confirm:$false
      } else {
        Enable-NetAdapter -Name $adapter.Name -Confirm:$false
      }
    }
  `;
  runPsCommand(ps);
}

function hibernate() {
  spawn('shutdown', ['/h'], { detached: true, stdio: 'ignore', windowsHide: false }).unref();
}

function quitAllApplications() {
  const ps = `
    $curPid = $PID
    Get-Process | Where-Object {
        $_.MainWindowHandle -ne 0 -and
        $_.ProcessName -notmatch "explorer|rayclone|electron"
    } | ForEach-Object { $_.CloseMainWindow() }
  `;
  runPsCommand(ps);
}

function uninstallApplications() {
  spawn('cmd.exe', ['/c', 'start', '""', 'ms-settings:appsfeatures'], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  }).unref();
}

function exportData(targetPath = null) {
  const fs = require('node:fs');
  const os = require('node:os');
  const store = require('./store');
  const dest = targetPath || path.join(os.homedir(), 'Downloads', `rayclone-backup-${new Date().toISOString().slice(0, 10)}.json`);
  const data = {
    version: '2.1.0',
    exportedAt: new Date().toISOString(),
    notes: store.read('notes_list', []),
    snippets: store.read('snippets_list', []),
    settings: store.read('settings', {}),
    focus_stats: store.read('focus_stats', {}),
    run_aliases: store.read('run_aliases', {}),
    dictation_history: store.read('dictation_history', [])
  };
  fs.writeFileSync(dest, JSON.stringify(data, null, 2), 'utf8');
  return { ok: true, path: dest };
}

function importData(sourcePath) {
  const fs = require('node:fs');
  const store = require('./store');
  if (!sourcePath || !fs.existsSync(sourcePath)) return { ok: false, error: 'File not found' };
  try {
    const raw = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
    if (raw.notes) store.write('notes_list', raw.notes);
    if (raw.snippets) store.write('snippets_list', raw.snippets);
    if (raw.settings) store.write('settings', raw.settings);
    if (raw.focus_stats) store.write('focus_stats', raw.focus_stats);
    if (raw.run_aliases) store.write('run_aliases', raw.run_aliases);
    if (raw.dictation_history) store.write('dictation_history', raw.dictation_history);
    store.flush();
    return { ok: true, imported: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = {
  // Volume & Audio
  volumeUp: () => sendVbKey(175),
  volumeDown: () => sendVbKey(174),
  volumeMute: () => sendVbKey(173),
  mediaPlayPause: () => sendVbKey(179),
  mediaNext: () => sendVbKey(176),
  mediaPrev: () => sendVbKey(177),
  setVolumeLevel,

  // Window Management Suite
  snapLeft: () => snapWindow('left-half'),
  snapRight: () => snapWindow('right-half'),
  snapTop: () => snapWindow('top-half'),
  snapBottom: () => snapWindow('bottom-half'),
  snapMaximize: () => snapWindow('maximize'),
  snapAlmostMaximize: () => snapWindow('almost-maximize'),
  snapMinimize: () => snapWindow('minimize'),
  snapCenter: () => snapWindow('center'),

  snapTopLeft: () => snapWindow('top-left'),
  snapTopRight: () => snapWindow('top-right'),
  snapBottomLeft: () => snapWindow('bottom-left'),
  snapBottomRight: () => snapWindow('bottom-right'),

  snapFirstThird: () => snapWindow('first-third'),
  snapCenterThird: () => snapWindow('center-third'),
  snapLastThird: () => snapWindow('last-third'),
  snapFirstTwoThirds: () => snapWindow('first-two-thirds'),
  snapLastTwoThirds: () => snapWindow('last-two-thirds'),

  snapMakeLarger: () => snapWindow('make-larger'),
  snapMakeSmaller: () => snapWindow('make-smaller'),

  // System actions
  toggleDarkTheme,
  toggleHiddenFiles,
  sleepDisplays,
  showDesktop,
  toggleWifi,
  hibernate,
  quitAllApplications,
  toggleTaskbar: () => snapWindow('toggle-taskbar'),
  uninstallApplications,
  exportData,
  importData
};
