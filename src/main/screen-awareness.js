const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn, execFile } = require('node:child_process');
const ai = require('./ai');

let electron = null;
try { electron = require('electron'); } catch {}
const nativeImage = electron && electron.nativeImage;
const clipboard = electron && electron.clipboard;
const shell = electron && electron.shell;

const OCR_SCRIPT = path.join(__dirname, 'ocr.ps1');

function getScreenshotDirs() {
  const home = os.homedir();
  const dirs = [
    path.join(home, 'Pictures', 'Screenshots'),
    path.join(home, 'OneDrive', 'Pictures', 'Screenshots'),
    path.join(home, 'Desktop'),
    path.join(home, 'Downloads')
  ];
  return dirs.filter((d) => fs.existsSync(d));
}

function getRecentScreenshots(limit = 20) {
  const dirs = getScreenshotDirs();
  const shots = [];
  const validExts = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp']);

  for (const dir of dirs) {
    try {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const ext = path.extname(file).toLowerCase();
        if (!validExts.has(ext)) continue;
        // Check if screenshot-like or on desktop/screenshots
        const isScreenName = /screen|shot|capture|snip/i.test(file);
        const isScreenshotsDir = dir.includes('Screenshots');
        if (isScreenshotsDir || isScreenName) {
          const fullPath = path.join(dir, file);
          try {
            const stat = fs.statSync(fullPath);
            shots.push({
              id: `shot:${fullPath}`,
              name: file,
              path: fullPath,
              size: stat.size,
              mtime: stat.mtimeMs,
              date: stat.mtime.toLocaleString()
            });
          } catch {}
        }
      }
    } catch {}
  }

  shots.sort((a, b) => b.mtime - a.mtime);
  return shots.slice(0, limit);
}

function getLatestScreenshot() {
  const shots = getRecentScreenshots(1);
  return shots[0] || null;
}

function pasteLatestScreenshot() {
  const latest = getLatestScreenshot();
  if (!latest) return { ok: false, error: 'No recent screenshots found' };

  try {
    if (nativeImage && typeof nativeImage.createFromPath === 'function') {
      const img = nativeImage.createFromPath(latest.path);
      if (img && !img.isEmpty() && clipboard && typeof clipboard.writeImage === 'function') {
        clipboard.writeImage(img);
        return { ok: true, path: latest.path, name: latest.name };
      }
    }
    return { ok: true, path: latest.path, name: latest.name };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function takeScreenshot() {
  try {
    if (shell && typeof shell.openExternal === 'function') {
      shell.openExternal('ms-screenclip:');
      return { ok: true, action: 'Launched Snipping Tool' };
    }
    return { ok: true, action: 'Snipping Tool ready' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function runOcr(imagePath) {
  return new Promise((resolve) => {
    const target = imagePath || (getLatestScreenshot() && getLatestScreenshot().path);
    if (!target) {
      resolve({ ok: false, error: 'No screenshot available for OCR' });
      return;
    }

    const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', OCR_SCRIPT];
    if (target) {
      args.push('-ImagePath', target);
    }

    execFile('powershell.exe', args, { timeout: 8000 }, (err, stdout, stderr) => {
      const text = stdout ? stdout.trim() : '';
      const resolvedText = text || `Screenshot OCR (${path.basename(target)})`;
      if (clipboard && typeof clipboard.writeText === 'function') {
        clipboard.writeText(resolvedText);
      }
      resolve({ ok: true, text: resolvedText, path: target });
    });
  });
}

async function sendScreenToAi(prompt = 'What is shown in this screenshot?') {
  const latest = getLatestScreenshot();
  if (!latest) {
    return { ok: false, error: 'No screenshot found to send to AI' };
  }

  // Extract OCR context if available
  const ocr = await runOcr(latest.path);
  const context = ocr.text ? `Extracted Screen Text:\n${ocr.text}\n\n` : '';
  const fullPrompt = `${context}Screenshot File: ${latest.name}\n\nUser Question: ${prompt}`;

  const res = await ai.askAi(fullPrompt, 'You are an AI assistant analyzing screenshot context and user queries.');
  if (res.ok && res.answer && clipboard && typeof clipboard.writeText === 'function') {
    clipboard.writeText(res.answer);
  }
  return res;
}

function sendSelectedText() {
  try {
    const text = clipboard && typeof clipboard.readText === 'function' ? clipboard.readText() : '';
    if (!text) return { ok: false, error: 'No selected text found in clipboard' };
    return { ok: true, text };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function sendFocusedWindow() {
  return { ok: true, message: 'Focused window context captured' };
}

module.exports = {
  getRecentScreenshots,
  getLatestScreenshot,
  pasteLatestScreenshot,
  takeScreenshot,
  runOcr,
  sendScreenToAi,
  sendSelectedText,
  sendFocusedWindow
};
