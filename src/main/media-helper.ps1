param(
    [string]$Action = "query",
    [int]$Volume = -1
)

$ErrorActionPreference = 'SilentlyContinue'

# Key simulator fallback for media transport keys
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public class MediaKeySimulator {
    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

    public static void PressKey(byte vk) {
        keybd_event(vk, 0, 0, UIntPtr.Zero);
        keybd_event(vk, 0, 2, UIntPtr.Zero); // KEYEVENTF_KEYUP = 0x0002
    }
}
"@ -ErrorAction SilentlyContinue

function Send-MediaKey([byte]$vk) {
    try {
        [MediaKeySimulator]::PressKey($vk)
    } catch {}
}

$asTaskMethod = $null
try {
    # Load Windows.Media WinRT types and runtime extensions
    Add-Type -AssemblyName System.Runtime.WindowsRuntime -ErrorAction SilentlyContinue
    $null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media, ContentType = WindowsRuntime]
    $null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionPlaybackStatus, Windows.Media, ContentType = WindowsRuntime]

    $asTaskMethod = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
        $_.Name -eq 'AsTask' -and $_.IsGenericMethodDefinition
    } | Select-Object -First 1
} catch {}

function Await-WinRt($asyncOp, [type]$resType) {
    if (-not $asyncOp -or -not $asTaskMethod) { return $null }
    try {
        $closed = $asTaskMethod.MakeGenericMethod($resType)
        $task = $closed.Invoke($null, @($asyncOp))
        return $task.GetAwaiter().GetResult()
    } catch {
        return $null
    }
}

if ($Action -eq "playpause") {
    $handled = $false
    if ($asTaskMethod) {
        try {
            $asyncOp = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()
            $mgr = Await-WinRt $asyncOp ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
            if ($mgr) {
                $session = $mgr.GetCurrentSession()
                if ($session) {
                    $handled = Await-WinRt ($session.TryTogglePlayPauseAsync()) ([bool])
                }
            }
        } catch {}
    }
    if (-not $handled) {
        Send-MediaKey 0xB3 # VK_MEDIA_PLAY_PAUSE (179)
    }
    Write-Output "OK"
    exit 0
}
elseif ($Action -eq "next") {
    $handled = $false
    if ($asTaskMethod) {
        try {
            $asyncOp = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()
            $mgr = Await-WinRt $asyncOp ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
            if ($mgr) {
                $session = $mgr.GetCurrentSession()
                if ($session) {
                    $handled = Await-WinRt ($session.TrySkipNextAsync()) ([bool])
                }
            }
        } catch {}
    }
    if (-not $handled) {
        Send-MediaKey 0xB0 # VK_MEDIA_NEXT_TRACK (176)
    }
    Write-Output "OK"
    exit 0
}
elseif ($Action -eq "prev") {
    $handled = $false
    if ($asTaskMethod) {
        try {
            $asyncOp = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()
            $mgr = Await-WinRt $asyncOp ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
            if ($mgr) {
                $session = $mgr.GetCurrentSession()
                if ($session) {
                    $handled = Await-WinRt ($session.TrySkipPreviousAsync()) ([bool])
                }
            }
        } catch {}
    }
    if (-not $handled) {
        Send-MediaKey 0xB1 # VK_MEDIA_PREV_TRACK (177)
    }
    Write-Output "OK"
    exit 0
}

# Query active session
try {
    if (-not $asTaskMethod) {
        Write-Output "NO_ACTIVE_SESSION"
        exit 0
    }

    $asyncOp = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()
    $manager = Await-WinRt $asyncOp ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])

    if (-not $manager) {
        Write-Output "NO_ACTIVE_SESSION"
        exit 0
    }

    $session = $manager.GetCurrentSession()
    if (-not $session) {
        Write-Output "NO_ACTIVE_SESSION"
        exit 0
    }

    # Query active session properties
    $mediaPropsOp = $session.TryGetMediaPropertiesAsync()
    $props = Await-WinRt $mediaPropsOp ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
    $playbackInfo = $session.GetPlaybackInfo()

    $status = "Playing"
    if ($playbackInfo) {
        $status = $playbackInfo.PlaybackStatus.ToString()
    }

    $appId = $session.SourceAppUserModelId
    if (-not $appId) { $appId = "Media Player" }

    $title = if ($props -and $props.Title) { $props.Title } else { "Unknown Title" }
    $artist = if ($props -and $props.Artist) { $props.Artist } else { "Unknown Artist" }
    $album = if ($props -and $props.AlbumTitle) { $props.AlbumTitle } else { "Unknown Album" }

    $result = [PSCustomObject]@{
        Title = $title
        Artist = $artist
        AlbumTitle = $album
        PlaybackStatus = $status
        SourceAppUserModelId = $appId
    }

    $result | ConvertTo-Json -Compress
}
catch {
    Write-Output "NO_ACTIVE_SESSION"
}
