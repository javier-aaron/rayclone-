param([string]$action)

$code = @"
using System;
using System.Runtime.InteropServices;

public class WinLayout {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
    [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);
    [DllImport("user32.dll")] public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);

    public const uint SWP_NOZORDER = 0x0004;
    public const uint SWP_SHOWWINDOW = 0x0040;
    public const int SW_MAXIMIZE = 3;
    public const int SW_MINIMIZE = 6;
    public const int SW_RESTORE = 9;

    public const int VK_LWIN = 0x5B;
    public const int VK_LEFT = 0x25;
    public const int VK_UP = 0x26;
    public const int VK_RIGHT = 0x27;
    public const int VK_DOWN = 0x28;
    public const int KEYEVENTF_KEYUP = 0x0002;

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    public static void PressWinKey(byte key) {
        keybd_event(VK_LWIN, 0, 0, 0);
        keybd_event(key, 0, 0, 0);
        keybd_event(key, 0, KEYEVENTF_KEYUP, 0);
        keybd_event(VK_LWIN, 0, KEYEVENTF_KEYUP, 0);
    }
}
"@

Add-Type -TypeDefinition $code -ErrorAction SilentlyContinue
Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue

if ($action -eq "toggle-taskbar") {
    $h = [WinLayout]::FindWindow("Shell_TrayWnd", $null)
    if ($h -ne [IntPtr]::Zero) {
        $vis = [WinLayout]::IsWindowVisible($h)
        [WinLayout]::ShowWindow($h, $(if ($vis) { 0 } else { 5 }))
    }
    exit 0
}

$hwnd = [WinLayout]::GetForegroundWindow()
if ($hwnd -eq [IntPtr]::Zero) { exit }

$screen = [System.Windows.Forms.Screen]::FromHandle($hwnd)
if ($null -eq $screen) { $screen = [System.Windows.Forms.Screen]::PrimaryScreen }
$wa = $screen.WorkingArea

$rect = New-Object WinLayout+RECT
[WinLayout]::GetWindowRect($hwnd, [ref]$rect)
$curW = $rect.Right - $rect.Left
$curH = $rect.Bottom - $rect.Top

