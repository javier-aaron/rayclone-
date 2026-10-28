// Load a page in an owned headless Chrome and dump the runtime design tokens.
// Usage: node probe.mjs <url> <outPrefix>
import fs from 'node:fs';
import { spawn } from 'node:child_process';

const URL_TO_PROBE = process.argv[2];
const PREFIX = process.argv[3] || 'probe';
const PORT = 9333;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PROFILE = process.env.TEMP + '/rayclone-probe-profile';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, '--remote-allow-origins=*',
  `--user-data-dir=${PROFILE}`, '--no-first-run', '--no-default-browser-check',
  '--disable-gpu', '--window-size=1280,820', 'about:blank'
], { stdio: 'ignore', detached: false });

let version = null;
for (let i = 0; i < 40; i++) {
  await sleep(400);
  try { version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break; }
  catch { /* keep waiting */ }
}
if (!version) { console.error('chrome did not start'); chrome.kill(); process.exit(1); }

const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(URL_TO_PROBE)}`, { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const events = [];
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id); pending.delete(m.id);
    m.error ? reject(new Error(m.error.message)) : resolve(m.result);
  } else if (m.method) events.push(m);
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const msgId = ++id; pending.set(msgId, { resolve, reject });
  ws.send(JSON.stringify({ id: msgId, method, params }));
});
await new Promise((r) => ws.addEventListener('open', r));

await send('Page.enable');
await send('Runtime.enable');
await sleep(6000);

const DUMP = `(() => {
  const names = new Set();
  for (const sheet of document.styleSheets) {
    let rules; try { rules = sheet.cssRules } catch { continue }
    for (const r of rules) {
      if (r.style) for (const p of r.style) if (p.startsWith('--')) names.add(p);
      if (r.cssRules) for (const rr of r.cssRules) {
        if (rr.style) for (const p of rr.style) if (p.startsWith('--')) names.add(p);
      }
    }
  }
  const cs = getComputedStyle(document.documentElement);
  const bs = getComputedStyle(document.body);
  const tokens = {};
  for (const n of [...names].sort()) {
    const v = cs.getPropertyValue(n).trim() || bs.getPropertyValue(n).trim();
    if (v) tokens[n] = v;
  }
  return {
    title: document.title,
    url: location.href,
    rootClass: document.documentElement.className,
    bodyClass: document.body.className,
    bodyBg: bs.backgroundColor,
    bodyColor: bs.color,
    bodyFont: bs.fontFamily,
    bodyFontSize: bs.fontSize,
    rootChildren: [...document.body.children].map(c => c.tagName + '.' + (c.className || '')).slice(0, 12),
    tokenCount: Object.keys(tokens).length,
    tokens
  };
})()`;

const res = await send('Runtime.evaluate', { expression: DUMP, returnByValue: true });
const value = res.result.value;
if (!value) { console.error('probe returned nothing:', JSON.stringify(res).slice(0, 400)); }
else {
  fs.writeFileSync(`${PREFIX}-tokens.json`, JSON.stringify(value, null, 2));
  console.error(`title=${value.title} tokenCount=${value.tokenCount} bodyBg=${value.bodyBg} font=${value.bodyFont}`);
  console.error('children:', value.rootChildren.join(', '));
}

const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(`${PREFIX}.png`, Buffer.from(shot.data, 'base64'));

const errs = events.filter((e) => e.method === 'Runtime.exceptionThrown');
console.error(`exceptions: ${errs.length}`);
if (errs.length) console.error(JSON.stringify(errs[0].params?.exceptionDetails?.exception?.description || '').slice(0, 300));

ws.close();
try { await fetch(`http://127.0.0.1:${PORT}/json/close/${target.id}`); } catch {}
chrome.kill();
process.exit(0);
