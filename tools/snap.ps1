param([string]$action)

$code = @"
using System;
using System.Runtime.InteropServices;
public class WinSnap {
    [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);
    public const int VK_LWIN = 0x5B;
    public const int VK_LEFT = 0x25;
    public const int VK_UP = 0x26;
    public const int VK_RIGHT = 0x27;
    public const int VK_DOWN = 0x28;
    public const int KEYEVENTF_KEYUP = 0x0002;

    public static void PressWinKey(byte key) {
        keybd_event(VK_LWIN, 0, 0, 0);
        keybd_event(key, 0, 0, 0);
        keybd_event(key, 0, KEYEVENTF_KEYUP, 0);
        keybd_event(VK_LWIN, 0, KEYEVENTF_KEYUP, 0);
    }
}
"@

Add-Type -TypeDefinition $code -ErrorAction SilentlyContinue

switch ($action) {
    "left" { [WinSnap]::PressWinKey([WinSnap]::VK_LEFT) }
    "right" { [WinSnap]::PressWinKey([WinSnap]::VK_RIGHT) }
    "maximize" { [WinSnap]::PressWinKey([WinSnap]::VK_UP) }
    "minimize" { [WinSnap]::PressWinKey([WinSnap]::VK_DOWN) }
}