switch ($action) {
    # Halves
    "left-half" {
        [WinLayout]::ShowWindow($hwnd, [WinLayout]::SW_RESTORE)
        [WinLayout]::SetWindowPos($hwnd, [IntPtr]::Zero, $wa.X, $wa.Y, [int]($wa.Width / 2), $wa.Height, 0x0044)
    }
    "right-half" {
        [WinLayout]::ShowWindow($hwnd, [WinLayout]::SW_RESTORE)
        $half = [int]($wa.Width / 2)
        [WinLayout]::SetWindowPos($hwnd, [IntPtr]::Zero, $wa.X + $half, $wa.Y, $wa.Width - $half, $wa.Height, 0x0044)
    }
    "top-half" {
        [WinLayout]::ShowWindow($hwnd, [WinLayout]::SW_RESTORE)
        [WinLayout]::SetWindowPos($hwnd, [IntPtr]::Zero, $wa.X, $wa.Y, $wa.Width, [int]($wa.Height / 2), 0x0044)
    }
    "bottom-half" {
        [WinLayout]::ShowWindow($hwnd, [WinLayout]::SW_RESTORE)
        $halfH = [int]($wa.Height / 2)
        [WinLayout]::SetWindowPos($hwnd, [IntPtr]::Zero, $wa.X, $wa.Y + $halfH, $wa.Width, $wa.Height - $halfH, 0x0044)
    }

    # Maximize / Minimize / Center
    "maximize" {
        [WinLayout]::ShowWindow($hwnd, [WinLayout]::SW_MAXIMIZE)
    }
    "minimize" {
        [WinLayout]::ShowWindow($hwnd, [WinLayout]::SW_MINIMIZE)
    }
    "almost-maximize" {
        [WinLayout]::ShowWindow($hwnd, [WinLayout]::SW_RESTORE)
        $padX = [int]($wa.Width * 0.03)
        $padY = [int]($wa.Height * 0.03)
        [WinLayout]::SetWindowPos($hwnd, [IntPtr]::Zero, $wa.X + $padX, $wa.Y + $padY, $wa.Width - ($padX * 2), $wa.Height - ($padY * 2), 0x0044)
    }
    "center" {
        [WinLayout]::ShowWindow($hwnd, [WinLayout]::SW_RESTORE)
        $w = [int]($wa.Width * 0.7)
        $h = [int]($wa.Height * 0.75)
        $x = $wa.X + [int](($wa.Width - $w) / 2)
        $y = $wa.Y + [int](($wa.Height - $h) / 2)
        [WinLayout]::SetWindowPos($hwnd, [IntPtr]::Zero, $x, $y, $w, $h, 0x0044)
    }

    # Quarters
    "top-left" {
        [WinLayout]::ShowWindow($hwnd, [WinLayout]::SW_RESTORE)
        [WinLayout]::SetWindowPos($hwnd, [IntPtr]::Zero, $wa.X, $wa.Y, [int]($wa.Width / 2), [int]($wa.Height / 2), 0x0044)
    }
    "top-right" {
        [WinLayout]::ShowWindow($hwnd, [WinLayout]::SW_RESTORE)
        $halfW = [int]($wa.Width / 2)
        [WinLayout]::SetWindowPos($hwnd, [IntPtr]::Zero, $wa.X + $halfW, $wa.Y, $wa.Width - $halfW, [int]($wa.Height / 2), 0x0044)
    }
    "bottom-left" {
        [WinLayout]::ShowWindow($hwnd, [WinLayout]::SW_RESTORE)
        $halfH = [int]($wa.Height / 2)
        [WinLayout]::SetWindowPos($hwnd, [IntPtr]::Zero, $wa.X, $wa.Y + $halfH, [int]($wa.Width / 2), $wa.Height - $halfH, 0x0044)
    }
    "bottom-right" {
        [WinLayout]::ShowWindow($hwnd, [WinLayout]::SW_RESTORE)
        $halfW = [int]($wa.Width / 2)
        $halfH = [int]($wa.Height / 2)
        [WinLayout]::SetWindowPos($hwnd, [IntPtr]::Zero, $wa.X + $halfW, $wa.Y + $halfH, $wa.Width - $halfW, $wa.Height - $halfH, 0x0044)
    }

    # Thirds
    "first-third" {
        [WinLayout]::ShowWindow($hwnd, [WinLayout]::SW_RESTORE)
        [WinLayout]::SetWindowPos($hwnd, [IntPtr]::Zero, $wa.X, $wa.Y, [int]($wa.Width / 3), $wa.Height, 0x0044)
    }
    "center-third" {
        [WinLayout]::ShowWindow($hwnd, [WinLayout]::SW_RESTORE)
        $third = [int]($wa.Width / 3)
        [WinLayout]::SetWindowPos($hwnd, [IntPtr]::Zero, $wa.X + $third, $wa.Y, $third, $wa.Height, 0x0044)
    }
    "last-third" {
        [WinLayout]::ShowWindow($hwnd, [WinLayout]::SW_RESTORE)
        $twoThirds = [int]($wa.Width * 2 / 3)
        [WinLayout]::SetWindowPos($hwnd, [IntPtr]::Zero, $wa.X + $twoThirds, $wa.Y, $wa.Width - $twoThirds, $wa.Height, 0x0044)
    }
    "first-two-thirds" {
        [WinLayout]::ShowWindow($hwnd, [WinLayout]::SW_RESTORE)
        [WinLayout]::SetWindowPos($hwnd, [IntPtr]::Zero, $wa.X, $wa.Y, [int]($wa.Width * 2 / 3), $wa.Height, 0x0044)
    }
    "last-two-thirds" {
        [WinLayout]::ShowWindow($hwnd, [WinLayout]::SW_RESTORE)
        $third = [int]($wa.Width / 3)
        [WinLayout]::SetWindowPos($hwnd, [IntPtr]::Zero, $wa.X + $third, $wa.Y, $wa.Width - $third, $wa.Height, 0x0044)
    }

    # Resize
    "make-larger" {
        [WinLayout]::ShowWindow($hwnd, [WinLayout]::SW_RESTORE)
        $nw = [Math]::Min($wa.Width, $curW + 80)
        $nh = [Math]::Min($wa.Height, $curH + 60)
        $nx = [Math]::Max($wa.X, $rect.Left - 40)
        $ny = [Math]::Max($wa.Y, $rect.Top - 30)
        [WinLayout]::SetWindowPos($hwnd, [IntPtr]::Zero, $nx, $ny, $nw, $nh, 0x0044)
    }
    "make-smaller" {
        [WinLayout]::ShowWindow($hwnd, [WinLayout]::SW_RESTORE)
        $nw = [Math]::Max(300, $curW - 80)
        $nh = [Math]::Max(200, $curH - 60)
        $nx = $rect.Left + 40
        $ny = $rect.Top + 30
        [WinLayout]::SetWindowPos($hwnd, [IntPtr]::Zero, $nx, $ny, $nw, $nh, 0x0044)
    }

    "toggle-taskbar" {
        $h = [WinLayout]::FindWindow("Shell_TrayWnd", $null)
        if ($h -ne [IntPtr]::Zero) {
            $vis = [WinLayout]::IsWindowVisible($h)
            [WinLayout]::ShowWindow($h, $(if ($vis) { 0 } else { 5 }))
        }
    }
}
