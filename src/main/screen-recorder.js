'use strict';

const { exec, execFile } = require('node:child_process');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

function triggerScreenSnip() {
  return new Promise((resolve) => {
    // Windows 10/11 native screen snipping tool URI protocol
    exec('explorer.exe ms-screenclip:', (err) => {
      resolve({ ok: !err });
    });
  });
}

function captureFullScreenToFile(outputPath) {
  const dest = outputPath || path.join(os.tmpdir(), `screenshot-${Date.now()}.png`);
  return new Promise((resolve) => {
    const psScript = `
      try {
        Add-Type -AssemblyName System.Drawing, System.Windows.Forms
        $screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
        $bmp = New-Object System.Drawing.Bitmap($screen.Width, $screen.Height)
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        $g.CopyFromScreen($screen.Location, [System.Drawing.Point]::Empty, $screen.Size)
        $bmp.Save("${dest.replace(/\\/g, '\\\\')}", [System.Drawing.Imaging.ImageFormat]::Png)
        Write-Output "OK"
      } catch {
        Write-Output "FAIL"
      }
    `;

    execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', psScript], { timeout: 4000 }, (err, stdout) => {
      const success = !err && stdout.includes('OK') && fs.existsSync(dest);
      resolve({ ok: success, path: success ? dest : null });
    });
  });
}

module.exports = {
  triggerScreenSnip,
  captureFullScreenToFile
};
