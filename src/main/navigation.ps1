param (
    [string]$Action = "list",
    [string]$TargetHandle = ""
)

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinUtil {
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")]
    public static extern bool IsIconic(IntPtr hWnd);
}
"@ -ErrorAction SilentlyContinue

if ($Action -eq "list") {
    $processes = Get-Process | Where-Object {
        $_.MainWindowHandle -ne 0 -and
        [string]::IsNullOrWhiteSpace($_.MainWindowTitle) -eq $false
    }

    $list = @()
    foreach ($p in $processes) {
        $list += [PSCustomObject]@{
            pid = $p.Id
            processName = $p.ProcessName
            title = $p.MainWindowTitle
            handle = $p.MainWindowHandle.ToInt64()
        }
    }

    Write-Output ($list | ConvertTo-Json -Compress)
    exit 0
}

if ($Action -eq "focus" -and [string]::IsNullOrWhiteSpace($TargetHandle) -eq $false) {
    try {
        $hwnd = [IntPtr][int64]$TargetHandle
        if ([WinUtil]::IsIconic($hwnd)) {
            [WinUtil]::ShowWindowAsync($hwnd, 9) # SW_RESTORE
        }
        [WinUtil]::SetForegroundWindow($hwnd)
        Write-Output "OK"
    } catch {
        Write-Output "ERROR: $($_.Exception.Message)"
    }
    exit 0
}

if ($Action -eq "close" -and [string]::IsNullOrWhiteSpace($TargetHandle) -eq $false) {
    try {
        $hwnd = [IntPtr][int64]$TargetHandle
        $p = Get-Process | Where-Object { $_.MainWindowHandle -eq $hwnd } | Select-Object -First 1
        if ($p) {
            $p.CloseMainWindow() | Out-Null
            Write-Output "OK"
        }
    } catch {
        Write-Output "ERROR: $($_.Exception.Message)"
    }
    exit 0
}
