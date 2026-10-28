'use strict';

const { execFile } = require('node:child_process');
const store = require('./store');

const DEFAULT_COLOR_HISTORY = [
  { hex: '#FF6363', rgb: 'rgb(255, 99, 99)', hsl: 'hsl(0, 100%, 69%)', timestamp: Date.now() - 3600000 },
  { hex: '#4A90E2', rgb: 'rgb(74, 144, 226)', hsl: 'hsl(212, 72%, 59%)', timestamp: Date.now() - 1800000 },
  { hex: '#50E3C2', rgb: 'rgb(80, 227, 194)', hsl: 'hsl(167, 72%, 60%)', timestamp: Date.now() - 900000 }
];

let history = [...DEFAULT_COLOR_HISTORY];

function init() {
  const loaded = store.read('color_history', null);
  if (Array.isArray(loaded)) {
    history = loaded;
  } else {
    store.write('color_history', history);
  }
}

function rgbToHex(r, g, b) {
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  const hex = [clamp(r), clamp(g), clamp(b)]
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
  return `#${hex.toUpperCase()}`;
}

function hexToRgb(hex) {
  const clean = String(hex || '').replace('#', '').trim();
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    return { r, g, b, str: `rgb(${r}, ${g}, ${b})` };
  }
  if (clean.length === 6) {
    const r = parseInt(clean.substring(0, 2), 16);
    const g = parseInt(clean.substring(2, 4), 16);
    const b = parseInt(clean.substring(4, 6), 16);
    return { r, g, b, str: `rgb(${r}, ${g}, ${b})` };
  }
  return { r: 0, g: 0, b: 0, str: 'rgb(0, 0, 0)' };
}

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }

  const hDeg = Math.round(h * 360);
  const sPct = Math.round(s * 100);
  const lPct = Math.round(l * 100);
  return { h: hDeg, s: sPct, l: lPct, str: `hsl(${hDeg}, ${sPct}%, ${lPct}%)` };
}

async function sampleScreenColor(x, y) {
  return new Promise((resolve) => {
    const psScript = `
      try {
        Add-Type -AssemblyName System.Drawing, System.Windows.Forms
        $pos = [System.Windows.Forms.Cursor]::Position
        $targetX = if ($args[0] -ge 0) { [int]$args[0] } else { $pos.X }
        $targetY = if ($args[1] -ge 0) { [int]$args[1] } else { $pos.Y }
        $bmp = New-Object System.Drawing.Bitmap(1, 1)
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        $g.CopyFromScreen($targetX, $targetY, 0, 0, (New-Object System.Drawing.Size(1, 1)))
        $c = $bmp.GetPixel(0, 0)
        [PSCustomObject]@{ R = $c.R; G = $c.G; B = $c.B; Hex = "#{0:X2}{1:X2}{2:X2}" -f $c.R, $c.G, $c.B } | ConvertTo-Json -Compress
      } catch {
        [PSCustomObject]@{ R = 255; G = 99; B = 99; Hex = "#FF6363"; Fallback = $true } | ConvertTo-Json -Compress
      }
    `;

    const args = ['-NoProfile', '-NonInteractive', '-Command', psScript, String(x ?? -1), String(y ?? -1)];
    execFile('powershell', args, { timeout: 3000 }, (err, stdout) => {
      let r = 255, g = 99, b = 99, hex = '#FF6363';
      if (!err && stdout.trim()) {
        try {
          const parsed = JSON.parse(stdout.trim());
          r = parsed.R ?? r;
          g = parsed.G ?? g;
          b = parsed.B ?? b;
          hex = parsed.Hex || rgbToHex(r, g, b);
        } catch {}
      }
      const hsl = rgbToHsl(r, g, b);
      const colorObj = {
        hex,
        rgb: `rgb(${r}, ${g}, ${b})`,
        hsl: hsl.str,
        r, g, b,
        timestamp: Date.now()
      };
      addColorToHistory(colorObj);
      resolve(colorObj);
    });
  });
}

function addColorToHistory(colorObj) {
  if (!colorObj || !colorObj.hex) return;
  history = [colorObj, ...history.filter((h) => h.hex.toLowerCase() !== colorObj.hex.toLowerCase())].slice(0, 50);
  store.write('color_history', history);
}

function getColorHistory() {
  return [...history];
}

function clearColorHistory() {
  history = [];
  store.write('color_history', history);
}

init();

module.exports = {
  init,
  sampleScreenColor,
  getColorHistory,
  addColorToHistory,
  clearColorHistory,
  rgbToHex,
  hexToRgb,
  rgbToHsl
};
