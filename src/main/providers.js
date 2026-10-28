'use strict';

const { app, shell, clipboard } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn, execFile } = require('node:child_process');

const store = require('./store');
const { convert } = require('./converters');
const sysControls = require('./system-controls');
const { searchEmojis, EMOJIS } = require('./emojis');
const notesManager = require('./notes');
const scriptsManager = require('./scripts-manager');
const processManager = require('./process-manager');
const devtools = require('./devtools');
const ai = require('./ai');
const settings = require('./settings');
const translator = require('./translator');
const dictionary = require('./dictionary');
const focus = require('./focus');
const calendar = require('./calendar');
const screenAwareness = require('./screen-awareness');
const mcp = require('./mcp');
const contacts = require('./contacts');
const windowsRun = require('./windows-run');
const typingPractice = require('./typing-practice');
const weather = require('./weather');
const navigation = require('./navigation');
const dictation = require('./dictation');
const games = require('./games');
const portInspector = require('./port-inspector');
const gitIndexer = require('./git-indexer');
const dockerManager = require('./docker-manager');
const githubShortcuts = require('./github-shortcuts');
const audioManager = require('./audio-manager');
const servicesManager = require('./services-manager');
const envManager = require('./env-manager');
const wingetManager = require('./winget-manager');
const hostsEditor = require('./hosts-editor');
const mediaHud = require('./media-hud');
const quicklinksManager = require('./quicklinks-manager');
const aliasManager = require('./alias-manager');
const fallbackManager = require('./fallback-manager');
const browserSearch = require('./browser-search');
const fastFileSearch = require('./fast-file-search');
const windowWorkspaces = require('./window-workspaces');
const keyboardRemapper = require('./keyboard-remapper');
const colorPicker = require('./color-picker');
const taskManager = require('./task-manager');
const wifiManager = require('./wifi-manager');
const powerManager = require('./power-manager');
const virtualDesktops = require('./virtual-desktops');
const diskCleanup = require('./disk-cleanup');
const alwaysOnTop = require('./always-on-top');
const screenRecorder = require('./screen-recorder');
const remindersManager = require('./reminders-manager');
const bitwardenBridge = require('./bitwarden-bridge');
const quickUtilities = require('./quick-utilities');
const terminalIntegration = require('./terminal-integration');
const projectLauncher = require('./project-launcher');
const spotifySearch = require('./spotify-search');
const aiCommands = require('./ai-commands');
const extensionStore = require('./extension-store');
const windowsSettings = require('./windows-settings');
const registryExplorer = require('./registry-explorer');
const vscodeWorkspaces = require('./vscode-workspaces');
const windowWalker = require('./window-walker');
const systemDiagnostics = require('./system-diagnostics');
const wslManager = require('./wsl-manager');
const bluetoothManager = require('./bluetooth-manager');
const dnsSwitcher = require('./dns-switcher');
const extensionEngine = require('./extension-engine');

const HOME = os.homedir();

// ============================================================ fuzzy matching

function fuzzy(query, text) {
  if (!query) return 0;
  const q = query.toLowerCase();
  const t = String(text || '').toLowerCase();
  if (!t) return null;

  const exact = t.indexOf(q);
  let score = 0;
  if (exact === 0) score += 40;
  else if (exact > 0) score += 20;

  let qi = 0, streak = 0, last = -2;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] !== q[qi]) continue;
    let bonus = 1;
    if (i === 0 || /[\s\-_./\\()]/.test(t[i - 1])) bonus += 4;
    if (i === last + 1) { streak++; bonus += Math.min(streak, 4); } else streak = 0;
    score += bonus;
    last = i;
    qi++;
  }
  if (qi < q.length) return null;
  // Prefer shorter names: "Code" should beat "Code - Insiders Helper"
  score += Math.max(0, 10 - Math.floor(t.length / 8));
  return score;
}

function scoreItem(query, item) {
  if (!query) return 0;
  const byTitle = fuzzy(query, item.title);
  const bySub = item.subtitle ? fuzzy(query, item.subtitle) : null;
  const byKeywords = (item.keywords || []).reduce((best, k) => {
    const s = fuzzy(query, k);
    return s === null ? best : Math.max(best ?? -Infinity, s - 12);
  }, null);
  const best = [byTitle, bySub === null ? null : bySub - 25, byKeywords]
    .filter((v) => v !== null && v !== undefined)
    .reduce((a, b) => Math.max(a, b), -Infinity);
  return best === -Infinity ? null : best;
}

// ============================================================ calculator

const FUNCS = {
  sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, round: Math.round,
  floor: Math.floor, ceil: Math.ceil, exp: Math.exp, sign: Math.sign,
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  asin: Math.asin, acos: Math.acos, atan: Math.atan,
  log: Math.log10, log10: Math.log10, log2: Math.log2, ln: Math.log
};
const CONSTS = { pi: Math.PI, e: Math.E, tau: Math.PI * 2 };

function tokenize(src) {
  const s = src
    .replace(/[,\u2019]/g, '')
    .replace(/\bplus\b/gi, '+').replace(/\bminus\b/gi, '-')
    .replace(/\btimes\b|\bmultiplied by\b/gi, '*').replace(/\bdivided by\b/gi, '/')
    .replace(/\bof\b/gi, '*').replace(/\bmod\b/gi, '%');
  const out = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < s.length && /[0-9._]/.test(s[j])) j++;
      const raw = s.slice(i, j).replace(/_/g, '');
      if ((raw.match(/\./g) || []).length > 1) return null;
      const num = Number(raw);
      if (!Number.isFinite(num)) return null;
      out.push({ t: 'num', v: num });
      i = j;
      continue;
    }
    if (/[a-zA-Z]/.test(c)) {
      let j = i;
      while (j < s.length && /[a-zA-Z0-9]/.test(s[j])) j++;
      const word = s.slice(i, j).toLowerCase();
      if (word in CONSTS) out.push({ t: 'num', v: CONSTS[word] });
      else if (word in FUNCS) out.push({ t: 'fn', v: word });
      else return null;
      i = j;
      continue;
    }
    if ('+-*/%^()'.includes(c)) { out.push({ t: 'op', v: c }); i++; continue; }
    if (c === '\u00d7') { out.push({ t: 'op', v: '*' }); i++; continue; }
    if (c === '\u00f7') { out.push({ t: 'op', v: '/' }); i++; continue; }
    return null;
  }
  return out.length ? out : null;
}

const PREC = { '+': 1, '-': 1, '*': 2, '/': 2, '%': 2, '^': 3 };

function toRpn(tokens) {
  const out = [], ops = [];
  let prev = null;
  for (const tk of tokens) {
    if (tk.t === 'num') { out.push(tk); prev = 'num'; continue; }
    if (tk.t === 'fn') { ops.push(tk); prev = 'fn'; continue; }
    if (tk.v === '(') { ops.push(tk); prev = '('; continue; }
    if (tk.v === ')') {
      while (ops.length && ops[ops.length - 1].v !== '(') out.push(ops.pop());
      if (!ops.length) return null;
      ops.pop();
      if (ops.length && ops[ops.length - 1].t === 'fn') out.push(ops.pop());
      prev = 'num';
      continue;
    }
    if ((tk.v === '-' || tk.v === '+') && (prev === null || prev === 'op' || prev === '(')) {
      out.push({ t: 'num', v: 0 });
    }
    while (ops.length && ops[ops.length - 1].t === 'op') {
      const top = ops[ops.length - 1].v;
      const rightAssoc = top === '^';
      if (PREC[top] > PREC[tk.v] || (PREC[top] === PREC[tk.v] && !rightAssoc)) out.push(ops.pop());
      else break;
    }
    ops.push(tk);
    prev = 'op';
  }
  while (ops.length) {
    const op = ops.pop();
    if (op.v === '(') return null;
    out.push(op);
  }
  return out;
}

function evalRpn(rpn) {
  const st = [];
  for (const tk of rpn) {
    if (tk.t === 'num') { st.push(tk.v); continue; }
    if (tk.t === 'fn') {
      if (!st.length) return null;
      st.push(FUNCS[tk.v](st.pop()));
      continue;
    }
    if (st.length < 2) return null;
    const b = st.pop(), a = st.pop();
    let r;
    switch (tk.v) {
      case '+': r = a + b; break;
      case '-': r = a - b; break;
      case '*': r = a * b; break;
      case '/': r = b === 0 ? NaN : a / b; break;
      case '%': r = b === 0 ? NaN : a % b; break;
      case '^': r = Math.pow(a, b); break;
      default: return null;
    }
    st.push(r);
  }
  return st.length === 1 ? st[0] : null;
}

function formatNumber(n) {
  if (!Number.isFinite(n)) return null;
  if (Number.isInteger(n) && Math.abs(n) < 1e15) return n.toLocaleString('en-US');
  const rounded = Number(n.toPrecision(12));
  return rounded.toLocaleString('en-US', { maximumFractionDigits: 10 });
}

function normalizePercent(src) {
  let s = src.replace(
    /(\d+(?:\.\d+)?)\s*([+\-])\s*(\d+(?:\.\d+)?)\s*%(?!\s*[\d.])/g,
    (_m, a, op, b) => `${a} ${op} (${a} * ${b} / 100)`
  );
  s = s.replace(/(\d+(?:\.\d+)?)\s*%(?!\s*[\d.])/g, '($1 / 100)');
  return s;
}

function evaluateExpression(raw) {
  const original = String(raw || '').trim();
  if (!original || original.length > 120) return null;

  const src = normalizePercent(original);
  const hasOperator = /[+\-*/%^()]/.test(src);
  const hasFunction = /(sqrt|cbrt|abs|round|floor|ceil|exp|log2|log10|log|ln|sin|cos|tan|asin|acos|atan)\s*\(/i.test(src);
  const isBareConstant = /^(pi|tau)$/i.test(original);
  if (!hasOperator && !hasFunction && !isBareConstant) return null;

  const tokens = tokenize(src);
  if (!tokens) return null;
  const rpn = toRpn(tokens);
  if (!rpn) return null;
  const value = evalRpn(rpn);
  if (value === null || Number.isNaN(value)) return null;
  return { value, text: formatNumber(value) };
}

// ============================================================ provider: calculator

function saveCalcHistory(expr, resultText, val) {
  try {
    const history = store.read('calc_history', []) || [];
    history.unshift({
      id: `ch-${Date.now()}`,
      expression: expr,
      result: resultText,
      value: val,
      timestamp: new Date().toISOString()
    });
    store.write('calc_history', history.slice(0, 30));
  } catch {}
}

function calculatorProvider() {
  return {
    id: 'calculator',
    name: 'Calculator',
    group: 'Calculator',
    all: () => {
      const history = store.read('calc_history', []) || [];
      return history.slice(0, 8).map((h) => ({
        id: `calc:hist:${h.id}`,
        provider: 'calculator',
        group: 'Calculator',
        title: `${h.expression} = ${h.result}`,
        subtitle: `Calculator History · ${new Date(h.timestamp).toLocaleTimeString()}`,
        icon: { kind: 'glyph', name: 'calculator' },
        actions: [
          { id: 'copy', title: 'Copy Result', shortcut: '↵', run: () => clipboard.writeText(String(h.value ?? h.result)) },
          { id: 'copy-expr', title: 'Copy Expression', shortcut: 'Ctrl+C', run: () => clipboard.writeText(h.expression) }
        ]
      }));
    },
    search(query) {
      const q = String(query || '').trim();

      // Check if user is searching calculator history
      if (/^(?:calc|calculator)\s+history$|^calc_history$|^calc:history$/i.test(q)) {
        const history = store.read('calc_history', []) || [];
        if (!history.length) {
          return [{
            id: 'calc:hist:empty',
            provider: 'calculator',
            group: 'Calculator',
            title: 'Calculator History',
            subtitle: 'No recent calculations yet. Type any arithmetic expression to calculate.',
            scoreBoost: 240,
            icon: { kind: 'glyph', name: 'calculator' },
            actions: [
              { id: 'info', title: 'Start Calculating', shortcut: '↵', run: () => ({ ok: true }) }
            ]
          }];
        }
        return history.map((h) => ({
          id: `calc:hist:${h.id}`,
          provider: 'calculator',
          group: 'Calculator',
          title: `${h.expression} = ${h.result}`,
          subtitle: `Calculator History · ${new Date(h.timestamp).toLocaleTimeString()}`,
          scoreBoost: 240,
          icon: { kind: 'glyph', name: 'calculator' },
          actions: [
            { id: 'copy', title: 'Copy Result', shortcut: '↵', run: () => {
              if (clipboard && typeof clipboard.writeText === 'function') clipboard.writeText(String(h.value ?? h.result));
              return { ok: true, value: h.value ?? h.result };
            } },
            { id: 'copy-expr', title: 'Copy Expression', shortcut: 'Ctrl+C', run: () => {
              if (clipboard && typeof clipboard.writeText === 'function') clipboard.writeText(h.expression);
              return { ok: true, expression: h.expression };
            } }
          ]
        }));
      }

      // 1. Natural unit / currency conversion
      const conv = convert(q);
      if (conv) {
        saveCalcHistory(q, conv.text, conv.value);
        return [{
          id: `conv:${q}`,
          provider: 'calculator',
          group: 'Calculator',
          title: conv.text,
          subtitle: `${conv.description}  ·  copy result`,
          icon: { kind: 'glyph', name: conv.type === 'currency' ? 'currency' : 'calculator' },
          scoreBoost: 220,
          actions: [
            { id: 'copy', title: 'Copy Result', shortcut: '↵', run: () => clipboard.writeText(String(conv.value)) },
            { id: 'copy-text', title: 'Copy Full Description', shortcut: 'Ctrl+C', run: () => clipboard.writeText(conv.description) }
          ]
        }];
      }

      // 2. Arithmetic expression evaluation
      const result = evaluateExpression(q);
      if (!result) return [];
      saveCalcHistory(q, result.text, result.value);
      return [{
        id: `calc:${q}`,
        provider: 'calculator',
        group: 'Calculator',
        title: result.text,
        subtitle: `${q.trim()}  ·  copy result`,
        icon: { kind: 'glyph', name: 'calculator' },
        scoreBoost: 200,
        actions: [
          { id: 'copy', title: 'Copy Result', shortcut: '↵', run: () => clipboard.writeText(String(result.value)) },
          { id: 'copy-expr', title: 'Copy Expression & Result', shortcut: 'Ctrl+C', run: () => clipboard.writeText(`${q.trim()} = ${result.text}`) }
        ]
      }];
    }
  };
}

// ============================================================ provider: apps

function startMenuDirs() {
  const dirs = [
    path.join(process.env.ProgramData || 'C:\\ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    path.join(process.env.APPDATA || path.join(HOME, 'AppData', 'Roaming'), 'Microsoft', 'Windows', 'Start Menu', 'Programs')
  ];
  return dirs.filter((d) => { try { return fs.statSync(d).isDirectory(); } catch { return false; } });
}

function walkShortcuts(dir, out, depth = 0) {
  if (depth > 6 || out.length > 4000) return;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walkShortcuts(full, out, depth + 1);
    else if (/\.(lnk|url)$/i.test(e.name)) out.push(full);
  }
}

function launchTarget(target) {
  if (target.startsWith('appid:')) {
    const id = target.slice(6);
    spawn('explorer.exe', [`shell:appsFolder\\${id}`], { detached: true, stdio: 'ignore' }).unref();
    return;
  }
  if (target.startsWith('exe:')) {
    const file = target.slice(4);
    spawn(file, [], { detached: true, stdio: 'ignore' }).unref();
    return;
  }
  shell.openPath(target);
}

function appsProvider() {
  let items = [];
  let ready = false;

  function buildFromShortcuts() {
    const found = [];
    for (const dir of startMenuDirs()) walkShortcuts(dir, found);
    const seen = new Set();
    for (const file of found) {
      const name = path.basename(file).replace(/\.(lnk|url)$/i, '');
      if (!name || seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      items.push({
        id: `app:${file}`,
        provider: 'apps',
        group: 'Applications',
        title: name,
        subtitle: 'Application',
        keywords: [path.dirname(file).split(path.sep).slice(-1)[0]],
        icon: { kind: 'file', path: file, fallback: 'app' },
        actions: [
          { id: 'open', title: 'Open', shortcut: '↵', run: () => launchTarget(file) },
          { id: 'reveal', title: 'Show in Explorer', shortcut: 'Ctrl+Shift+O', run: () => shell.showItemInFolder(file) },
          { id: 'copy-path', title: 'Copy Path', shortcut: 'Ctrl+Shift+C', run: () => clipboard.writeText(file) }
        ]
      });
    }
    ready = true;
  }

  function mergeStoreApps(list) {
    const known = new Set(items.map((i) => i.title.toLowerCase()));
    for (const entry of list) {
      if (!entry || !entry.Name || !entry.AppID) continue;
      const key = String(entry.Name).toLowerCase();
      if (known.has(key)) continue;
      known.add(key);
      items.push({
        id: `app:appid:${entry.AppID}`,
        provider: 'apps',
        group: 'Applications',
        title: String(entry.Name),
        subtitle: 'Application',
        icon: { kind: 'glyph', name: 'app' },
        actions: [
          { id: 'open', title: 'Open', shortcut: '↵', run: () => launchTarget(`appid:${entry.AppID}`) },
          { id: 'copy-name', title: 'Copy Name', shortcut: 'Ctrl+C', run: () => clipboard.writeText(String(entry.Name)) }
        ]
      });
    }
  }

  return {
    id: 'apps',
    name: 'Applications',
    group: 'Applications',
    all: () => items,
    async warm() {
      buildFromShortcuts();
      await new Promise((resolve) => {
        execFile('powershell.exe', [
          '-NoProfile', '-NonInteractive', '-Command',
          'Get-StartApps | Select-Object Name,AppID | ConvertTo-Json -Compress'
        ], { timeout: 15000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
          if (!err && stdout) {
            try {
              const parsed = JSON.parse(stdout);
              mergeStoreApps(Array.isArray(parsed) ? parsed : [parsed]);
            } catch { /* keep shortcut list only */ }
          }
          resolve();
        });
      });
    },
    search() {
      if (!ready) buildFromShortcuts();
      return items;
    }
  };
}

// ============================================================ provider: clipboard

function clipboardProvider() {
  const HISTORY_CAP = 250;
  let history = [];
  let timer = null;
  let last = '';
  let seqIndex = 0;

  function load() {
    const saved = store.read('clipboard', []);
    if (Array.isArray(saved)) history = saved.filter((e) => e && typeof e.text === 'string').slice(0, HISTORY_CAP);
    try { last = clipboard.readText() || ''; } catch { last = ''; }
  }

  function persist() { store.write('clipboard', history); }

  function items() {
    const list = history.map((entry, index) => ({
      id: `clip:${index}`,
      provider: 'clipboard',
      group: 'Clipboard History',
      title: entry.text.replace(/\s+/g, ' ').trim().slice(0, 90) || '(whitespace)',
      subtitle: `Clipboard · ${timeAgo(entry.at)}`,
      icon: { kind: 'glyph', name: 'clipboard' },
      actions: [
        { id: 'copy', title: 'Copy to Clipboard', shortcut: '↵', run: () => { clipboard.writeText(entry.text); last = entry.text; } },
        { id: 'remove', title: 'Remove from History', shortcut: 'Ctrl+D', run: () => { history = history.filter((e) => e !== entry); persist(); } }
      ]
    }));

    // Sequential Paste Commands
    list.unshift(
      {
        id: 'clip:paste-sequential',
        provider: 'clipboard',
        group: 'Clipboard History',
        title: `Paste Sequential (Item #${seqIndex + 1} of ${Math.max(1, history.length)})`,
        subtitle: history[seqIndex % Math.max(1, history.length)] ? `Next: "${history[seqIndex % history.length].text.slice(0, 40)}..."` : 'Cycles through clipboard history items sequentially',
        icon: { kind: 'glyph', name: 'clipboard' },
        actions: [
          {
            id: 'paste-seq',
            title: 'Paste Next Sequential Item',
            shortcut: '↵',
            run: () => {
              if (!history.length) return { ok: false, error: 'Clipboard history empty' };
              const current = history[seqIndex % history.length];
              seqIndex = (seqIndex + 1) % history.length;
              clipboard.writeText(current.text);
              return { ok: true, text: current.text, nextIndex: seqIndex + 1 };
            }
          }
        ]
      },
      {
        id: 'clip:reset-paste-sequential',
        provider: 'clipboard',
        group: 'Clipboard History',
        title: 'Reset Sequential Paste Index',
        subtitle: 'Reset sequential paste counter back to the first item (#1)',
        icon: { kind: 'glyph', name: 'clipboard' },
        actions: [
          {
            id: 'reset-seq',
            title: 'Reset Sequence',
            shortcut: '↵',
            run: () => {
              seqIndex = 0;
              return { ok: true, reset: true };
            }
          }
        ]
      }
    );

    return list;
  }

  return {
    id: 'clipboard',
    name: 'Clipboard History',
    group: 'Clipboard History',
    all: () => items().slice(0, 30),
    warm() {
      load();
      timer = setInterval(() => {
        let text = '';
        try { text = clipboard.readText() || ''; } catch { return; }
        if (!text || text === last) return;
        last = text;
        history = history.filter((e) => e.text !== text);
        history.unshift({ text, at: Date.now() });
        if (history.length > HISTORY_CAP) history.length = HISTORY_CAP;
        persist();
      }, 900);
      if (timer.unref) timer.unref();
    },
    dispose() { if (timer) clearInterval(timer); },
    search(query) {
      const q = String(query || '').trim().toLowerCase();
      const all = items();
      if (/seq|sequential/i.test(q)) {
        return all.slice(0, 2).map((item) => ({ ...item, scoreBoost: 240 }));
      }
      return all;
    }
  };
}

function timeAgo(ts) {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

// ============================================================ provider: files

const FILE_ROOTS = ['Desktop', 'Documents', 'Downloads', 'Pictures', 'Music', 'Videos'];
const SKIP_DIRS = new Set(['node_modules', '.git', '.cache', 'AppData', '$RECYCLE.BIN', 'System Volume Information', '.vscode', '.gradle', '.nuget']);

function filesProvider() {
  const INDEX_CAP = 25000;
  let index = [];
  let ready = false;
  let walking = false;

  function walk(dir, depth) {
    if (depth > 5 || index.length >= INDEX_CAP) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (index.length >= INDEX_CAP) return;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name) || e.name.startsWith('.')) continue;
        walk(full, depth + 1);
      } else if (e.isFile()) {
        index.push({ path: full, name: e.name, dir: path.basename(dir) });
      }
    }
  }

  function build() {
    if (walking || ready) return;
    walking = true;
    for (const root of FILE_ROOTS) {
      walk(path.join(HOME, root), 0);
      if (index.length >= INDEX_CAP) break;
    }
    ready = true;
    walking = false;
  }

  return {
    id: 'files',
    name: 'Files',
    group: 'Files',
    all: () => [],
    warm() { setTimeout(build, 1500); },
    search(query) {
      if (!ready) build();
      const q = String(query || '').trim();
      if (q.length < 2) return [];
      const scored = [];
      for (const f of index) {
        const s = fuzzy(q, f.name);
        if (s === null) continue;
        scored.push({ f, s });
        if (scored.length > 4000) break;
      }
      scored.sort((a, b) => b.s - a.s);
      return scored.slice(0, 25).map(({ f }) => ({
        id: `file:${f.path}`,
        provider: 'files',
        group: 'Files',
        title: f.name,
        subtitle: f.path,
        keywords: [f.dir],
        icon: { kind: 'file', path: f.path, fallback: 'file' },
        actions: [
          { id: 'open', title: 'Open', shortcut: '↵', run: () => shell.openPath(f.path) },
          { id: 'reveal', title: 'Show in Explorer', shortcut: 'Ctrl+Shift+O', run: () => shell.showItemInFolder(f.path) },
          { id: 'copy-path', title: 'Copy Path', shortcut: 'Ctrl+Shift+C', run: () => clipboard.writeText(f.path) }
        ]
      }));
    }
  };
}

// ============================================================ provider: snippets

const DEFAULT_SNIPPETS = [
  { id: 'snip-date', name: "Today's Date", content: '{date}' },
  { id: 'snip-time', name: 'Current Time', content: '{time}' },
  { id: 'snip-iso', name: 'Current ISO Timestamp', content: '{iso}' },
  { id: 'snip-uuid', name: 'Generate UUID', content: '{uuid}' },
  { id: 'snip-lorem', name: 'Lorem Ipsum', content: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.' },
  { id: 'snip-shrug', name: 'Shrug Emoji', content: '¯\\_(ツ)_/¯' },
  { id: 'snip-flip', name: 'Table Flip', content: '(╯°□°)╯︵ ┻━┻' }
];

function evaluateSnippet(template) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const dStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const tStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const isoStr = now.toISOString();

  let text = String(template || '');
  text = text.replace(/\{date\}/gi, dStr);
  text = text.replace(/\{time\}/gi, tStr);
  text = text.replace(/\{iso\}/gi, isoStr);
  if (text.includes('{uuid}')) {
    text = text.replace(/\{uuid\}/gi, crypto.randomUUID());
  }
  return text;
}

function snippetsProvider() {
  let snippets = [];

  function load() {
    const saved = store.read('snippets', null);
    if (Array.isArray(saved) && saved.length) {
      snippets = saved;
    } else {
      snippets = [...DEFAULT_SNIPPETS];
      store.write('snippets', snippets);
    }
  }

  function persist() {
    store.write('snippets', snippets);
  }

  function buildItems() {
    return snippets.map((s) => ({
      id: `snip:${s.id}`,
      provider: 'snippets',
      group: 'Snippets',
      title: s.name,
      subtitle: s.content.length > 50 ? `${s.content.slice(0, 50)}…` : s.content,
      fullContent: s.content,
      keywords: ['snippet', s.name.toLowerCase()],
      icon: { kind: 'glyph', name: 'snippet' },
      actions: [
        {
          id: 'copy',
          title: 'Copy Snippet',
          shortcut: '↵',
          run: () => {
            const val = evaluateSnippet(s.content);
            clipboard.writeText(val);
          }
        },
        {
          id: 'remove',
          title: 'Delete Snippet',
          shortcut: 'Ctrl+D',
          run: () => {
            snippets = snippets.filter((item) => item.id !== s.id);
            persist();
          }
        }
      ]
    }));
  }

  return {
    id: 'snippets',
    name: 'Snippets',
    group: 'Snippets',
    warm: load,
    all: () => {
      if (!snippets.length) load();
      return buildItems();
    },
    search() {
      if (!snippets.length) load();
      return buildItems();
    }
  };
}

// ============================================================ provider: window management

const WINDOW_COMMANDS = [
  ['left-half', 'Left Half', 'Snap left half of the display', () => sysControls.snapLeft()],
  ['right-half', 'Right Half', 'Snap right half of the display', () => sysControls.snapRight()],
  ['top-half', 'Top Half', 'Snap top half of the display', () => sysControls.snapTop()],
  ['bottom-half', 'Bottom Half', 'Snap bottom half of the display', () => sysControls.snapBottom()],

  ['maximize', 'Maximize', 'Maximize window to fit display', () => sysControls.snapMaximize()],
  ['almost-maximize', 'Almost Maximize', 'Expand window with margin around edges', () => sysControls.snapAlmostMaximize()],
  ['minimize', 'Minimize', 'Minimize current window', () => sysControls.snapMinimize()],
  ['center', 'Center', 'Center window in display', () => sysControls.snapCenter()],

  ['top-left', 'Top Left', 'Snap to top-left quarter', () => sysControls.snapTopLeft()],
  ['top-right', 'Top Right', 'Snap to top-right quarter', () => sysControls.snapTopRight()],
  ['bottom-left', 'Bottom Left', 'Snap to bottom-left quarter', () => sysControls.snapBottomLeft()],
  ['bottom-right', 'Bottom Right', 'Snap to bottom-right quarter', () => sysControls.snapBottomRight()],

  ['first-third', 'First Third', 'Snap to left one third', () => sysControls.snapFirstThird()],
  ['center-third', 'Center Third', 'Snap to center one third', () => sysControls.snapCenterThird()],
  ['last-third', 'Last Third', 'Snap to right one third', () => sysControls.snapLastThird()],
  ['first-two-thirds', 'First Two Thirds', 'Snap to left two thirds', () => sysControls.snapFirstTwoThirds()],
  ['last-two-thirds', 'Last Two Thirds', 'Snap to right two thirds', () => sysControls.snapLastTwoThirds()],

  ['make-larger', 'Make Larger', 'Increase window dimensions', () => sysControls.snapMakeLarger()],
  ['make-smaller', 'Make Smaller', 'Decrease window dimensions', () => sysControls.snapMakeSmaller()]
];

function windowManagerProvider() {
  const items = WINDOW_COMMANDS.map(([id, title, subtitle, run]) => ({
    id: `wm:${id}`,
    provider: 'window-manager',
    group: 'Window Management',
    title,
    subtitle,
    keywords: ['window', 'tile', 'snap', 'move', 'layout', id],
    icon: { kind: 'glyph', name: 'window' },
    actions: [{ id: 'run', title: `Apply ${title}`, shortcut: '↵', run }]
  }));

  return {
    id: 'window-manager',
    name: 'Window Management',
    group: 'Window Management',
    all: () => items,
    search: () => items
  };
}

// ============================================================ provider: emojis & symbols

function emojiProvider() {
  return {
    id: 'emojis',
    name: 'Emojis & Symbols',
    group: 'Emojis & Symbols',
    all: () => EMOJIS.slice(0, 16).map((item) => ({
      id: `emoji:${item.name}`,
      provider: 'emojis',
      group: 'Emojis & Symbols',
      title: `${item.emoji}  ${item.name}`,
      subtitle: `Emoji · ${item.keywords.slice(0, 3).join(', ')}`,
      icon: { kind: 'glyph', name: 'emoji' },
      actions: [
        { id: 'copy', title: 'Copy Emoji', shortcut: '↵', run: () => clipboard.writeText(item.emoji) },
        { id: 'copy-name', title: 'Copy Emoji Name', shortcut: 'Ctrl+C', run: () => clipboard.writeText(item.name) }
      ]
    })),
    search(query) {
      const q = String(query || '').trim();
      if (!q) return [];
      const matches = searchEmojis(q);
      return matches.map((item) => ({
        id: `emoji:${item.name}`,
        provider: 'emojis',
        group: 'Emojis & Symbols',
        title: `${item.emoji}  ${item.name}`,
        subtitle: `Emoji · ${item.keywords.slice(0, 3).join(', ')}`,
        scoreBoost: 160,
        icon: { kind: 'glyph', name: 'emoji' },
        actions: [
          { id: 'copy', title: 'Copy Emoji', shortcut: '↵', run: () => clipboard.writeText(item.emoji) },
          { id: 'copy-name', title: 'Copy Emoji Name', shortcut: 'Ctrl+C', run: () => clipboard.writeText(item.name) }
        ]
      }));
    }
  };
}

// ============================================================ provider: notes

function notesProvider() {
  return {
    id: 'notes',
    name: 'Notes',
    group: 'Notes',
    warm: notesManager.load,
    all: () => {
      const all = notesManager.getNotes();
      return all.map((n) => ({
        id: `note:${n.id}`,
        provider: 'notes',
        group: 'Notes',
        title: n.title,
        subtitle: n.content.replace(/\s+/g, ' ').slice(0, 60),
        fullContent: n.content,
        icon: { kind: 'glyph', name: 'notes' },
        actions: [
          { id: 'copy', title: 'Copy Note', shortcut: '↵', run: () => clipboard.writeText(n.content) },
          { id: 'delete', title: 'Delete Note', shortcut: 'Ctrl+D', run: () => notesManager.deleteNote(n.id) }
        ]
      }));
    },
    search(query) {
      const q = String(query || '').trim();
      const items = [];

      // If user types "note: <something>" or "note <something>"
      const noteCmdMatch = q.match(/^note(?::|\s+)\s*(.+)$/i);
      if (noteCmdMatch) {
        const noteContent = noteCmdMatch[1].trim();
        items.push({
          id: `note:create:${noteContent}`,
          provider: 'notes',
          group: 'Notes',
          title: `Create Note: "${noteContent}"`,
          subtitle: 'Save to local notes scratchpad',
          fullContent: noteContent,
          icon: { kind: 'glyph', name: 'notes' },
          scoreBoost: 210,
          actions: [
            {
              id: 'create',
              title: 'Create & Copy Note',
              shortcut: '↵',
              run: () => {
                notesManager.createNote(noteContent, noteContent);
                clipboard.writeText(noteContent);
              }
            }
          ]
        });
      }

      // Search existing notes
      const matches = notesManager.searchNotes(q);
      for (const n of matches) {
        items.push({
          id: `note:${n.id}`,
          provider: 'notes',
          group: 'Notes',
          title: n.title,
          subtitle: n.content.replace(/\s+/g, ' ').slice(0, 60),
          fullContent: n.content,
          icon: { kind: 'glyph', name: 'notes' },
          actions: [
            { id: 'copy', title: 'Copy Note', shortcut: '↵', run: () => clipboard.writeText(n.content) },
            { id: 'delete', title: 'Delete Note', shortcut: 'Ctrl+D', run: () => notesManager.deleteNote(n.id) }
          ]
        });
      }

      return items;
    }
  };
}

// ============================================================ provider: web search & quicklinks

const QUICKLINKS = [
  { prefix: 'g', name: 'Google', url: 'https://www.google.com/search?q=' },
  { prefix: 'google', name: 'Google', url: 'https://www.google.com/search?q=' },
  { prefix: 'ddg', name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
  { prefix: 'yt', name: 'YouTube', url: 'https://www.youtube.com/results?search_query=' },
  { prefix: 'youtube', name: 'YouTube', url: 'https://www.youtube.com/results?search_query=' },
  { prefix: 'gh', name: 'GitHub', url: 'https://github.com/search?q=' },
  { prefix: 'github', name: 'GitHub', url: 'https://github.com/search?q=' },
  { prefix: 'wiki', name: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Special:Search?search=' },
  { prefix: 'reddit', name: 'Reddit', url: 'https://www.reddit.com/search/?q=' },
  { prefix: 'npm', name: 'npm', url: 'https://www.npmjs.com/search?q=' },
  { prefix: 'maps', name: 'Google Maps', url: 'https://www.google.com/maps/search/' },
  { prefix: 'x', name: 'X / Twitter', url: 'https://x.com/search?q=' }
];

const URL_PATTERN = /^(https?:\/\/)?((?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}|localhost)(:[0-9]+)?(\/\S*)?$/i;

function webSearchProvider() {
  return {
    id: 'websearch',
    name: 'Web Search',
    group: 'Web Search',
    all: () => [],
    search(query) {
      const q = String(query || '').trim();
      if (!q) return [];

      const items = [];

      // 1. Direct URL detection
      if (URL_PATTERN.test(q)) {
        const fullUrl = /^https?:\/\//i.test(q) ? q : `https://${q}`;
        items.push({
          id: `url:${fullUrl}`,
          provider: 'websearch',
          group: 'Quicklinks',
          title: `Open ${q}`,
          subtitle: `Visit ${fullUrl}`,
          icon: { kind: 'glyph', name: 'globe' },
          scoreBoost: 210,
          actions: [
            { id: 'open', title: 'Open in Browser', shortcut: '↵', run: () => shell.openExternal(fullUrl) },
            { id: 'copy', title: 'Copy URL', shortcut: 'Ctrl+C', run: () => clipboard.writeText(fullUrl) }
          ]
        });
      }

      // 2. Keyword quicklinks (e.g., "gh react", "yt synthwave", "wiki alan turing")
      const parts = q.split(/\s+/);
      if (parts.length > 1) {
        const first = parts[0].toLowerCase();
        const rest = parts.slice(1).join(' ');
        const ql = QUICKLINKS.find((k) => k.prefix === first);
        if (ql) {
          const targetUrl = ql.url + encodeURIComponent(rest);
          items.push({
            id: `ql:${ql.name}:${rest}`,
            provider: 'websearch',
            group: 'Quicklinks',
            title: `Search ${ql.name} for "${rest}"`,
            subtitle: targetUrl,
            icon: { kind: 'glyph', name: ql.prefix === 'gh' || ql.prefix === 'github' ? 'github' : (ql.prefix === 'yt' || ql.prefix === 'youtube' ? 'youtube' : 'globe') },
            scoreBoost: 200,
            actions: [
              { id: 'search', title: `Search ${ql.name}`, shortcut: '↵', run: () => shell.openExternal(targetUrl) },
              { id: 'copy', title: 'Copy URL', shortcut: 'Ctrl+C', run: () => clipboard.writeText(targetUrl) }
            ]
          });
        }
      }

      // 3. Explicit web search commands (e.g., "g electron", "search rust")
      if (/^(?:g|search|google)\s+(.+)$/i.test(q)) {
        const term = q.replace(/^(?:g|search|google)\s+/i, '').trim();
        items.push(
          {
            id: `web:google:${term}`,
            provider: 'websearch',
            group: 'Web Search',
            title: `Search Google for "${term}"`,
            subtitle: 'Open in default browser',
            icon: { kind: 'glyph', name: 'google' },
            scoreBoost: 200,
            actions: [{ id: 'search', title: 'Search Google', shortcut: '↵', run: () => shell.openExternal(`https://www.google.com/search?q=${encodeURIComponent(term)}`) }]
          },
          {
            id: `web:ddg:${term}`,
            provider: 'websearch',
            group: 'Web Search',
            title: `Search DuckDuckGo for "${term}"`,
            subtitle: 'Open in default browser',
            icon: { kind: 'glyph', name: 'globe' },
            scoreBoost: 195,
            actions: [{ id: 'search', title: 'Search DuckDuckGo', shortcut: '↵', run: () => shell.openExternal(`https://duckduckgo.com/?q=${encodeURIComponent(term)}`) }]
          }
        );
      }

      return items;
    }
  };
}

// ============================================================ provider: scripts

function scriptsProvider() {
  return {
    id: 'scripts',
    name: 'Script Commands',
    group: 'Script Commands',
    warm: () => scriptsManager.scan(),
    all: () => {
      const list = scriptsManager.getScripts();
      return list.map((s) => ({
        id: s.id,
        provider: 'scripts',
        group: 'Script Commands',
        title: s.title,
        subtitle: `${s.packageName} · ${s.filename}`,
        filePath: s.filePath,
        packageName: s.packageName,
        description: s.description,
        mode: s.mode,
        icon: { kind: 'glyph', name: 'code' },
        actions: [
          {
            id: 'run',
            title: `Run ${s.title}`,
            shortcut: '↵',
            run: async () => {
              const res = await scriptsManager.runScript(s);
              if (res.ok && res.output) {
                clipboard.writeText(res.output);
              }
              return { hide: s.mode === 'silent', output: res.output, error: res.error };
            }
          },
          {
            id: 'edit',
            title: 'Edit Script',
            shortcut: 'Ctrl+Shift+O',
            run: () => shell.openPath(s.filePath)
          }
        ]
      }));
    },
    search(query) {
      const q = String(query || '').trim();
      if (!q) return [];
      const list = scriptsManager.getScripts();
      return list.map((s) => ({
        id: s.id,
        provider: 'scripts',
        group: 'Script Commands',
        title: s.title,
        subtitle: `${s.packageName} · ${s.filename}`,
        keywords: ['script', s.packageName.toLowerCase(), s.filename.toLowerCase()],
        filePath: s.filePath,
        packageName: s.packageName,
        description: s.description,
        mode: s.mode,
        icon: { kind: 'glyph', name: 'code' },
        actions: [
          {
            id: 'run',
            title: `Run ${s.title}`,
            shortcut: '↵',
            run: async () => {
              const res = await scriptsManager.runScript(s);
              if (res.ok && res.output) {
                clipboard.writeText(res.output);
              }
              return { hide: s.mode === 'silent', output: res.output, error: res.error };
            }
          },
          {
            id: 'edit',
            title: 'Edit Script',
            shortcut: 'Ctrl+Shift+O',
            run: () => shell.openPath(s.filePath)
          }
        ]
      }));
    }
  };
}

// ============================================================ provider: processes

function processProvider() {
  return {
    id: 'processes',
    name: 'Process Manager',
    group: 'Process Manager',
    warm: () => processManager.fetchProcesses(),
    all: () => [],
    search(query) {
      const q = String(query || '').trim().toLowerCase();
      const isProcessSearch = q.startsWith('kill') || q.startsWith('proc ') || q.startsWith('ps ') || q.startsWith('process ');
      const filter = isProcessSearch ? q.replace(/^(kill|proc|ps|process)\s*/i, '').trim() : q;
      if (!isProcessSearch && q.length < 3) return [];

      const list = processManager.getProcessesSync();
      const matches = isProcessSearch
        ? (filter ? list.filter((p) => p.name.toLowerCase().includes(filter) || p.title.toLowerCase().includes(filter)) : list.slice(0, 15))
        : list.filter((p) => p.name.toLowerCase().startsWith(q) || p.title.toLowerCase().includes(q)).slice(0, 6);

      return matches.map((p) => ({
        id: `proc:${p.pid}`,
        provider: 'processes',
        group: 'Process Manager',
        title: p.title || p.name,
        subtitle: `PID: ${p.pid} · Memory: ${p.memoryFormatted}`,
        pid: p.pid,
        memory: p.memoryFormatted,
        keywords: ['kill', 'process', p.name.toLowerCase(), String(p.pid)],
        icon: { kind: 'glyph', name: 'terminal' },
        scoreBoost: isProcessSearch ? 180 : 20,
        actions: [
          {
            id: 'kill',
            title: `Kill Process (${p.name})`,
            shortcut: '↵',
            run: async () => {
              await processManager.killProcess(p.pid);
              return { hide: true };
            }
          },
          {
            id: 'copy-name',
            title: 'Copy Process Name',
            shortcut: 'Ctrl+C',
            run: () => clipboard.writeText(p.name)
          },
          {
            id: 'copy-pid',
            title: 'Copy PID',
            shortcut: 'Ctrl+Shift+C',
            run: () => clipboard.writeText(String(p.pid))
          }
        ]
      }));
    }
  };
}

// ============================================================ provider: devtools

function devToolsProvider() {
  return {
    id: 'devtools',
    name: 'Developer Tools',
    group: 'Developer Tools',
    all: () => [
      {
        id: 'dev:uuid',
        provider: 'devtools',
        group: 'Developer Tools',
        title: 'Generate UUID v4',
        subtitle: 'Generate and copy random UUID',
        keywords: ['uuid', 'guid', 'random'],
        icon: { kind: 'glyph', name: 'snippet' },
        actions: [{ id: 'run', title: 'Copy New UUID', shortcut: '↵', run: () => clipboard.writeText(devtools.generateUuid()) }]
      },
      {
        id: 'dev:ip',
        provider: 'devtools',
        group: 'Developer Tools',
        title: 'My IP Address & Network',
        subtitle: 'View local IPv4 network interfaces',
        keywords: ['ip', 'network', 'interfaces', 'mac'],
        icon: { kind: 'glyph', name: 'globe' },
        actions: [{
          id: 'run',
          title: 'Copy Primary IP',
          shortcut: '↵',
          run: () => {
            const net = devtools.getNetworkInfo();
            if (net[0]) clipboard.writeText(net[0].ip);
          }
        }]
      },
      {
        id: 'dev:epoch',
        provider: 'devtools',
        group: 'Developer Tools',
        title: 'Current Unix Epoch Timestamp',
        subtitle: `${Math.floor(Date.now() / 1000)} (seconds)`,
        keywords: ['epoch', 'timestamp', 'unix', 'time'],
        icon: { kind: 'glyph', name: 'bolt' },
        actions: [{ id: 'run', title: 'Copy Timestamp', shortcut: '↵', run: () => clipboard.writeText(String(Math.floor(Date.now() / 1000))) }]
      }
    ],
    search(query) {
      const q = String(query || '').trim();
      if (!q) return [];
      const items = [];

      // 1. UUID generator
      if (/^uuid|guid$/i.test(q)) {
        const u = devtools.generateUuid();
        items.push({
          id: `dev:uuid:${u}`,
          provider: 'devtools',
          group: 'Developer Tools',
          title: `UUID: ${u}`,
          subtitle: 'Click to copy newly generated UUID',
          icon: { kind: 'glyph', name: 'snippet' },
          scoreBoost: 220,
          actions: [{ id: 'copy', title: 'Copy UUID', shortcut: '↵', run: () => clipboard.writeText(u) }]
        });
      }

      // 2. Epoch timestamp converter
      if (/^epoch(\s+\d+)?$/i.test(q)) {
        const match = q.match(/^epoch\s+(\d+)$/i);
        if (match) {
          const conv = devtools.epochToDate(match[1]);
          if (conv) {
            items.push({
              id: `dev:epoch:${match[1]}`,
              provider: 'devtools',
              group: 'Developer Tools',
              title: `${conv.local}`,
              subtitle: `UTC: ${conv.utc} · ISO: ${conv.iso}`,
              icon: { kind: 'glyph', name: 'bolt' },
              scoreBoost: 220,
              actions: [
                { id: 'copy-local', title: 'Copy Local Date', shortcut: '↵', run: () => clipboard.writeText(conv.local) },
                { id: 'copy-iso', title: 'Copy ISO Date', shortcut: 'Ctrl+C', run: () => clipboard.writeText(conv.iso) }
              ]
            });
          }
        } else {
          const nowSec = Math.floor(Date.now() / 1000);
          items.push({
            id: 'dev:epoch:now',
            provider: 'devtools',
            group: 'Developer Tools',
            title: `Epoch: ${nowSec}`,
            subtitle: `Milliseconds: ${Date.now()}`,
            icon: { kind: 'glyph', name: 'bolt' },
            scoreBoost: 210,
            actions: [{ id: 'copy', title: 'Copy Epoch (seconds)', shortcut: '↵', run: () => clipboard.writeText(String(nowSec)) }]
          });
        }
      }

      // 3. JSON Formatter
      const jsonMatch = q.match(/^(?:json|format\s+json)\s+(.+)$/i);
      const isDirectJson = (q.startsWith('{') && q.endsWith('}')) || (q.startsWith('[') && q.endsWith(']'));
      if (jsonMatch || isDirectJson) {
        const text = jsonMatch ? jsonMatch[1].trim() : q;
        const res = devtools.formatJson(text);
        if (res.ok) {
          items.push({
            id: `dev:json:formatted`,
            provider: 'devtools',
            group: 'Developer Tools',
            title: 'Valid JSON (Formatted)',
            subtitle: `Keys: ${res.keysCount} · Click to copy formatted JSON`,
            fullContent: res.formatted,
            icon: { kind: 'glyph', name: 'code' },
            scoreBoost: 230,
            actions: [
              { id: 'copy-formatted', title: 'Copy Formatted JSON', shortcut: '↵', run: () => clipboard.writeText(res.formatted) },
              { id: 'copy-minified', title: 'Copy Minified JSON', shortcut: 'Ctrl+Shift+C', run: () => clipboard.writeText(res.minified) }
            ]
          });
        }
      }

      // 4. Base64 Encode / Decode
      const b64eMatch = q.match(/^(?:b64e|base64\s+encode)\s+(.+)$/i);
      if (b64eMatch) {
        const enc = devtools.base64Encode(b64eMatch[1]);
        items.push({
          id: `dev:b64e`,
          provider: 'devtools',
          group: 'Developer Tools',
          title: enc,
          subtitle: `Base64 Encoded (${b64eMatch[1]})`,
          icon: { kind: 'glyph', name: 'snippet' },
          scoreBoost: 220,
          actions: [{ id: 'copy', title: 'Copy Base64', shortcut: '↵', run: () => clipboard.writeText(enc) }]
        });
      }

      const b64dMatch = q.match(/^(?:b64d|base64\s+decode)\s+(.+)$/i);
      if (b64dMatch) {
        const dec = devtools.base64Decode(b64dMatch[1]);
        if (dec.ok) {
          items.push({
            id: `dev:b64d`,
            provider: 'devtools',
            group: 'Developer Tools',
            title: dec.text,
            subtitle: 'Base64 Decoded Text',
            icon: { kind: 'glyph', name: 'snippet' },
            scoreBoost: 220,
            actions: [{ id: 'copy', title: 'Copy Decoded Text', shortcut: '↵', run: () => clipboard.writeText(dec.text) }]
          });
        }
      }

      // 5. Hash SHA256 / MD5
      const hashMatch = q.match(/^(?:hash|sha256|md5)\s+(.+)$/i);
      if (hashMatch) {
        const text = hashMatch[1];
        const hashes = devtools.computeHashes(text);
        items.push(
          {
            id: `dev:sha256`,
            provider: 'devtools',
            group: 'Developer Tools',
            title: hashes.sha256,
            subtitle: `SHA-256 ("${text}")`,
            icon: { kind: 'glyph', name: 'snippet' },
            scoreBoost: 220,
            actions: [{ id: 'copy', title: 'Copy SHA-256', shortcut: '↵', run: () => clipboard.writeText(hashes.sha256) }]
          },
          {
            id: `dev:md5`,
            provider: 'devtools',
            group: 'Developer Tools',
            title: hashes.md5,
            subtitle: `MD5 ("${text}")`,
            icon: { kind: 'glyph', name: 'snippet' },
            scoreBoost: 215,
            actions: [{ id: 'copy', title: 'Copy MD5', shortcut: '↵', run: () => clipboard.writeText(hashes.md5) }]
          }
        );
      }

      // 6. Network IP
      if (/^(ip|my\s*ip|network)$/i.test(q)) {
        const net = devtools.getNetworkInfo();
        for (const n of net) {
          items.push({
            id: `dev:ip:${n.interface}`,
            provider: 'devtools',
            group: 'Developer Tools',
            title: `${n.ip} (${n.interface})`,
            subtitle: `Netmask: ${n.netmask} · MAC: ${n.mac}`,
            icon: { kind: 'glyph', name: 'globe' },
            scoreBoost: 210,
            actions: [{ id: 'copy', title: 'Copy IP', shortcut: '↵', run: () => clipboard.writeText(n.ip) }]
          });
        }
      }

      // 7. Color Inspector
      const color = devtools.parseColor(q);
      if (color) {
        items.push({
          id: `dev:color:${color.hex}`,
          provider: 'devtools',
          group: 'Developer Tools',
          title: `${color.hex} — ${color.rgb}`,
          subtitle: 'Color Inspector · Click to copy Hex',
          icon: { kind: 'glyph', name: 'theme' },
          scoreBoost: 230,
          actions: [
            { id: 'copy-hex', title: 'Copy HEX', shortcut: '↵', run: () => clipboard.writeText(color.hex) },
            { id: 'copy-rgb', title: 'Copy RGB', shortcut: 'Ctrl+C', run: () => clipboard.writeText(color.rgb) }
          ]
        });
      }

      return items;
    }
  };
}

// ============================================================ provider: ai

function aiProvider() {
  return {
    id: 'ai',
    name: 'Raycast AI',
    group: 'Raycast AI',
    all: () => [
      {
        id: 'ai:prompt:explain',
        provider: 'ai',
        group: 'Raycast AI',
        title: 'AI: Explain Code',
        subtitle: 'Ask AI to explain code from your clipboard',
        icon: { kind: 'glyph', name: 'sparkle' },
        actions: [
          {
            id: 'run',
            title: 'Explain Clipboard Code',
            shortcut: '↵',
            run: async () => {
              const text = clipboard.readText();
              if (!text) return { ok: false, error: 'Clipboard is empty' };
              const res = await ai.askAi(text, 'You are an expert programmer. Explain this code clearly and concisely.');
              if (res.ok) clipboard.writeText(res.answer);
              return res;
            }
          }
        ]
      },
      {
        id: 'ai:prompt:grammar',
        provider: 'ai',
        group: 'Raycast AI',
        title: 'AI: Fix Grammar & Spelling',
        subtitle: 'Fix spelling, grammar, and tone of clipboard text',
        icon: { kind: 'glyph', name: 'sparkle' },
        actions: [
          {
            id: 'run',
            title: 'Fix Grammar',
            shortcut: '↵',
            run: async () => {
              const text = clipboard.readText();
              if (!text) return { ok: false, error: 'Clipboard is empty' };
              const res = await ai.askAi(text, 'Fix any grammar, spelling, and punctuation issues in the text. Return only the corrected text.');
              if (res.ok) clipboard.writeText(res.answer);
              return res;
            }
          }
        ]
      },
      {
        id: 'ai:prompt:summarize',
        provider: 'ai',
        group: 'Raycast AI',
        title: 'AI: Summarize Text',
        subtitle: 'Produce a concise bullet-point summary of clipboard text',
        icon: { kind: 'glyph', name: 'sparkle' },
        actions: [
          {
            id: 'run',
            title: 'Summarize Text',
            shortcut: '↵',
            run: async () => {
              const text = clipboard.readText();
              if (!text) return { ok: false, error: 'Clipboard is empty' };
              const res = await ai.askAi(text, 'Summarize the following text in 3-5 concise bullet points.');
              if (res.ok) clipboard.writeText(res.answer);
              return res;
            }
          }
        ]
      }
    ],
    search(query) {
      const q = String(query || '').trim();
      const items = [];
      const aiMatch = q.match(/^ai(?::|\s+)\s*(.+)$/i);
      if (aiMatch) {
        const prompt = aiMatch[1].trim();
        items.push({
          id: `ai:query:${prompt}`,
          provider: 'ai',
          group: 'Raycast AI',
          title: `Ask AI: "${prompt}"`,
          subtitle: 'Query AI assistant with prompt',
          icon: { kind: 'glyph', name: 'sparkle' },
          scoreBoost: 240,
          actions: [
            {
              id: 'run',
              title: 'Ask AI & Copy Answer',
              shortcut: '↵',
              run: async () => {
                const res = await ai.askAi(prompt);
                if (res.ok) clipboard.writeText(res.answer);
                return res;
              }
            }
          ]
        });
      }
      return items;
    }
  };
}

// ============================================================ provider: system

function spawnDetached(cmd, args = []) {
  spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: false }).unref();
}

const SYSTEM_COMMANDS = [
  // Windows & Power
  ['lock', 'Lock Screen', 'System', () => spawnDetached('rundll32.exe', ['user32.dll,LockWorkStation'])],
  ['sleep', 'Sleep', 'System', () => spawnDetached('rundll32.exe', ['powrprof.dll,SetSuspendState', '0,1,0'])],
  ['restart', 'Restart Computer', 'System', () => spawnDetached('shutdown', ['/r', '/t', '0'])],
  ['shutdown', 'Shut Down Computer', 'System', () => spawnDetached('shutdown', ['/s', '/t', '0'])],
  ['signout', 'Sign Out', 'System', () => spawnDetached('shutdown', ['/l'])],
  ['empty-trash', 'Empty Recycle Bin', 'System', () => spawnDetached('powershell.exe', ['-NoProfile', '-Command', 'Clear-RecycleBin -Force -ErrorAction SilentlyContinue'])],
  ['toggle-theme', 'Toggle Dark / Light Theme', 'System', () => sysControls.toggleDarkTheme()],

  // Audio & Media
  ['vol-up', 'Volume Up (+10%)', 'Audio & Media', () => sysControls.volumeUp()],
  ['vol-down', 'Volume Down (-10%)', 'Audio & Media', () => sysControls.volumeDown()],
  ['vol-mute', 'Mute / Unmute', 'Audio & Media', () => sysControls.volumeMute()],
  ['media-play', 'Play / Pause Media', 'Audio & Media', () => sysControls.mediaPlayPause()],
  ['media-next', 'Next Track', 'Audio & Media', () => sysControls.mediaNext()],
  ['media-prev', 'Previous Track', 'Audio & Media', () => sysControls.mediaPrev()],
  ['sound-mixer', 'Volume Mixer', 'Audio & Media', () => spawnDetached('sndvol.exe')],

  // Utilities
  ['taskmgr', 'Task Manager', 'Utilities', () => spawnDetached('taskmgr.exe')],
  ['devmgmt', 'Device Manager', 'Utilities', () => spawnDetached('mmc.exe', ['devmgmt.msc'])],
  ['diskmgmt', 'Disk Management', 'Utilities', () => spawnDetached('mmc.exe', ['diskmgmt.msc'])],
  ['services', 'Services', 'Utilities', () => spawnDetached('mmc.exe', ['services.msc'])],
  ['regedit', 'Registry Editor', 'Utilities', () => spawnDetached('regedit.exe')],
  ['control', 'Control Panel', 'Utilities', () => spawnDetached('control.exe')],
  ['terminal', 'Windows Terminal', 'Utilities', () => spawnDetached('wt.exe')],
  ['cmd', 'Command Prompt', 'Utilities', () => spawnDetached('cmd.exe')],
  ['powershell', 'PowerShell', 'Utilities', () => spawnDetached('powershell.exe')],
  ['resmon', 'Resource Monitor', 'Utilities', () => spawnDetached('resmon.exe')],
  ['msinfo', 'System Information', 'Utilities', () => spawnDetached('msinfo32.exe')],
  ['screenclip', 'Take Screenshot', 'Utilities', () => shell.openExternal('ms-screenclip:')],

  // Settings
  ['display', 'Display Settings', 'Settings', () => shell.openExternal('ms-settings:display')],
  ['sound', 'Sound Settings', 'Settings', () => shell.openExternal('ms-settings:sound')],
  ['bluetooth', 'Bluetooth Settings', 'Settings', () => shell.openExternal('ms-settings:bluetooth')],
  ['wifi', 'Wi-Fi Settings', 'Settings', () => shell.openExternal('ms-settings:network-wifi')],
  ['nightlight', 'Night Light Settings', 'Settings', () => shell.openExternal('ms-settings:nightlight')],
  ['focus-assist', 'Focus Assist Settings', 'Settings', () => shell.openExternal('ms-settings:quiethours')],
  ['update', 'Windows Update', 'Settings', () => shell.openExternal('ms-settings:windowsupdate')],
  ['apps-features', 'Installed Apps', 'Settings', () => shell.openExternal('ms-settings:appsfeatures')],
  ['notifications', 'Notifications Settings', 'Settings', () => shell.openExternal('ms-settings:notifications')],
  ['storage', 'Storage Settings', 'Settings', () => shell.openExternal('ms-settings:storagesense')],
  ['privacy', 'Privacy Settings', 'Settings', () => shell.openExternal('ms-settings:privacy')],
  ['datetime', 'Date & Time Settings', 'Settings', () => shell.openExternal('ms-settings:dateandtime')],
  ['project', 'Project Display', 'System', () => shell.openExternal('ms-settings:project')],

  // Extended Hardware & System Controls
  ['vol-0', 'Set Volume to 0%', 'Audio & Media', () => sysControls.setVolumeLevel(0)],
  ['vol-25', 'Set Volume to 25%', 'Audio & Media', () => sysControls.setVolumeLevel(25)],
  ['vol-50', 'Set Volume to 50%', 'Audio & Media', () => sysControls.setVolumeLevel(50)],
  ['vol-75', 'Set Volume to 75%', 'Audio & Media', () => sysControls.setVolumeLevel(75)],
  ['vol-100', 'Set Volume to 100%', 'Audio & Media', () => sysControls.setVolumeLevel(100)],
  ['hidden-files', 'Toggle Hidden Files', 'System', () => sysControls.toggleHiddenFiles()],
  ['sleep-displays', 'Sleep Displays', 'System', () => sysControls.sleepDisplays()],
  ['show-desktop', 'Show Desktop', 'System', () => sysControls.showDesktop()],
  ['hibernate', 'Hibernate Computer', 'System', () => sysControls.hibernate()],
  ['toggle-wifi', 'Toggle Wi-Fi', 'System', () => sysControls.toggleWifi()],
  ['quit-all-apps', 'Quit All Applications', 'System', () => sysControls.quitAllApplications()],
  ['ocr-screen', 'Screen OCR / Extract Text', 'Utilities', async () => {
    const res = await screenAwareness.runOcr();
    return { hide: true, output: res.text };
  }],
  ['paste-latest-shot', 'Paste Latest Screenshot', 'Utilities', () => {
    return screenAwareness.pasteLatestScreenshot();
  }]
];

// ============================================================ provider: translator

function translatorProvider() {
  return {
    id: 'translator',
    name: 'Translator',
    group: 'Translator',
    all: () => [
      {
        id: 'trans:default',
        provider: 'translator',
        group: 'Translator',
        title: 'Translate: Any Text into 50+ Languages',
        subtitle: 'Auto-detect source language & instant translation',
        icon: { kind: 'glyph', name: 'globe' },
        actions: [
          {
            id: 'open',
            title: 'Translate Clipboard Text',
            shortcut: '↵',
            run: async () => {
              const text = clipboard.readText();
              if (!text) return { ok: false, error: 'Clipboard is empty' };
              const res = await translator.translate(text, 'es');
              if (res.ok) clipboard.writeText(res.translatedText);
              return res;
            }
          }
        ]
      }
    ],
    async search(query) {
      const q = String(query || '').trim();
      if (!q) return [];
      const parsed = translator.parseTranslateQuery(q);
      if (!parsed) {
        if (/^(?:trans|translate|translator|translation|language)/i.test(q)) {
          return [
            {
              id: 'trans:default',
              provider: 'translator',
              group: 'Translator',
              title: 'Translate: Any Text into 50+ Languages',
              subtitle: 'Auto-detect source language & instant translation',
              scoreBoost: 260,
              icon: { kind: 'glyph', name: 'globe' },
              actions: [
                {
                  id: 'open',
                  title: 'Translate Clipboard Text',
                  shortcut: '↵',
                  run: async () => {
                    const text = clipboard.readText();
                    if (!text) return { ok: false, error: 'Clipboard is empty' };
                    const res = await translator.translate(text, 'es');
                    if (res.ok) clipboard.writeText(res.translatedText);
                    return res;
                  }
                }
              ]
            }
          ];
        }
        return [];
      }

      const res = await translator.translate(parsed.text, parsed.targetLang);
      if (!res.ok) return [];

      const srcName = res.sourceLang ? `${res.sourceLang.flag} ${res.sourceLang.name}` : 'Auto';
      const tgtName = res.targetLang ? `${res.targetLang.flag} ${res.targetLang.name}` : 'Spanish';

      return [
        {
          id: `trans:${res.targetLang.code}:${parsed.text}`,
          provider: 'translator',
          group: 'Translator',
          title: res.translatedText,
          subtitle: `${srcName} → ${tgtName} · ${res.sourceText}`,
          sourceText: res.sourceText,
          translatedText: res.translatedText,
          sourceLang: res.sourceLang,
          targetLang: res.targetLang,
          translatorProvider: res.provider,
          icon: { kind: 'glyph', name: 'globe' },
          scoreBoost: 260,
          actions: [
            {
              id: 'copy',
              title: 'Copy Translation',
              shortcut: '↵',
              run: () => clipboard.writeText(res.translatedText)
            },
            {
              id: 'copy-src',
              title: 'Copy Original Text',
              shortcut: 'Ctrl+C',
              run: () => clipboard.writeText(res.sourceText)
            },
            {
              id: 'swap',
              title: 'Translate Back / Swap',
              shortcut: 'Ctrl+S',
              run: async () => {
                const swapped = await translator.translate(res.translatedText, res.sourceLang.code, res.targetLang.code);
                if (swapped.ok) clipboard.writeText(swapped.translatedText);
                return swapped;
              }
            }
          ]
        }
      ];
    }
  };
}

// ============================================================ provider: dictionary

function dictionaryProvider() {
  return {
    id: 'dictionary',
    name: 'Dictionary',
    group: 'Dictionary',
    all: () => [
      {
        id: 'dict:lookup',
        provider: 'dictionary',
        group: 'Dictionary',
        title: 'Define Word: Dictionary & Thesaurus',
        subtitle: 'Search lexical definitions, pronunciations & synonyms',
        icon: { kind: 'glyph', name: 'notes' },
        actions: [
          {
            id: 'open',
            title: 'Define Clipboard Word',
            shortcut: '↵',
            run: async () => {
              const text = clipboard.readText().trim();
              if (!text) return { ok: false, error: 'Clipboard is empty' };
              const def = await dictionary.defineWord(text);
              if (def.ok && def.meanings[0]) {
                clipboard.writeText(def.meanings[0].definitions[0].definition);
              }
              return def;
            }
          }
        ]
      }
    ],
    async search(query) {
      const q = String(query || '').trim();
      if (!q) return [];
      const parsed = dictionary.parseDictionaryQuery(q);
      if (!parsed) {
        if (/^(?:dict|dictionary|thesaurus|define|definition|word|meaning)/i.test(q)) {
          return [
            {
              id: 'dict:lookup',
              provider: 'dictionary',
              group: 'Dictionary',
              title: 'Define Word: Dictionary & Thesaurus',
              subtitle: 'Search lexical definitions, pronunciations & synonyms',
              scoreBoost: 260,
              icon: { kind: 'glyph', name: 'notes' },
              actions: [
                {
                  id: 'open',
                  title: 'Define Clipboard Word',
                  shortcut: '↵',
                  run: async () => {
                    const text = clipboard.readText().trim();
                    if (!text) return { ok: false, error: 'Clipboard is empty' };
                    const def = await dictionary.defineWord(text);
                    if (def.ok && def.meanings[0]) {
                      clipboard.writeText(def.meanings[0].definitions[0].definition);
                    }
                    return def;
                  }
                }
              ]
            }
          ];
        }
        return [];
      }

      const res = await dictionary.defineWord(parsed.word);
      if (!res.ok || !res.meanings || !res.meanings.length) return [];

      const topMeaning = res.meanings[0];
      const topDef = topMeaning.definitions[0];
      const synSnippet = res.synonyms.length ? ` · Synonyms: ${res.synonyms.slice(0, 3).join(', ')}` : '';

      return [
        {
          id: `dict:${res.word}`,
          provider: 'dictionary',
          group: 'Dictionary',
          title: `${res.word} ${res.phonetic || ''}`,
          subtitle: `(${topMeaning.partOfSpeech}) ${topDef.definition}${synSnippet}`,
          word: res.word,
          phonetic: res.phonetic,
          meanings: res.meanings,
          synonyms: res.synonyms,
          antonyms: res.antonyms,
          icon: { kind: 'glyph', name: 'notes' },
          scoreBoost: 260,
          actions: [
            {
              id: 'copy-def',
              title: 'Copy Definition',
              shortcut: '↵',
              run: () => clipboard.writeText(`${res.word}: ${topDef.definition}`)
            },
            {
              id: 'copy-syn',
              title: 'Copy Synonyms',
              shortcut: 'Ctrl+S',
              run: () => clipboard.writeText(res.synonyms.join(', '))
            },
            {
              id: 'copy-word',
              title: 'Copy Word',
              shortcut: 'Ctrl+C',
              run: () => clipboard.writeText(res.word)
            }
          ]
        }
      ];
    }
  };
}

// ============================================================ provider: focus

function focusProvider() {
  return {
    id: 'focus',
    name: 'Raycast Focus',
    group: 'Raycast Focus',
    warm: focus.load,
    all: () => {
      const st = focus.getStatus();
      return [
        {
          id: 'focus:toggle',
          provider: 'focus',
          group: 'Raycast Focus',
          title: st.state === 'active' ? `Pause Focus Session (${st.remainingFormatted})` : (st.state === 'paused' ? `Resume Focus Session (${st.remainingFormatted})` : 'Start Focus Session (25 min)'),
          subtitle: `Category: ${st.category} · State: ${st.state.toUpperCase()} · Today: ${st.stats.sessions || 0} sessions`,
          state: st.state,
          remainingFormatted: st.remainingFormatted,
          category: st.category,
          progressPercent: st.progressPercent,
          stats: st.stats,
          icon: { kind: 'glyph', name: 'bolt' },
          actions: [
            {
              id: 'toggle',
              title: st.state === 'active' ? 'Pause' : (st.state === 'paused' ? 'Resume' : 'Start Focus Session'),
              shortcut: '↵',
              run: () => focus.toggle()
            },
            {
              id: 'complete',
              title: 'Complete Session',
              shortcut: 'Ctrl+Shift+C',
              run: () => focus.complete()
            },
            {
              id: 'reset',
              title: 'Reset Session',
              shortcut: 'Ctrl+R',
              run: () => focus.reset()
            }
          ]
        },
        {
          id: 'focus:start-coding',
          provider: 'focus',
          group: 'Raycast Focus',
          title: 'Start Focus: Coding (45 min)',
          subtitle: 'Launch deep work coding session',
          category: 'Coding',
          durationMinutes: 45,
          icon: { kind: 'glyph', name: 'code' },
          actions: [{ id: 'start', title: 'Start Coding Session', shortcut: '↵', run: () => focus.start(45, 'Coding') }]
        },
        {
          id: 'focus:start-writing',
          provider: 'focus',
          group: 'Raycast Focus',
          title: 'Start Focus: Writing (25 min)',
          subtitle: 'Launch dedicated writing sprint',
          category: 'Writing',
          durationMinutes: 25,
          icon: { kind: 'glyph', name: 'notes' },
          actions: [{ id: 'start', title: 'Start Writing Session', shortcut: '↵', run: () => focus.start(25, 'Writing') }]
        }
      ];
    },
    search(query) {
      const q = String(query || '').trim().toLowerCase();
      if (!/focus|pomo|pomodoro|timer|deep\s*work/i.test(q)) return [];

      const st = focus.getStatus();
      return [
        {
          id: 'focus:toggle',
          provider: 'focus',
          group: 'Raycast Focus',
          title: st.state === 'active' ? `Pause Focus Session (${st.remainingFormatted})` : (st.state === 'paused' ? `Resume Focus Session (${st.remainingFormatted})` : 'Start Focus Session (25 min)'),
          subtitle: `Category: ${st.category} · State: ${st.state.toUpperCase()} · ${st.progressPercent}% progress`,
          state: st.state,
          remainingFormatted: st.remainingFormatted,
          category: st.category,
          progressPercent: st.progressPercent,
          stats: st.stats,
          scoreBoost: 250,
          icon: { kind: 'glyph', name: 'bolt' },
          actions: [
            { id: 'toggle', title: st.state === 'active' ? 'Pause' : 'Start Focus', shortcut: '↵', run: () => focus.toggle() },
            { id: 'complete', title: 'Complete Session', shortcut: 'Ctrl+Shift+C', run: () => focus.complete() },
            { id: 'reset', title: 'Reset Session', shortcut: 'Ctrl+R', run: () => focus.reset() }
          ]
        },
        {
          id: 'focus:start-25',
          provider: 'focus',
          group: 'Raycast Focus',
          title: 'Start 25-minute Pomodoro',
          subtitle: 'Standard productivity interval',
          scoreBoost: 220,
          icon: { kind: 'glyph', name: 'bolt' },
          actions: [{ id: 'start', title: 'Start', shortcut: '↵', run: () => focus.start(25, 'Work') }]
        },
        {
          id: 'focus:start-50',
          provider: 'focus',
          group: 'Raycast Focus',
          title: 'Start 50-minute Deep Work',
          subtitle: 'Extended concentration session',
          scoreBoost: 210,
          icon: { kind: 'glyph', name: 'bolt' },
          actions: [{ id: 'start', title: 'Start', shortcut: '↵', run: () => focus.start(50, 'Work') }]
        }
      ];
    }
  };
}

// ============================================================ provider: calendar

function calendarProvider() {
  return {
    id: 'calendar',
    name: 'Calendar',
    group: 'Calendar',
    warm: calendar.load,
    all: () => {
      const evts = calendar.getEvents();
      const items = evts.map((e) => {
        const d = new Date(e.start);
        const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return {
          id: `cal:${e.id}`,
          provider: 'calendar',
          group: 'Calendar',
          title: e.title,
          subtitle: `${timeStr} · ${e.platform || 'Meeting'} (${e.location || 'Virtual'})`,
          dateFormatted: `${d.toLocaleDateString()} ${timeStr}`,
          platform: e.platform,
          meetingUrl: e.meetingUrl,
          notes: e.notes,
          icon: { kind: 'glyph', name: 'bell' },
          actions: [
            ...(e.meetingUrl ? [{ id: 'join', title: `Join ${e.platform}`, shortcut: '↵', run: () => shell.openExternal(e.meetingUrl) }] : []),
            ...(e.meetingUrl ? [{ id: 'copy-link', title: 'Copy Meeting Link', shortcut: 'Ctrl+C', run: () => clipboard.writeText(e.meetingUrl) }] : []),
            { id: 'delete', title: 'Delete Event', shortcut: 'Ctrl+D', run: () => calendar.deleteEvent(e.id) }
          ]
        };
      });

      // Check if clipboard contains meeting link
      const clipMeeting = calendar.detectClipboardMeetingUrl();
      if (clipMeeting) {
        items.unshift({
          id: 'cal:quick-join-clip',
          provider: 'calendar',
          group: 'Calendar',
          title: 'Quick Join Meeting (from Clipboard)',
          subtitle: clipMeeting,
          meetingUrl: clipMeeting,
          platform: calendar.detectMeetingPlatform(clipMeeting),
          scoreBoost: 270,
          icon: { kind: 'glyph', name: 'monitor' },
          actions: [
            { id: 'join', title: 'Join Meeting Now', shortcut: '↵', run: () => shell.openExternal(clipMeeting) },
            { id: 'copy', title: 'Copy Link', shortcut: 'Ctrl+C', run: () => clipboard.writeText(clipMeeting) }
          ]
        });
      }

      return items;
    },
    search(query) {
      const q = String(query || '').trim();
      if (!q) return [];
      const items = [];

      // Check if user is searching general calendar commands
      if (/^(?:calendar|schedule|meeting|quick\s*join)/i.test(q)) {
        items.push({
          id: 'cal:quick-join',
          provider: 'calendar',
          group: 'Calendar',
          title: 'Quick Join Next Meeting',
          subtitle: 'Join the next scheduled conference call or clipboard meeting link',
          scoreBoost: 260,
          icon: { kind: 'glyph', name: 'monitor' },
          actions: [
            { id: 'join', title: 'Join Next Meeting', shortcut: '↵', run: () => calendar.quickJoin() }
          ]
        });
        items.push({
          id: 'cal:my-schedule',
          provider: 'calendar',
          group: 'Calendar',
          title: 'My Schedule',
          subtitle: 'Check upcoming meetings and schedule',
          scoreBoost: 250,
          icon: { kind: 'glyph', name: 'bell' },
          actions: [
            { id: 'view', title: 'View Schedule', shortcut: '↵', run: () => ({ hide: false }) }
          ]
        });
      }

      // Search existing events
      const all = calendar.getEvents();
      for (const e of all) {
        if (e.title.toLowerCase().includes(q.toLowerCase()) || (e.platform && e.platform.toLowerCase().includes(q.toLowerCase()))) {
          const d = new Date(e.start);
          const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          items.push({
            id: `cal:${e.id}`,
            provider: 'calendar',
            group: 'Calendar',
            title: e.title,
            subtitle: `${timeStr} · ${e.platform || 'Meeting'} (${e.location || 'Virtual'})`,
            dateFormatted: `${d.toLocaleDateString()} ${timeStr}`,
            platform: e.platform,
            meetingUrl: e.meetingUrl,
            notes: e.notes,
            icon: { kind: 'glyph', name: 'bell' },
            scoreBoost: 190,
            actions: [
              ...(e.meetingUrl ? [{ id: 'join', title: `Join ${e.platform}`, shortcut: '↵', run: () => shell.openExternal(e.meetingUrl) }] : []),
              ...(e.meetingUrl ? [{ id: 'copy-link', title: 'Copy Link', shortcut: 'Ctrl+C', run: () => clipboard.writeText(e.meetingUrl) }] : []),
              { id: 'delete', title: 'Delete Event', shortcut: 'Ctrl+D', run: () => calendar.deleteEvent(e.id) }
            ]
          });
        }
      }

      return items;
    }
  };
}

// ============================================================ provider: mcp

function mcpProvider() {
  return {
    id: 'mcp',
    name: 'MCP',
    group: 'MCP',
    warm: mcp.load,
    all: () => {
      const servers = mcp.getServers();
      return servers.map((s) => ({
        id: `mcp:server:${s.id}`,
        provider: 'mcp',
        group: 'MCP',
        title: s.name,
        subtitle: `${s.enabled ? '● Connected' : '○ Disabled'} · ${s.transport} · ${(s.tools || []).length} tools`,
        description: s.description,
        serverName: s.name,
        transport: s.transport,
        tools: s.tools,
        icon: { kind: 'glyph', name: 'terminal' },
        actions: [
          { id: 'toggle', title: s.enabled ? 'Disable Server' : 'Enable Server', shortcut: '↵', run: () => mcp.toggleServer(s.id) },
          { id: 'copy-cmd', title: 'Copy Server Launch Command', shortcut: 'Ctrl+C', run: () => clipboard.writeText(`${s.command} ${(s.args || []).join(' ')}`) }
        ]
      }));
    },
    search(query) {
      const q = String(query || '').trim().toLowerCase();
      if (!q) return [];
      const items = [];

      // If user types "mcp" or tool name
      const tools = mcp.getAllTools();
      for (const t of tools) {
        if (t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q) || q.startsWith('mcp')) {
          items.push({
            id: `mcp:tool:${t.name}`,
            provider: 'mcp',
            group: 'MCP',
            title: `MCP Tool: ${t.name}`,
            subtitle: `${t.serverName} · ${t.description}`,
            description: t.description,
            serverName: t.serverName,
            icon: { kind: 'glyph', name: 'terminal' },
            scoreBoost: 200,
            actions: [
              {
                id: 'call',
                title: `Call ${t.name}`,
                shortcut: '↵',
                run: async () => {
                  return await mcp.callTool(t.name, {});
                }
              },
              {
                id: 'copy-schema',
                title: 'Copy Tool JSON Schema',
                shortcut: 'Ctrl+C',
                run: () => clipboard.writeText(JSON.stringify(t.inputSchema || {}, null, 2))
              }
            ]
          });
        }
      }

      return items;
    }
  };
}

// ============================================================ provider: contacts

function contactsProvider() {
  return {
    id: 'contacts',
    name: 'Contacts',
    group: 'Contacts',
    warm: contacts.load,
    all: () => {
      const all = contacts.getContacts();
      return all.slice(0, 8).map((c) => ({
        id: `contact:${c.id}`,
        provider: 'contacts',
        group: 'Contacts',
        title: c.name,
        subtitle: `${c.role || ''} · ${c.company || ''} · ${c.email}`,
        company: c.company,
        role: c.role,
        email: c.email,
        phone: c.phone,
        notes: c.notes,
        icon: { kind: 'glyph', name: 'app' },
        actions: [
          { id: 'copy-email', title: 'Copy Email', shortcut: '↵', run: () => clipboard.writeText(c.email) },
          { id: 'send-email', title: 'Send Email', shortcut: 'Ctrl+E', run: () => shell.openExternal(`mailto:${c.email}`) },
          { id: 'copy-phone', title: 'Copy Phone', shortcut: 'Ctrl+P', run: () => clipboard.writeText(c.phone) }
        ]
      }));
    },
    search(query) {
      const q = String(query || '').trim();
      if (!q) return [];
      const isPrefixed = q.toLowerCase().startsWith('contact');
      const clean = q.replace(/^contact(?::|\s*)/i, '').trim();

      const matches = contacts.searchContacts(clean || q);
      return matches.map((c) => ({
        id: `contact:${c.id}`,
        provider: 'contacts',
        group: 'Contacts',
        title: c.name,
        subtitle: `${c.role || ''} · ${c.company || ''} · ${c.email}`,
        company: c.company,
        role: c.role,
        email: c.email,
        phone: c.phone,
        notes: c.notes,
        icon: { kind: 'glyph', name: 'app' },
        scoreBoost: isPrefixed ? 220 : 50,
        actions: [
          { id: 'copy-email', title: 'Copy Email', shortcut: '↵', run: () => clipboard.writeText(c.email) },
          { id: 'send-email', title: 'Send Email', shortcut: 'Ctrl+E', run: () => shell.openExternal(`mailto:${c.email}`) },
          { id: 'copy-phone', title: 'Copy Phone', shortcut: 'Ctrl+P', run: () => clipboard.writeText(c.phone) }
        ]
      }));
    }
  };
}

// ============================================================ provider: windows-run

function windowsRunProvider() {
  return {
    id: 'windows-run',
    name: 'Run',
    group: 'Run',
    all: () => [
      {
        id: 'run:dialog',
        provider: 'windows-run',
        group: 'Run',
        title: 'Open Run: Execute Shell Commands & Binaries',
        subtitle: 'Prefix queries with ">" to run Windows executables, cpl, or msc tools',
        icon: { kind: 'glyph', name: 'terminal' },
        actions: [
          {
            id: 'open',
            title: 'Open Run Prompt',
            shortcut: '↵',
            run: () => windowsRun.execute('cmd.exe')
          }
        ]
      }
    ],
    search(query) {
      const q = String(query || '').trim();
      if (!q.startsWith('>') && !/^run\s+/i.test(q)) return [];

      const results = windowsRun.searchRun(q);
      return results.map((r) => ({
        id: r.id,
        provider: 'windows-run',
        group: 'Run',
        title: r.title,
        subtitle: r.description || `Execute "${r.command}"`,
        command: r.command,
        description: r.description,
        scoreBoost: 260,
        icon: { kind: 'glyph', name: 'terminal' },
        actions: [
          {
            id: 'exec',
            title: `Run "${r.command}"`,
            shortcut: '↵',
            run: () => windowsRun.execute(r.command, false)
          },
          {
            id: 'exec-admin',
            title: 'Run as Administrator',
            shortcut: 'Ctrl+Shift+↵',
            run: () => windowsRun.execute(r.command, true)
          },
          {
            id: 'copy',
            title: 'Copy Command',
            shortcut: 'Ctrl+C',
            run: () => clipboard.writeText(r.command)
          }
        ]
      }));
    }
  };
}

// ============================================================ provider: typing practice

function typingPracticeProvider() {
  return {
    id: 'typing',
    name: 'Typing Practice',
    group: 'Typing Practice',
    all: () => [
      {
        id: 'typing:start',
        provider: 'typing',
        group: 'Typing Practice',
        title: 'Start Typing Practice',
        subtitle: `Train typing speed & accuracy · Best: ${typingPractice.getBestScore().wpm} WPM`,
        icon: { kind: 'glyph', name: 'code' },
        actions: [
          {
            id: 'start',
            title: 'Start Practice Session',
            shortcut: '↵',
            run: () => typingPractice.startSession()
          }
        ]
      }
    ],
    search(query) {
      const q = String(query || '').trim().toLowerCase();
      if (!/typing|wpm|speed\s*test/i.test(q)) return [];

      const session = typingPractice.startSession();
      const best = typingPractice.getBestScore();

      return [
        {
          id: 'typing:session',
          provider: 'typing',
          group: 'Typing Practice',
          title: `Typing Practice: "${session.text}"`,
          subtitle: `— ${session.author} · High Score: ${best.wpm} WPM (${best.accuracy}% accuracy)`,
          passageText: session.text,
          author: session.author,
          bestScore: best,
          icon: { kind: 'glyph', name: 'code' },
          scoreBoost: 240,
          actions: [
            {
              id: 'copy',
              title: 'Copy Quote Text',
              shortcut: '↵',
              run: () => clipboard.writeText(`"${session.text}" — ${session.author}`)
            },
            {
              id: 'next',
              title: 'Next Quote',
              shortcut: 'Ctrl+N',
              run: () => typingPractice.startSession()
            }
          ]
        }
      ];
    }
  };
}

// ============================================================ provider: weather

function weatherProvider() {
  return {
    id: 'weather',
    name: 'Weather',
    group: 'Weather',
    all: () => [
      {
        id: 'weather:open',
        provider: 'weather',
        group: 'Weather',
        title: 'Weather Forecast & Flight Tracker',
        subtitle: 'Search "weather <city>" or "flight <number>"',
        icon: { kind: 'glyph', name: 'globe' },
        actions: [
          {
            id: 'view',
            title: 'Check Local Weather',
            shortcut: '↵',
            run: async () => {
              const res = await weather.getWeather('Local');
              if (res.ok) clipboard.writeText(`${res.city}: ${res.tempC}°C (${res.tempF}°F), ${res.condition}`);
              return res;
            }
          }
        ]
      }
    ],
    async search(query) {
      const q = String(query || '').trim();
      const items = [];

      // Weather search
      const wMatch = q.match(/^(?:weather(?:\s+in|\s+for)?)\s*(.*)$/i);
      if (wMatch) {
        const city = wMatch[1].trim() || 'New York';
        const res = await weather.getWeather(city);
        if (res.ok) {
          items.push({
            id: `weather:${res.city}`,
            provider: 'weather',
            group: 'Weather',
            title: `${res.city} — ${res.tempC}°C (${res.tempF}°F)`,
            subtitle: `${res.icon || '⛅'} ${res.condition} · Humidity: ${res.humidity}% · Wind: ${res.windKm} km/h`,
            city: res.city,
            tempFormatted: `${res.tempC}°C / ${res.tempF}°F`,
            condition: res.condition,
            humidity: `${res.humidity}%`,
            wind: `${res.windKm} km/h`,
            scoreBoost: 250,
            icon: { kind: 'glyph', name: 'globe' },
            actions: [
              {
                id: 'copy',
                title: 'Copy Weather Forecast',
                shortcut: '↵',
                run: () => clipboard.writeText(`${res.city}: ${res.tempC}°C (${res.tempF}°F), ${res.condition}`)
              }
            ]
          });
        }
      }

      // Flight tracker search
      const fMatch = q.match(/^(?:flight)\s+(.+)$/i);
      if (fMatch) {
        const fl = weather.getFlight(fMatch[1].trim());
        if (fl.ok && fl.flight) {
          const f = fl.flight;
          items.push({
            id: `flight:${f.flight}`,
            provider: 'weather',
            group: 'Weather',
            title: `${f.airline} ${f.flight}: ${f.from} → ${f.to}`,
            subtitle: `Status: ${f.status} · ETA: ${f.eta} · Aircraft: ${f.aircraft}`,
            scoreBoost: 250,
            icon: { kind: 'glyph', name: 'globe' },
            actions: [
              {
                id: 'copy',
                title: 'Copy Flight Details',
                shortcut: '↵',
                run: () => clipboard.writeText(`${f.airline} ${f.flight}: ${f.from} -> ${f.to} (${f.status})`)
              }
            ]
          });
        }
      }

      return items;
    }
  };
}

// ============================================================ provider: navigation

function navigationProvider() {
  return {
    id: 'navigation',
    name: 'Navigation',
    group: 'Navigation',
    warm: navigation.fetchWindows,
    all: () => {
      const wins = navigation.getWindowsSync();
      return wins.slice(0, 10).map((w) => ({
        id: `win:${w.handle}`,
        provider: 'navigation',
        group: 'Navigation',
        title: w.title,
        subtitle: `App: ${w.processName} · PID: ${w.pid}`,
        processName: w.processName,
        pid: w.pid,
        icon: { kind: 'glyph', name: 'app' },
        actions: [
          { id: 'switch', title: `Switch to ${w.title}`, shortcut: '↵', run: () => navigation.focusWindow(w.handle) },
          { id: 'close', title: 'Close Window', shortcut: 'Ctrl+W', run: () => navigation.closeWindow(w.handle) }
        ]
      }));
    },
    search(query) {
      const q = String(query || '').trim().toLowerCase();
      if (!q) return [];
      const isSwitchQuery = q.startsWith('switch') || q.startsWith('win ') || q.startsWith('window ');
      const filter = isSwitchQuery ? q.replace(/^(switch|win|window)\s*/i, '').trim() : q;

      const wins = navigation.getWindowsSync();
      const matches = isSwitchQuery
        ? (filter ? wins.filter((w) => w.title.toLowerCase().includes(filter) || w.processName.toLowerCase().includes(filter)) : wins)
        : wins.filter((w) => w.title.toLowerCase().includes(q) || w.processName.toLowerCase().includes(q)).slice(0, 5);

      return matches.map((w) => ({
        id: `win:${w.handle}`,
        provider: 'navigation',
        group: 'Navigation',
        title: w.title,
        subtitle: `App: ${w.processName} · PID: ${w.pid}`,
        processName: w.processName,
        pid: w.pid,
        scoreBoost: isSwitchQuery ? 220 : 30,
        icon: { kind: 'glyph', name: 'app' },
        actions: [
          { id: 'switch', title: `Switch to ${w.title}`, shortcut: '↵', run: () => navigation.focusWindow(w.handle) },
          { id: 'close', title: 'Close Window', shortcut: 'Ctrl+W', run: () => navigation.closeWindow(w.handle) }
        ]
      }));
    }
  };
}

// ============================================================ provider: screen awareness

function screenAwarenessProvider() {
  return {
    id: 'screen-awareness',
    name: 'Screen Awareness',
    group: 'Screen Awareness',
    all: () => [
      {
        id: 'screen:ocr',
        provider: 'screen-awareness',
        group: 'Screen Awareness',
        title: 'Screen OCR: Extract Text from Screen',
        subtitle: 'Extract text from active display or recent screenshot and copy to clipboard',
        icon: { kind: 'glyph', name: 'monitor' },
        actions: [
          {
            id: 'run-ocr',
            title: 'Extract Text Now',
            shortcut: '↵',
            run: async () => {
              const res = await screenAwareness.runOcr();
              return { hide: true, output: res.text };
            }
          }
        ]
      },
      {
        id: 'screen:paste-latest',
        provider: 'screen-awareness',
        group: 'Screen Awareness',
        title: 'Paste Latest Screenshot',
        subtitle: 'Quickly paste the most recent screenshot into the frontmost app',
        icon: { kind: 'glyph', name: 'file' },
        actions: [
          {
            id: 'paste',
            title: 'Paste Latest Screenshot',
            shortcut: '↵',
            run: () => screenAwareness.pasteLatestScreenshot()
          }
        ]
      },
      {
        id: 'screen:capture',
        provider: 'screen-awareness',
        group: 'Screen Awareness',
        title: 'Take Screenshot (Snipping Tool)',
        subtitle: 'Capture screen region or window with Windows Snipping Tool',
        icon: { kind: 'glyph', name: 'monitor' },
        actions: [
          {
            id: 'capture',
            title: 'Take Screenshot',
            shortcut: '↵',
            run: () => screenAwareness.takeScreenshot()
          }
        ]
      }
    ],
    search(query) {
      const q = String(query || '').trim().toLowerCase();
      if (!/screen|shot|ocr|snip|capture/i.test(q)) return [];

      const items = [
        {
          id: 'screen:ocr',
          provider: 'screen-awareness',
          group: 'Screen Awareness',
          title: 'Screen OCR: Extract Text from Screen',
          subtitle: 'Extract text from active display or recent screenshot and copy to clipboard',
          scoreBoost: 260,
          icon: { kind: 'glyph', name: 'monitor' },
          actions: [
            {
              id: 'run-ocr',
              title: 'Extract Text Now',
              shortcut: '↵',
              run: async () => {
                const res = await screenAwareness.runOcr();
                return { hide: true, output: res.text };
              }
            }
          ]
        },
        {
          id: 'screen:paste-latest',
          provider: 'screen-awareness',
          group: 'Screen Awareness',
          title: 'Paste Latest Screenshot',
          subtitle: 'Quickly paste the most recent screenshot into the frontmost app',
          scoreBoost: 250,
          icon: { kind: 'glyph', name: 'file' },
          actions: [
            {
              id: 'paste',
              title: 'Paste Latest Screenshot',
              shortcut: '↵',
              run: () => screenAwareness.pasteLatestScreenshot()
            }
          ]
        },
        {
          id: 'screen:capture',
          provider: 'screen-awareness',
          group: 'Screen Awareness',
          title: 'Take Screenshot (Snipping Tool)',
          subtitle: 'Capture screen region or window with Windows Snipping Tool',
          scoreBoost: 240,
          icon: { kind: 'glyph', name: 'monitor' },
          actions: [
            {
              id: 'capture',
              title: 'Take Screenshot',
              shortcut: '↵',
              run: () => screenAwareness.takeScreenshot()
            }
          ]
        }
      ];
      const shots = screenAwareness.getRecentScreenshots(4);
      for (const s of shots) {
        items.push({
          id: `shot:${s.path}`,
          provider: 'screen-awareness',
          group: 'Screen Awareness',
          title: `Screenshot: ${s.name}`,
          subtitle: `${s.date} · Click to copy or OCR`,
          filePath: s.path,
          scoreBoost: 200,
          icon: { kind: 'glyph', name: 'file' },
          actions: [
            {
              id: 'copy-ocr',
              title: 'Extract Text via OCR',
              shortcut: '↵',
              run: async () => {
                const res = await screenAwareness.runOcr(s.path);
                return { hide: true, output: res.text };
              }
            },
            {
              id: 'copy-path',
              title: 'Copy Image Path',
              shortcut: 'Ctrl+Shift+C',
              run: () => clipboard.writeText(s.path)
            },
            {
              id: 'open',
              title: 'Open in Explorer',
              shortcut: 'Ctrl+O',
              run: () => shell.openPath(s.path)
            }
          ]
        });
      }
      return items;
    }
  };
}

function systemProvider() {
  const items = SYSTEM_COMMANDS.map(([key, title, subgroup, run]) => ({
    id: `sys:${key}`,
    provider: 'system',
    group: 'Commands',
    subgroup,
    title,
    subtitle: subgroup,
    keywords: [key, subgroup.toLowerCase()],
    icon: { kind: 'glyph', name: key },
    actions: [{ id: 'run', title, shortcut: '↵', run }]
  }));

  items.push({
    id: 'sys:data-folder',
    provider: 'system',
    group: 'Commands',
    subgroup: 'Rayclone',
    title: 'Open Data Folder',
    subtitle: 'Rayclone',
    icon: { kind: 'glyph', name: 'folder' },
    actions: [{ id: 'run', title: 'Open Data Folder', shortcut: '↵', run: () => shell.openPath(app.getPath('userData')) }]
  });

  items.push({
    id: 'sys:scripts-folder',
    provider: 'system',
    group: 'Commands',
    subgroup: 'Rayclone',
    title: 'Open Scripts Folder',
    subtitle: 'Rayclone Custom Scripts',
    icon: { kind: 'glyph', name: 'code' },
    actions: [{ id: 'run', title: 'Open Scripts Folder', shortcut: '↵', run: () => shell.openPath(settings.getSettings().scriptsDir) }]
  });

  items.push({
    id: 'sys:settings',
    provider: 'system',
    group: 'Commands',
    subgroup: 'Rayclone',
    title: 'Open Settings',
    subtitle: 'Preferences & Hotkeys',
    icon: { kind: 'glyph', name: 'theme' },
    actions: [{ id: 'run', title: 'Open Settings', shortcut: '↵', run: () => ({ openSettings: true }) }]
  });

  items.push({
    id: 'sys:confetti',
    provider: 'system',
    group: 'Commands',
    subgroup: 'Rayclone',
    title: 'Confetti',
    subtitle: 'Raycast Celebration Particles',
    keywords: ['confetti', 'celebrate', 'party', 'fun'],
    icon: { kind: 'glyph', name: 'sparkle' },
    actions: [{ id: 'run', title: 'Celebrate with Confetti', shortcut: '↵', run: () => ({ confetti: true, hide: false }) }]
  });

  items.push({
    id: 'sys:toggle-taskbar',
    provider: 'system',
    group: 'Commands',
    subgroup: 'Window Management',
    title: 'Toggle Taskbar',
    subtitle: 'Windows Taskbar Visibility',
    keywords: ['taskbar', 'toggle taskbar', 'hide taskbar', 'show taskbar'],
    icon: { kind: 'glyph', name: 'monitor' },
    actions: [{ id: 'run', title: 'Toggle Taskbar', shortcut: '↵', run: () => sysControls.toggleTaskbar() }]
  });

  items.push({
    id: 'sys:uninstall-apps',
    provider: 'system',
    group: 'Commands',
    subgroup: 'System Settings',
    title: 'Uninstall Applications',
    subtitle: 'Windows Installed Apps & Features',
    keywords: ['uninstall', 'remove program', 'installed apps', 'add or remove'],
    icon: { kind: 'glyph', name: 'trash' },
    actions: [{ id: 'run', title: 'Open Installed Apps', shortcut: '↵', run: () => sysControls.uninstallApplications() }]
  });

  items.push({
    id: 'sys:export-data',
    provider: 'system',
    group: 'Commands',
    subgroup: 'Rayclone',
    title: 'Export Settings & Data',
    subtitle: 'Backup notes, snippets, settings and history',
    keywords: ['backup', 'export', 'export data', 'export settings'],
    icon: { kind: 'glyph', name: 'download' },
    actions: [{ id: 'run', title: 'Export Data', shortcut: '↵', run: () => sysControls.exportData() }]
  });

  items.push({
    id: 'sys:import-data',
    provider: 'system',
    group: 'Commands',
    subgroup: 'Rayclone',
    title: 'Import Settings & Data',
    subtitle: 'Restore notes, snippets and settings from backup JSON',
    keywords: ['restore', 'import', 'import data', 'import settings'],
    icon: { kind: 'glyph', name: 'download' },
    actions: [{ id: 'run', title: 'Import Data', shortcut: '↵', run: () => {
      const backupPath = path.join(os.homedir(), 'Downloads', 'rayclone-backup.json');
      return sysControls.importData(backupPath);
    } }]
  });

  return {
    id: 'system',
    name: 'Commands',
    group: 'Commands',
    all: () => items,
    search: () => items
  };
}

// ============================================================ provider: dictation

function dictationProvider() {
  return {
    id: 'dictation',
    name: 'Dictation',
    group: 'Dictation',
    all: () => [
      {
        id: 'dictation:dictate',
        provider: 'dictation',
        group: 'Dictation',
        title: 'Dictate (Speech to Text)',
        subtitle: 'Dictate text and paste it into the active application (Win+H)',
        icon: { kind: 'glyph', name: 'speaker' },
        actions: [
          {
            id: 'start-dictation',
            title: 'Start Dictation (Win+H)',
            shortcut: '↵',
            run: () => dictation.dictateText()
          }
        ]
      },
      {
        id: 'dictation:to-ai',
        provider: 'dictation',
        group: 'Dictation',
        title: 'Dictate to AI',
        subtitle: 'Dictate a prompt and send it to Raycast AI Assistant',
        icon: { kind: 'glyph', name: 'sparkle' },
        actions: [
          {
            id: 'dictate-ai',
            title: 'Dictate Prompt to AI',
            shortcut: '↵',
            run: () => dictation.dictateToAi()
          }
        ]
      },
      {
        id: 'dictation:to-note',
        provider: 'dictation',
        group: 'Dictation',
        title: 'Dictate to Note',
        subtitle: 'Dictate text and append it to your Floating Notes scratchpad',
        icon: { kind: 'glyph', name: 'notes' },
        actions: [
          {
            id: 'dictate-note',
            title: 'Dictate into Note',
            shortcut: '↵',
            run: () => dictation.dictateToNote()
          }
        ]
      },
      {
        id: 'dictation:copy-last',
        provider: 'dictation',
        group: 'Dictation',
        title: 'Copy Last Transcription',
        subtitle: 'Copy the most recent voice transcription to the clipboard',
        icon: { kind: 'glyph', name: 'clipboard' },
        actions: [
          {
            id: 'copy-last',
            title: 'Copy Transcription',
            shortcut: '↵',
            run: () => dictation.copyLastTranscription()
          }
        ]
      }
    ],
    search(query) {
      const q = String(query || '').trim().toLowerCase();
      if (!/speech|voice|dictat|transcrib|mic|\bstt\b/i.test(q)) return [];

      const items = [
        {
          id: 'dictation:dictate',
          provider: 'dictation',
          group: 'Dictation',
          title: 'Dictate (Speech to Text)',
          subtitle: 'Dictate text and paste it into the active application (Win+H)',
          scoreBoost: 260,
          icon: { kind: 'glyph', name: 'speaker' },
          actions: [
            { id: 'start-dictation', title: 'Start Dictation (Win+H)', shortcut: '↵', run: () => dictation.dictateText() }
          ]
        },
        {
          id: 'dictation:to-ai',
          provider: 'dictation',
          group: 'Dictation',
          title: 'Dictate to AI',
          subtitle: 'Dictate a prompt and send it to Raycast AI Assistant',
          scoreBoost: 240,
          icon: { kind: 'glyph', name: 'sparkle' },
          actions: [
            { id: 'dictate-ai', title: 'Dictate Prompt to AI', shortcut: '↵', run: () => dictation.dictateToAi() }
          ]
        },
        {
          id: 'dictation:to-note',
          provider: 'dictation',
          group: 'Dictation',
          title: 'Dictate to Note',
          subtitle: 'Dictate text and append it to your Floating Notes scratchpad',
          scoreBoost: 230,
          icon: { kind: 'glyph', name: 'notes' },
          actions: [
            { id: 'dictate-note', title: 'Dictate into Note', shortcut: '↵', run: () => dictation.dictateToNote() }
          ]
        },
        {
          id: 'dictation:copy-last',
          provider: 'dictation',
          group: 'Dictation',
          title: 'Copy Last Transcription',
          subtitle: 'Copy the most recent voice transcription to clipboard',
          scoreBoost: 220,
          icon: { kind: 'glyph', name: 'clipboard' },
          actions: [
            { id: 'copy-last', title: 'Copy Transcription', shortcut: '↵', run: () => dictation.copyLastTranscription() }
          ]
        }
      ];

      const history = dictation.getTranscriptions();
      for (const t of history.slice(0, 3)) {
        items.push({
          id: `dictation:hist:${t.id}`,
          provider: 'dictation',
          group: 'Dictation',
          title: `Transcription: "${t.text.slice(0, 50)}${t.text.length > 50 ? '...' : ''}"`,
          subtitle: `${t.source} · ${new Date(t.timestamp).toLocaleTimeString()}`,
          fullText: t.text,
          source: t.source,
          timestamp: new Date(t.timestamp).toLocaleTimeString(),
          scoreBoost: 190,
          icon: { kind: 'glyph', name: 'speaker' },
          actions: [
            { id: 'copy', title: 'Copy Transcription', shortcut: '↵', run: () => {
              if (clipboard && typeof clipboard.writeText === 'function') clipboard.writeText(t.text);
              return { ok: true, text: t.text };
            } }
          ]
        });
      }

      return items;
    }
  };
}

// ============================================================ provider: games

function gamesProvider() {
  return {
    id: 'games',
    name: 'Games',
    group: 'Games',
    warm: games.getInstalledGames,
    all: () => {
      const all = games.searchGames('');
      return all.map((g) => ({
        id: `game:${g.id}`,
        provider: 'games',
        group: 'Games',
        title: g.title,
        subtitle: `${g.platform} · ${g.genre || 'Game'} · ${g.description || ''}`,
        platform: g.platform,
        genre: g.genre,
        description: g.description,
        launchUrl: g.launchUrl || g.url,
        icon: { kind: 'glyph', name: 'app' },
        actions: [
          { id: 'launch', title: `Launch ${g.title}`, shortcut: '↵', run: () => games.launchGame(g) }
        ]
      }));
    },
    search(query) {
      const q = String(query || '').trim();
      if (!q) return [];
      const matches = games.searchGames(q);
      const isPrefixed = /^game/i.test(q);
      return matches.map((g) => ({
        id: `game:${g.id}`,
        provider: 'games',
        group: 'Games',
        title: g.title,
        subtitle: `${g.platform} · ${g.genre || 'Game'} · ${g.description || ''}`,
        platform: g.platform,
        genre: g.genre,
        description: g.description,
        launchUrl: g.launchUrl || g.url,
        scoreBoost: isPrefixed ? 240 : 120,
        icon: { kind: 'glyph', name: 'app' },
        actions: [
          { id: 'launch', title: `Launch ${g.title}`, shortcut: '↵', run: () => games.launchGame(g) }
        ]
      }));
    }
  };
}

// ============================================================ Port & Socket Inspector (M1)

function portInspectorProvider() {
  function toItem(p, isExplicit) {
    const procLabel = p.processName && p.processName !== 'Unknown' ? p.processName : `PID ${p.pid}`;
    return {
      id: `port:${p.port}`,
      provider: 'ports',
      group: 'Listening Ports',
      title: `Port ${p.port} (${procLabel})`,
      subtitle: `PID: ${p.pid} · ${p.address} · ${p.state || 'LISTENING'}`,
      keywords: ['port', 'kill port', 'killport', 'listen', 'socket', String(p.port), String(p.pid), p.processName],
      scoreBoost: isExplicit ? 260 : 160,
      icon: { kind: 'glyph', name: 'process' },
      port: p.port,
      pid: p.pid,
      processName: p.processName,
      commandLine: p.commandLine,
      state: p.state || 'LISTENING',
      address: p.address,
      memory: p.memory,
      portData: {
        port: p.port,
        pid: p.pid,
        processName: p.processName,
        commandLine: p.commandLine
      },
      actions: [
        {
          id: 'kill',
          title: `Kill Process on Port ${p.port} (${procLabel})`,
          shortcut: '↵',
          run: () => portInspector.killPort(p.port)
        },
        {
          id: 'copy-pid',
          title: `Copy PID (${p.pid})`,
          shortcut: 'Ctrl+C',
          run: () => {
            if (clipboard && typeof clipboard.writeText === 'function') {
              clipboard.writeText(String(p.pid));
            }
            return Promise.resolve(p.pid);
          }
        },
        {
          id: 'copy-port',
          title: `Copy Port (${p.port})`,
          shortcut: 'Ctrl+Shift+C',
          run: () => {
            if (clipboard && typeof clipboard.writeText === 'function') {
              clipboard.writeText(String(p.port));
            }
            return Promise.resolve(p.port);
          }
        }
      ]
    };
  }

  return {
    id: 'ports',
    name: 'Port Inspector',
    group: 'Listening Ports',
    warm: () => portInspector.scanPorts(),
    all: () => (portInspector.getCachedPorts() || []).map((p) => toItem(p, false)),
    async search(query) {
      const q = String(query || '').trim();
      if (!q) return [];

      const portNumMatch = q.match(/^(?:kill\s+port|killport|port)\s*(\d+)?$/i);
      const isKillOnly = q.match(/^kill\s+(\d+)$/i);
      const isPortQuery = /^port\b/i.test(q) || /^kill\s+port\b/i.test(q) || /^killport\b/i.test(q);

      const ports = (portNumMatch || isKillOnly || isPortQuery) ? await portInspector.scanPorts() : (portInspector.getCachedPorts() || []);

      if (portNumMatch) {
        const targetNum = portNumMatch[1];
        if (targetNum) {
          const matched = ports.filter((p) => String(p.port) === targetNum || String(p.port).startsWith(targetNum));
          return matched.map((p) => toItem(p, true));
        }
        return ports.map((p) => toItem(p, true));
      }

      if (isKillOnly) {
        const targetNum = isKillOnly[1];
        const matched = ports.filter((p) => String(p.port) === targetNum || String(p.pid) === targetNum);
        if (matched.length > 0) {
          return matched.map((p) => toItem(p, true));
        }
      }

      if (isPortQuery) {
        const rest = q.replace(/^(?:kill\s+port|killport|port)\s*/i, '').toLowerCase();
        if (!rest) return ports.map((p) => toItem(p, true));
        return ports
          .filter((p) => String(p.port).includes(rest) || String(p.pid).includes(rest) || (p.processName && p.processName.toLowerCase().includes(rest)))
          .map((p) => toItem(p, true));
      }

      return ports
        .filter((p) => String(p.port) === q || (p.processName && p.processName.toLowerCase().includes(q.toLowerCase())))
        .map((p) => toItem(p, false));
    }
  };
}

// ============================================================ Git Repositories Indexer (M1)

function gitRepositoriesProvider() {
  function toItem(r, isPrefixed) {
    const dirtyLabel = r.dirty ? `● dirty (${r.dirtyCount || 1})` : '✓ clean';
    return {
      id: `git:${r.name}:${r.path}`,
      provider: 'git',
      group: 'Git Repositories',
      title: r.name,
      subtitle: `${r.branch} ${dirtyLabel} · ${r.path}`,
      keywords: ['git', 'repo', 'repository', r.name, r.branch],
      scoreBoost: isPrefixed ? 250 : 150,
      icon: { kind: 'glyph', name: 'app' },
      path: r.path,
      name: r.name,
      repoName: r.name,
      branch: r.branch,
      dirty: r.dirty,
      dirtyCount: r.dirtyCount,
      gitData: {
        path: r.path,
        branch: r.branch,
        dirty: r.dirty,
        dirtyCount: r.dirtyCount
      },
      actions: [
        {
          id: 'code',
          title: `Open in VS Code`,
          shortcut: '↵',
          run: () => gitIndexer.openInVSCode(r.path)
        },
        {
          id: 'terminal',
          title: `Open in Terminal`,
          shortcut: 'Ctrl+T',
          run: () => gitIndexer.openInTerminal(r.path)
        },
        {
          id: 'explorer',
          title: `Open in File Explorer`,
          shortcut: 'Ctrl+E',
          run: () => gitIndexer.openInExplorer(r.path)
        }
      ]
    };
  }

  return {
    id: 'git',
    name: 'Git Repositories',
    group: 'Git Repositories',
    warm: () => gitIndexer.scanRepositories(),
    all: () => gitIndexer.getRepositories().map((r) => toItem(r, false)),
    async search(query) {
      const q = String(query || '').trim();
      if (!q) return [];

      let repos = gitIndexer.getRepositories();
      if (!repos || repos.length === 0) {
        repos = await gitIndexer.scanRepositories();
      }

      const isPrefixed = /^git\s+/i.test(q) || /^repo\s+/i.test(q);
      const cleanQ = q.replace(/^(?:git|repo)\s+/i, '').trim().toLowerCase();

      if (q.toLowerCase() === 'git' || q.toLowerCase() === 'repo') {
        return repos.map((r) => toItem(r, true));
      }

      if (!cleanQ) {
        return repos.map((r) => toItem(r, isPrefixed));
      }

      return repos
        .filter((r) => r.name.toLowerCase().includes(cleanQ) || r.branch.toLowerCase().includes(cleanQ) || r.path.toLowerCase().includes(cleanQ))
        .map((r) => toItem(r, isPrefixed));
    }
  };
}

// ============================================================ Docker & Container Manager (M1)

function dockerManagerProvider() {
  return {
    id: 'docker',
    name: 'Docker Manager',
    group: 'Docker Containers',
    warm: () => dockerManager.checkDockerStatus(),
    all: () => [],
    async search(query) {
      const q = String(query || '').trim();
      if (!q) return [];

      const isDockerQuery = /^docker\b/i.test(q) || /^dps\b/i.test(q) || /^container\b/i.test(q);
      if (!isDockerQuery) return [];

      const status = await dockerManager.checkDockerStatus();

      if (!status.running) {
        if (!isDockerQuery) return [];
        return [
          {
            id: 'docker:status:stopped',
            provider: 'docker',
            group: 'Docker Containers',
            title: 'Docker Desktop is stopped',
            subtitle: status.message || 'Docker daemon is not running. Click to launch Docker Desktop.',
            scoreBoost: 260,
            icon: { kind: 'glyph', name: 'process' },
            dockerData: {
              id: 'stopped',
              name: 'Docker Desktop is stopped',
              image: '',
              status: 'stopped',
              ports: ''
            },
            actions: [
              {
                id: 'start-docker',
                title: 'Start Docker Desktop',
                shortcut: '↵',
                run: () => dockerManager.startDockerDesktop()
              }
            ]
          }
        ];
      }

      const containers = await dockerManager.listContainers();
      const term = q.replace(/^(?:docker|dps|container)\s*/i, '').trim().toLowerCase();

      const filtered = term
        ? containers.filter((c) => c.name.toLowerCase().includes(term) || c.image.toLowerCase().includes(term) || c.id.toLowerCase().includes(term))
        : containers;

      return filtered.map((c) => {
        const isRunning = c.running || c.state === 'running';
        const actions = [];
        if (isRunning) {
          actions.push({
            id: 'stop',
            title: `Stop Container (${c.name})`,
            shortcut: '↵',
            run: () => dockerManager.stopContainer(c.id)
          });
          actions.push({
            id: 'restart',
            title: `Restart Container (${c.name})`,
            shortcut: 'Ctrl+R',
            run: () => dockerManager.restartContainer(c.id)
          });
        } else {
          actions.push({
            id: 'start',
            title: `Start Container (${c.name})`,
            shortcut: '↵',
            run: () => dockerManager.startContainer(c.id)
          });
        }
        actions.push({
          id: 'logs',
          title: `View Logs (tail 50)`,
          shortcut: 'Ctrl+L',
          run: () => dockerManager.getContainerLogs(c.id, 50)
        });

        return {
          id: `docker:${c.id}`,
          provider: 'docker',
          group: 'Docker Containers',
          title: `${c.name} (${c.id.slice(0, 12)})`,
          subtitle: `${c.image} · ${c.status || c.state}${c.ports ? ' · ' + c.ports : ''}`,
          scoreBoost: isDockerQuery ? 250 : 160,
          icon: { kind: 'glyph', name: 'process' },
          containerId: c.id,
          image: c.image,
          state: c.state,
          status: c.status,
          ports: c.ports,
          dockerData: {
            id: c.id,
            name: c.name,
            image: c.image,
            status: c.status,
            ports: c.ports
          },
          actions
        };
      });
    }
  };
}

// ============================================================ GitHub / GitLab Shortcuts (M1)

function githubShortcutsProvider() {
  return {
    id: 'github-shortcuts',
    name: 'GitHub / GitLab',
    group: 'GitHub / GitLab',
    warm: () => Promise.all([githubShortcuts.checkGhCli(), githubShortcuts.checkGlabCli()]),
    all: () => [],
    async search(query) {
      const q = String(query || '').trim();
      if (!q) return [];

      const parsed = githubShortcuts.parseQuery(q);
      if (!parsed) return [];

      const isGithub = parsed.platform === 'github';
      const platformName = isGithub ? 'GitHub' : 'GitLab';
      const kindLabels = {
        pr: 'Pull Requests',
        issue: 'Issues',
        repo: isGithub ? 'Repositories' : 'Projects',
        mr: 'Merge Requests'
      };
      const kindLabel = kindLabels[parsed.kind] || parsed.kind.toUpperCase();

      const title = parsed.query
        ? `Search ${platformName} ${kindLabel}: "${parsed.query}"`
        : `Open ${platformName} ${kindLabel}`;

      return [
        {
          id: `${parsed.platform}:${parsed.kind}:${parsed.query || 'dashboard'}`,
          provider: 'github-shortcuts',
          group: 'GitHub / GitLab',
          title,
          subtitle: `Open ${parsed.url}`,
          scoreBoost: 260,
          targetUrl: parsed.url,
          platform: platformName,
          query: parsed.query,
          icon: { kind: 'glyph', name: 'globe' },
          actions: [
            {
              id: 'open',
              title: `Open in Browser`,
              shortcut: '↵',
              run: () => githubShortcuts.openUrl(parsed.url)
            },
            {
              id: 'copy',
              title: `Copy URL`,
              shortcut: 'Ctrl+C',
              run: () => {
                if (clipboard && typeof clipboard.writeText === 'function') {
                  clipboard.writeText(parsed.url);
                }
                return Promise.resolve(parsed.url);
              }
            }
          ]
        }
      ];
    }
  };
}

// ============================================================ Audio Switcher (M2)

function audioSwitcherProvider() {
  function toItem(d, isPrefixed) {
    const isDefaultBadge = d.isDefault ? '✓ Default' : 'Set as default';
    return {
      id: `audio:${d.id}`,
      provider: 'audio',
      group: 'Audio Endpoints',
      title: `${d.name} (${d.type})`,
      subtitle: `${isDefaultBadge} · ${d.id}`,
      keywords: ['audio', 'sound', 'speaker', 'speakers', 'mic', 'microphone', 'headphones', d.name, d.type],
      scoreBoost: isPrefixed ? 260 : 160,
      icon: { kind: 'glyph', name: d.type === 'Recording' ? 'process' : 'app' },
      endpointName: d.name,
      deviceType: d.type,
      isDefault: d.isDefault,
      deviceId: d.id,
      audioData: {
        id: d.id,
        name: d.name,
        type: d.type.toLowerCase(),
        isDefault: d.isDefault
      },
      actions: [
        {
          id: 'set-default',
          title: `Set as Default ${d.type} Device`,
          shortcut: '↵',
          run: () => audioManager.setDefaultDevice(d.id)
        },
        {
          id: 'open-settings',
          title: 'Open Sound Settings',
          shortcut: 'Ctrl+S',
          run: () => audioManager.openSoundSettings()
        },
        {
          id: 'copy-id',
          title: 'Copy Device ID',
          shortcut: 'Ctrl+C',
          run: () => {
            if (clipboard && typeof clipboard.writeText === 'function') {
              clipboard.writeText(d.id);
            }
            return Promise.resolve(d.id);
          }
        }
      ]
    };
  }

  return {
    id: 'audio',
    name: 'Audio Switcher',
    group: 'Audio Endpoints',
    warm: () => audioManager.getDevices(),
    all: () => {
      const cached = audioManager.getCachedEndpoints();
      return [...cached.playback, ...cached.recording].map((d) => toItem(d, false));
    },
    async search(query) {
      const q = String(query || '').trim();
      if (!q) return [];

      const isAudioQuery = /^(?:audio|sound|speaker|speakers|mic|microphone|endpoint|playback|recording):?\s*/i.test(q);
      const devices = isAudioQuery ? await audioManager.getDevices() : audioManager.getCachedEndpoints();
      const allDevs = [...(devices.playback || []), ...(devices.recording || [])];

      if (isAudioQuery) {
        const rest = q.replace(/^(?:audio|sound|speaker|speakers|mic|microphone|endpoint|playback|recording):?\s*/i, '').trim().toLowerCase();
        if (!rest) return allDevs.map((d) => toItem(d, true));
        return allDevs
          .filter((d) => d.name.toLowerCase().includes(rest) || d.type.toLowerCase().includes(rest) || d.id.toLowerCase().includes(rest))
          .map((d) => toItem(d, true));
      }

      if (q.length < 2) return [];

      const cleanQ = q.toLowerCase();
      return allDevs
        .filter((d) => d.name.toLowerCase().includes(cleanQ) || d.type.toLowerCase().includes(cleanQ))
        .map((d) => toItem(d, false));
    }
  };
}

// ============================================================ Windows Services Manager (M2)

function windowsServicesProvider() {
  function toItem(s, isPrefixed) {
    const isRunning = s.status === 'Running';
    const statusBadge = isRunning ? '● Running' : '○ Stopped';
    const actions = [];

    if (isRunning) {
      actions.push({
        id: 'restart',
        title: `Restart Service (${s.displayName || s.name})`,
        shortcut: '↵',
        run: () => servicesManager.controlService(s.name, 'Restart')
      });
      actions.push({
        id: 'stop',
        title: `Stop Service (${s.displayName || s.name})`,
        shortcut: 'Ctrl+S',
        run: () => servicesManager.controlService(s.name, 'Stop')
      });
    } else {
      actions.push({
        id: 'start',
        title: `Start Service (${s.displayName || s.name})`,
        shortcut: '↵',
        run: () => servicesManager.controlService(s.name, 'Start')
      });
    }
    actions.push({
      id: 'copy-name',
      title: `Copy Service Name (${s.name})`,
      shortcut: 'Ctrl+C',
      run: () => {
        if (clipboard && typeof clipboard.writeText === 'function') {
          clipboard.writeText(s.name);
        }
        return Promise.resolve(s.name);
      }
    });

    return {
      id: `service:${s.name}`,
      provider: 'services',
      group: 'Windows Services',
      title: `${s.displayName} (${s.name})`,
      subtitle: `${statusBadge} · Startup: ${s.startType} · ${s.name}`,
      keywords: ['service', 'services', s.name, s.displayName, s.status, s.startType],
      scoreBoost: isPrefixed ? 260 : 150,
      icon: { kind: 'glyph', name: 'process' },
      serviceName: s.name,
      displayName: s.displayName,
      status: s.status,
      startType: s.startType,
      serviceData: {
        name: s.name,
        displayName: s.displayName,
        status: s.status,
        startType: s.startType
      },
      actions
    };
  }

  return {
    id: 'services',
    name: 'Windows Services',
    group: 'Windows Services',
    warm: () => servicesManager.getServices(),
    all: () => servicesManager.getCachedServices().map((s) => toItem(s, false)),
    async search(query) {
      const q = String(query || '').trim();
      if (!q) return [];

      const isPrefixed = /^(?:services?:?|svc:?)\b/i.test(q);
      const cleanQ = q.replace(/^(?:services?:?|svc:?)\s*/i, '').trim().toLowerCase();

      const services = isPrefixed ? await servicesManager.getServices() : (servicesManager.getCachedServices() || []);

      if (isPrefixed) {
        if (!cleanQ) return services.slice(0, 30).map((s) => toItem(s, true));
        return servicesManager.filterServices(services, cleanQ).map((s) => toItem(s, true));
      }

      if (q.length < 3) return [];
      return servicesManager.filterServices(services, cleanQ).map((s) => toItem(s, false));
    }
  };
}

// ============================================================ Environment Variables Manager (M2)

function environmentVariablesProvider() {
  function toItem(e, isPrefixed, isExact = false) {
    const previewVal = e.value.length > 70 ? e.value.slice(0, 67) + '...' : e.value;
    return {
      id: `env:${e.scope}:${e.name}`,
      provider: 'env',
      group: 'Environment Variables',
      title: `${e.name} (${e.scope})`,
      subtitle: `${previewVal || '[empty]'}`,
      keywords: ['env', 'environment', 'variable', 'path', e.name, e.scope],
      scoreBoost: (isPrefixed ? 260 : 150) + (isExact ? 80 : 0),
      icon: { kind: 'glyph', name: 'app' },
      varName: e.name,
      scope: e.scope,
      value: e.value,
      envData: {
        name: e.name,
        value: e.value,
        scope: e.scope,
        paths: envManager.parsePathEntries(e.value)
      },
      actions: [
        {
          id: 'copy-val',
          title: `Copy Value`,
          shortcut: '↵',
          run: () => {
            envManager.copyToClipboard(e.value);
            return Promise.resolve({ ok: true, value: e.value });
          }
        },
        {
          id: 'open-dialog',
          title: 'Open Environment Variables GUI',
          shortcut: 'Ctrl+E',
          run: () => Promise.resolve({ ok: envManager.openEnvironmentDialog() })
        },
        {
          id: 'copy-name',
          title: `Copy Variable Name (${e.name})`,
          shortcut: 'Ctrl+Shift+C',
          run: () => {
            envManager.copyToClipboard(e.name);
            return Promise.resolve({ ok: true, name: e.name });
          }
        }
      ]
    };
  }

  return {
    id: 'env',
    name: 'Environment Variables',
    group: 'Environment Variables',
    warm: () => envManager.getEnvVariables(),
    all: () => envManager.getCachedVariables().map((e) => toItem(e, false)),
    async search(query) {
      const q = String(query || '').trim();
      if (!q) return [];

      const isPrefixed = /^(?:env:?|variables?:?)\b/i.test(q);
      const cleanQ = q.replace(/^(?:env:?|variables?:?)\s*/i, '').trim().toLowerCase();

      const vars = isPrefixed ? await envManager.getEnvVariables() : (envManager.getCachedVariables() || []);

      if (isPrefixed) {
        if (!cleanQ) return vars.slice(0, 30).map((e) => toItem(e, true));
        return envManager.filterEnv(vars, cleanQ).map((e) => toItem(e, true, e.name.toLowerCase() === cleanQ));
      }

      if (q.length < 3 && q.toLowerCase() !== 'path') return [];
      return envManager.filterEnv(vars, cleanQ).map((e) => toItem(e, false, e.name.toLowerCase() === cleanQ));
    }
  };
}

// ============================================================ Winget Package Updater (M2)

function wingetUpdatesProvider() {
  function toItem(p, isPrefixed) {
    const diffLabel = wingetManager.formatDiff(p);
    return {
      id: `winget:${p.id}`,
      provider: 'winget',
      group: 'Software Updates',
      title: `${p.name} (${diffLabel})`,
      subtitle: `ID: ${p.id} · ${p.currentVersion} -> ${p.availableVersion} · Source: ${p.source}`,
      keywords: ['winget', 'update', 'upgrade', 'software', p.name, p.id],
      scoreBoost: isPrefixed ? 260 : 150,
      icon: { kind: 'glyph', name: 'app' },
      packageName: p.name,
      currentVersion: p.currentVersion,
      availableVersion: p.availableVersion,
      source: p.source,
      wingetData: {
        id: p.id,
        name: p.name,
        currentVersion: p.currentVersion,
        availableVersion: p.availableVersion
      },
      actions: [
        {
          id: 'upgrade-pkg',
          title: `Update ${p.name} (${p.availableVersion})`,
          shortcut: '↵',
          run: () => wingetManager.executeUpgrade(p.id)
        },
        {
          id: 'upgrade-all',
          title: `Upgrade All Packages (winget upgrade --all)`,
          shortcut: 'Ctrl+Shift+U',
          run: () => wingetManager.executeUpgrade('--all')
        },
        {
          id: 'copy-cmd',
          title: `Copy Upgrade Command`,
          shortcut: 'Ctrl+C',
          run: () => {
            const cmd = wingetManager.buildUpgradeCmd(p.id);
            if (clipboard && typeof clipboard.writeText === 'function') {
              clipboard.writeText(cmd);
            }
            return Promise.resolve({ ok: true, command: cmd });
          }
        }
      ]
    };
  }

  return {
    id: 'winget',
    name: 'Software Updates',
    group: 'Software Updates',
    warm: () => wingetManager.scanUpgrades(),
    all: () => wingetManager.getCachedUpgrades().map((p) => toItem(p, false)),
    async search(query) {
      const q = String(query || '').trim();
      if (!q) return [];

      const isPrefixed = /^(?:winget|update|upgrade|packages?):?\s*/i.test(q);
      const cleanQ = q.replace(/^(?:winget|update|upgrade|packages?):?\s*/i, '').trim().toLowerCase();

      const upgrades = isPrefixed ? await wingetManager.scanUpgrades() : (wingetManager.getCachedUpgrades() || []);

      if (isPrefixed) {
        if (!cleanQ) return upgrades.map((p) => toItem(p, true));
        return upgrades
          .filter((p) => p.name.toLowerCase().includes(cleanQ) || p.id.toLowerCase().includes(cleanQ))
          .map((p) => toItem(p, true));
      }

      if (q.length < 3) return [];
      return upgrades
        .filter((p) => p.name.toLowerCase().includes(cleanQ) || p.id.toLowerCase().includes(cleanQ))
        .map((p) => toItem(p, false));
    }
  };
}

// ============================================================ Hosts File Quick Editor (M2)

function hostsEditorProvider() {
  function toItem(r, isPrefixed) {
    const statusLabel = r.enabled ? '✓ Enabled' : '○ Disabled (#)';
    const commentSuffix = r.comment ? ` · ${r.comment}` : '';
    return {
      id: `host:${r.domain}:${r.lineIndex}`,
      provider: 'hosts',
      group: 'Hosts File',
      title: `${r.domain} -> ${r.ip} (${r.enabled ? 'Enabled' : 'Disabled'})`,
      subtitle: `${statusLabel}${commentSuffix} · Line ${r.lineIndex + 1}`,
      keywords: ['hosts', 'host', 'dns', 'ip', r.domain, r.ip, r.comment].filter(Boolean),
      scoreBoost: isPrefixed ? 260 : 150,
      icon: { kind: 'glyph', name: 'globe' },
      domain: r.domain,
      ip: r.ip,
      enabled: r.enabled,
      isEnabled: r.enabled,
      comment: r.comment,
      hostsData: {
        ip: r.ip,
        domain: r.domain,
        enabled: r.enabled,
        comment: r.comment
      },
      actions: [
        {
          id: 'toggle',
          title: r.enabled ? `Disable Rule (${r.domain})` : `Enable Rule (${r.domain})`,
          shortcut: '↵',
          run: () => hostsEditor.toggleHostRule(r)
        },
        {
          id: 'flush-dns',
          title: 'Flush DNS Resolver Cache',
          shortcut: 'Ctrl+F',
          run: () => hostsEditor.flushDns()
        },
        {
          id: 'copy-ip',
          title: `Copy IP (${r.ip})`,
          shortcut: 'Ctrl+C',
          run: () => {
            if (clipboard && typeof clipboard.writeText === 'function') {
              clipboard.writeText(r.ip);
            }
            return Promise.resolve({ ok: true, ip: r.ip });
          }
        },
        {
          id: 'copy-domain',
          title: `Copy Domain (${r.domain})`,
          shortcut: 'Ctrl+Shift+C',
          run: () => {
            if (clipboard && typeof clipboard.writeText === 'function') {
              clipboard.writeText(r.domain);
            }
            return Promise.resolve({ ok: true, domain: r.domain });
          }
        }
      ]
    };
  }

  return {
    id: 'hosts',
    name: 'Hosts File',
    group: 'Hosts File',
    warm: () => hostsEditor.getRules(),
    all: () => hostsEditor.getRules().map((r) => toItem(r, false)),
    async search(query) {
      const q = String(query || '').trim();
      if (!q) return [];

      const isPrefixed = /^(?:hosts?:?|dns:?)\b/i.test(q);
      const cleanQ = q.replace(/^(?:hosts?:?|dns:?)\s*/i, '').trim().toLowerCase();

      const rules = hostsEditor.getRules();

      if (isPrefixed) {
        if (!cleanQ) return rules.map((r) => toItem(r, true));
        return rules
          .filter((r) => r.domain.toLowerCase().includes(cleanQ) || r.ip.toLowerCase().includes(cleanQ) || (r.comment && r.comment.toLowerCase().includes(cleanQ)))
          .map((r) => toItem(r, true));
      }

      if (q.length < 3) return [];
      return rules
        .filter((r) => r.domain.toLowerCase().includes(cleanQ) || r.ip.toLowerCase().includes(cleanQ) || (r.comment && r.comment.toLowerCase().includes(cleanQ)))
        .map((r) => toItem(r, false));
    }
  };
}

function mediaHudProvider() {
  return {
    id: 'media',
    name: 'Now Playing',
    group: 'Now Playing',
    warm: () => mediaHud.getSession(),
    all: () => {
      const s = mediaHud.getCachedSession();
      if (!s || !s.active) return [];
      return [
        {
          id: 'media:now-playing',
          provider: 'media',
          group: 'Now Playing',
          title: `${s.title} — ${s.artist}`,
          subtitle: `${s.album} · ${s.status} · ${s.app}`,
          scoreBoost: 220,
          mediaData: { ...s },
          icon: { kind: 'glyph', name: 'music' },
          actions: [
            { id: 'playpause', title: s.status === 'Playing' ? 'Pause' : 'Play', shortcut: '↵', run: () => mediaHud.playPause() },
            { id: 'next', title: 'Next Track', shortcut: 'Ctrl+Right', run: () => mediaHud.nextTrack() },
            { id: 'prev', title: 'Previous Track', shortcut: 'Ctrl+Left', run: () => mediaHud.prevTrack() },
            { id: 'vol-up', title: 'Volume Up (+10%)', shortcut: 'Ctrl+Up', run: () => mediaHud.adjustVolume(10) },
            { id: 'vol-down', title: 'Volume Down (-10%)', shortcut: 'Ctrl+Down', run: () => mediaHud.adjustVolume(-10) }
          ]
        }
      ];
    },
    search: async (query) => {
      const q = String(query || '').toLowerCase().trim();
      const isMediaKeyword = /^(media|now playing|music|song|track|play|pause|next|prev|spotify)/i.test(q);

      const cached = mediaHud.getCachedSession();
      if (!isMediaKeyword && (!cached || !cached.active)) {
        return [];
      }

      const session = isMediaKeyword ? await mediaHud.getSession() : cached;
      const s = session && session.active ? session : mediaHud.getCachedSession();

      if (!s || !s.active) {
        if (isMediaKeyword) {
          return [
            {
              id: 'media:no-session',
              provider: 'media',
              group: 'Now Playing',
              title: 'No Media Playing',
              subtitle: 'Windows System Media Transport Controls (SMTC) is idle',
              scoreBoost: 200,
              mediaData: { active: false, status: 'No media playing', title: 'No Media Playing', artist: 'Idle', album: '', app: '', volume: 50 },
              icon: { kind: 'glyph', name: 'music' },
              actions: [
                { id: 'refresh', title: 'Check Now Playing', shortcut: '↵', run: () => mediaHud.getSession() }
              ]
            }
          ];
        }
        return [];
      }

      const titleMatch = s.title.toLowerCase().includes(q);
      const artistMatch = s.artist.toLowerCase().includes(q);
      const albumMatch = s.album.toLowerCase().includes(q);

      if (isMediaKeyword || titleMatch || artistMatch || albumMatch) {
        return [
          {
            id: 'media:now-playing',
            provider: 'media',
            group: 'Now Playing',
            title: `${s.title} — ${s.artist}`,
            subtitle: `${s.album} · ${s.status} · ${s.app}`,
            scoreBoost: isMediaKeyword ? 260 : 200,
            mediaData: { ...s },
            icon: { kind: 'glyph', name: 'music' },
            actions: [
              { id: 'playpause', title: s.status === 'Playing' ? 'Pause' : 'Play', shortcut: '↵', run: () => mediaHud.playPause() },
              { id: 'next', title: 'Next Track', shortcut: 'Ctrl+Right', run: () => mediaHud.nextTrack() },
              { id: 'prev', title: 'Previous Track', shortcut: 'Ctrl+Left', run: () => mediaHud.prevTrack() },
              { id: 'vol-up', title: 'Volume Up (+10%)', shortcut: 'Ctrl+Up', run: () => mediaHud.adjustVolume(10) },
              { id: 'vol-down', title: 'Volume Down (-10%)', shortcut: 'Ctrl+Down', run: () => mediaHud.adjustVolume(-10) }
            ]
          }
        ];
      }
      return [];
    }
  };
}

function parameterizedQuicklinksProvider() {
  return {
    id: 'quicklinks-param',
    name: 'Parameterized Quicklinks',
    group: 'Quicklinks',
    all: () => {
      const templates = quicklinksManager.getTemplates();
      return templates.map((t) => ({
        id: `ql:${t.prefix}`,
        provider: 'quicklinks-param',
        group: 'Quicklinks',
        title: `${t.name} (${t.prefix} ...)`,
        subtitle: t.template,
        scoreBoost: 50,
        icon: { kind: 'glyph', name: 'link' },
        quicklinkData: {
          name: t.name,
          template: t.template,
          resolvedUrl: t.template,
          params: []
        },
        actions: [
          { id: 'copy-template', title: 'Copy Template URL', shortcut: '↵', run: () => clipboard.writeText(t.template) }
        ]
      }));
    },
    search: (query) => {
      const match = quicklinksManager.matchQuery(query);
      if (!match) return [];
      const t = match.template;
      const url = match.resolvedUrl;
      const title = match.isComplete
        ? `Open ${t.name}: ${match.args.join(' ')}`
        : `Open ${t.name}: [Missing ${match.missingParams.join(', ')}]`;
      const subtitle = match.isComplete
        ? url
        : `Template: ${t.template} (Requires ${match.missingParams.join(', ')})`;

      return [
        {
          id: `ql:match:${t.prefix}`,
          provider: 'quicklinks-param',
          group: 'Quicklinks',
          title,
          subtitle,
          scoreBoost: 260,
          icon: { kind: 'glyph', name: 'link' },
          quicklinkData: {
            name: t.name,
            template: t.template,
            resolvedUrl: url,
            url,
            params: match.args.map((arg, idx) => ({ key: `param_${idx + 1}`, val: arg }))
          },
          actions: [
            {
              id: 'open',
              title: 'Open in Browser',
              shortcut: '↵',
              run: () => {
                if (shell && typeof shell.openExternal === 'function') {
                  shell.openExternal(url);
                }
                return { ok: true, url };
              }
            },
            {
              id: 'copy',
              title: 'Copy URL',
              shortcut: 'Ctrl+C',
              run: () => {
                if (clipboard && typeof clipboard.writeText === 'function') {
                  clipboard.writeText(url);
                }
                return { ok: true, copied: url };
              }
            }
          ]
        }
      ];
    }
  };
}

// ============================================================ Tier 1-3 Providers

function browserSearchProvider() {
  return {
    id: 'browser-bookmarks',
    name: 'Browser Bookmarks & Search',
    all: () => {
      const items = browserSearch.loadAllBookmarks();
      return items.slice(0, 8).map(browserSearch.formatBookmarkItem);
    },
    search: (query) => {
      const q = String(query || '').trim();
      if (!q) return [];
      const items = browserSearch.searchBookmarks(q);
      return items.map(browserSearch.formatBookmarkItem);
    }
  };
}

function fastFilesProvider() {
  return {
    id: 'fast-files',
    name: 'Fast File Search',
    all: () => [],
    search: async (query) => {
      const q = String(query || '').trim();
      if (!q || q.length < 2) return [];
      const files = await fastFileSearch.searchFastFiles(q, { limit: 10 });
      return files.map(fastFileSearch.formatFileItem);
    }
  };
}

function workspacesProvider() {
  return {
    id: 'workspaces',
    name: 'Window Workspaces',
    all: () => {
      const list = windowWorkspaces.listWorkspaces();
      return list.map((ws) => ({
        id: `ws:restore:${ws.name}`,
        provider: 'workspaces',
        group: 'Workspaces',
        title: `Restore Workspace: "${ws.name}"`,
        subtitle: `${ws.windowCount} window positions saved`,
        icon: '🪟',
        keywords: ['workspace', 'layout', 'window', ws.name],
        actions: [
          {
            id: 'restore',
            title: 'Restore Workspace Layout',
            shortcut: '↵',
            run: () => windowWorkspaces.restoreWorkspace(ws.name)
          }
        ]
      }));
    },
    search: (query) => {
      const q = String(query || '').trim().toLowerCase();
      if (!q) return [];
      const list = windowWorkspaces.listWorkspaces();
      const matched = list.filter((w) => w.name.toLowerCase().includes(q) || 'workspace'.includes(q));
      return matched.map((ws) => ({
        id: `ws:restore:${ws.name}`,
        provider: 'workspaces',
        group: 'Workspaces',
        title: `Restore Workspace: "${ws.name}"`,
        subtitle: `${ws.windowCount} window positions saved`,
        icon: '🪟',
        scoreBoost: 120,
        keywords: ['workspace', 'layout', 'window', ws.name],
        actions: [
          {
            id: 'restore',
            title: 'Restore Workspace Layout',
            shortcut: '↵',
            run: () => windowWorkspaces.restoreWorkspace(ws.name)
          }
        ]
      }));
    }
  };
}

function colorPickerProvider() {
  return {
    id: 'color-picker',
    name: 'Color Picker & Eyedropper',
    all: () => {
      const items = [
        {
          id: 'color:eyedropper',
          provider: 'color-picker',
          group: 'Color Picker',
          title: 'Pick Screen Color (Eyedropper)',
          subtitle: 'Sample pixel color under cursor • Copies HEX to clipboard',
          icon: '🎨',
          keywords: ['color', 'picker', 'eyedropper', 'hex', 'rgb', 'hsl'],
          actions: [
            {
              id: 'pick',
              title: 'Pick Color',
              shortcut: '↵',
              run: async () => {
                const sampled = await colorPicker.sampleScreenColor();
                clipboard.writeText(sampled.hex);
                return { ok: true, color: sampled };
              }
            }
          ]
        }
      ];
      const history = colorPicker.getColorHistory();
      for (const h of history.slice(0, 4)) {
        items.push({
          id: `color:history:${h.hex}`,
          provider: 'color-picker',
          group: 'Color Picker',
          title: `Color: ${h.hex}`,
          subtitle: `${h.rgb} • ${h.hsl}`,
          icon: '🖍️',
          keywords: ['color', h.hex, h.rgb, h.hsl],
          actions: [
            {
              id: 'copy-hex',
              title: 'Copy HEX',
              shortcut: '↵',
              run: () => clipboard.writeText(h.hex)
            },
            {
              id: 'copy-rgb',
              title: 'Copy RGB',
              run: () => clipboard.writeText(h.rgb)
            }
          ]
        });
      }
      return items;
    },
    search: (query) => {
      const q = String(query || '').trim().toLowerCase();
      if (!q) return [];
      if (['color', 'picker', 'eyedropper', 'hex', 'rgb', 'hsl'].some((k) => q.includes(k)) || q.startsWith('#')) {
        return [
          {
            id: 'color:eyedropper',
            provider: 'color-picker',
            group: 'Color Picker',
            title: 'Pick Screen Color (Eyedropper)',
            subtitle: 'Sample pixel color under cursor • Copies HEX to clipboard',
            icon: '🎨',
            scoreBoost: 160,
            keywords: ['color', 'picker', 'eyedropper'],
            actions: [
              {
                id: 'pick',
                title: 'Pick Color',
                shortcut: '↵',
                run: async () => {
                  const sampled = await colorPicker.sampleScreenColor();
                  clipboard.writeText(sampled.hex);
                  return { ok: true, color: sampled };
                }
              }
            ]
          }
        ];
      }
      return [];
    }
  };
}

function taskManagerProvider() {
  return {
    id: 'task-manager',
    name: 'Task & Process Manager',
    all: () => [
      {
        id: 'task:view-top',
        provider: 'task-manager',
        group: 'Task Manager',
        title: 'Task Manager: View Top Processes',
        subtitle: 'Inspect memory and CPU consuming background tasks',
        icon: '📊',
        keywords: ['task', 'manager', 'process', 'cpu', 'ram'],
        actions: [
          {
            id: 'view',
            title: 'Inspect Processes',
            shortcut: '↵',
            run: async () => {
              const procs = await taskManager.getTopProcesses(10);
              return { ok: true, processes: procs };
            }
          }
        ]
      }
    ],
    search: async (query) => {
      const q = String(query || '').trim().toLowerCase();
      if (!q) return [];
      if (['task', 'process', 'cpu', 'ram', 'kill', 'ps'].some((k) => q.includes(k))) {
        const top = await taskManager.getTopProcesses(8);
        return top.map((p) => ({
          id: `task:proc:${p.pid}`,
          provider: 'task-manager',
          group: 'Task Manager',
          title: `${p.name} (PID: ${p.pid})`,
          subtitle: `RAM: ${p.memoryFormatted} • CPU: ${p.cpuSeconds}s • ${p.title}`,
          icon: '⚡',
          scoreBoost: 140,
          keywords: ['task', 'kill', p.name, String(p.pid)],
          actions: [
            {
              id: 'kill',
              title: `Kill Process (${p.name})`,
              shortcut: '↵',
              run: async () => taskManager.killProcessByPid(p.pid)
            }
          ]
        }));
      }
      return [];
    }
  };
}

function wifiProvider() {
  return {
    id: 'wifi',
    name: 'Wi-Fi & Network Switcher',
    all: () => [
      {
        id: 'wifi:status',
        provider: 'wifi',
        group: 'Wi-Fi',
        title: 'Wi-Fi: View Saved Networks & Passwords',
        subtitle: 'Inspect saved wireless profiles and credentials',
        icon: '📶',
        keywords: ['wifi', 'network', 'password', 'wlan', 'internet'],
        actions: [
          {
            id: 'view-profiles',
            title: 'List Wi-Fi Profiles',
            shortcut: '↵',
            run: async () => wifiManager.getSavedProfiles()
          }
        ]
      }
    ],
    search: async (query) => {
      const q = String(query || '').trim().toLowerCase();
      if (!q) return [];
      if (['wifi', 'wlan', 'network', 'ssid', 'password'].some((k) => q.includes(k))) {
        const profiles = await wifiManager.getSavedProfiles();
        return profiles.slice(0, 6).map((prof) => ({
          id: `wifi:prof:${prof}`,
          provider: 'wifi',
          group: 'Wi-Fi',
          title: `Wi-Fi Network: "${prof}"`,
          subtitle: 'Press Enter to reveal & copy saved password',
          icon: '📶',
          scoreBoost: 150,
          keywords: ['wifi', prof],
          actions: [
            {
              id: 'copy-password',
              title: 'Copy Wi-Fi Password',
              shortcut: '↵',
              run: async () => {
                const pass = await wifiManager.getProfilePassword(prof);
                if (pass) clipboard.writeText(pass);
                return { ok: true, password: pass };
              }
            },
            {
              id: 'connect',
              title: `Connect to "${prof}"`,
              run: async () => wifiManager.connectToNetwork(prof)
            }
          ]
        }));
      }
      return [];
    }
  };
}

function powerProvider() {
  return {
    id: 'power',
    name: 'Power & Battery Manager',
    all: () => [
      {
        id: 'power:battery-status',
        provider: 'power',
        group: 'Power & Battery',
        title: 'Battery & Power Health',
        subtitle: 'Inspect charge, power status, and active scheme',
        icon: '🔋',
        keywords: ['battery', 'power', 'charge', 'health'],
        actions: [
          {
            id: 'check-battery',
            title: 'Check Status',
            shortcut: '↵',
            run: async () => powerManager.getBatteryStatus()
          }
        ]
      }
    ],
    search: async (query) => {
      const q = String(query || '').trim().toLowerCase();
      if (!q) return [];
      if (['power', 'battery', 'charge', 'plan', 'scheme'].some((k) => q.includes(k))) {
        const plans = await powerManager.getPowerPlans();
        const items = plans.map((p) => ({
          id: `power:plan:${p.guid}`,
          provider: 'power',
          group: 'Power & Battery',
          title: `Power Plan: ${p.name}${p.active ? ' (Active)' : ''}`,
          subtitle: `GUID: ${p.guid} • Switch Windows power mode`,
          icon: p.active ? '⚡' : '🔋',
          scoreBoost: 140,
          keywords: ['power', 'plan', p.name],
          actions: [
            {
              id: 'activate',
              title: `Activate "${p.name}" Plan`,
              shortcut: '↵',
              run: async () => powerManager.setActivePowerPlan(p.guid)
            }
          ]
        }));
        return items;
      }
      return [];
    }
  };
}

function virtualDesktopsProvider() {
  return {
    id: 'virtual-desktops',
    name: 'Virtual Desktops',
    all: () => [
      {
        id: 'vd:next',
        provider: 'virtual-desktops',
        group: 'Virtual Desktops',
        title: 'Next Virtual Desktop',
        subtitle: 'Switch to the desktop on the right (Win+Ctrl+Right)',
        icon: '🖥️',
        keywords: ['desktop', 'virtual', 'switch', 'next'],
        actions: [{ id: 'switch', title: 'Next Desktop', shortcut: '↵', run: () => virtualDesktops.nextDesktop() }]
      },
      {
        id: 'vd:prev',
        provider: 'virtual-desktops',
        group: 'Virtual Desktops',
        title: 'Previous Virtual Desktop',
        subtitle: 'Switch to the desktop on the left (Win+Ctrl+Left)',
        icon: '🖥️',
        keywords: ['desktop', 'virtual', 'switch', 'previous'],
        actions: [{ id: 'switch', title: 'Previous Desktop', shortcut: '↵', run: () => virtualDesktops.prevDesktop() }]
      },
      {
        id: 'vd:new',
        provider: 'virtual-desktops',
        group: 'Virtual Desktops',
        title: 'New Virtual Desktop',
        subtitle: 'Create a new blank virtual desktop (Win+Ctrl+D)',
        icon: '➕',
        keywords: ['desktop', 'new', 'create'],
        actions: [{ id: 'create', title: 'Create Desktop', shortcut: '↵', run: () => virtualDesktops.createDesktop() }]
      }
    ],
    search: (query) => {
      const q = String(query || '').trim().toLowerCase();
      if (!q) return [];
      if (['desktop', 'virtual'].some((k) => q.includes(k))) {
        return virtualDesktopsProvider().all();
      }
      return [];
    }
  };
}

function diskCleanupProvider() {
  return {
    id: 'disk-cleanup',
    name: 'Disk Cleanup',
    all: () => [
      {
        id: 'disk:clean-temp',
        provider: 'disk-cleanup',
        group: 'Disk Cleanup',
        title: 'Clean Temporary Files',
        subtitle: 'Clear cached logs and temporary files from %TEMP%',
        icon: '🧹',
        keywords: ['clean', 'temp', 'disk', 'cache', 'storage'],
        actions: [
          {
            id: 'clean',
            title: 'Clean Temp Files',
            shortcut: '↵',
            run: () => diskCleanup.cleanTempFiles()
          }
        ]
      },
      {
        id: 'disk:empty-recycle-bin',
        provider: 'disk-cleanup',
        group: 'Disk Cleanup',
        title: 'Empty Recycle Bin',
        subtitle: 'Permanently purge all deleted files from Recycle Bin',
        icon: '🗑️',
        keywords: ['recycle', 'bin', 'empty', 'trash', 'clean'],
        actions: [
          {
            id: 'empty',
            title: 'Empty Recycle Bin',
            shortcut: '↵',
            run: () => diskCleanup.emptyRecycleBin()
          }
        ]
      }
    ],
    search: (query) => {
      const q = String(query || '').trim().toLowerCase();
      if (!q) return [];
      if (['disk', 'clean', 'temp', 'recycle', 'trash', 'purge'].some((k) => q.includes(k))) {
        return diskCleanupProvider().all();
      }
      return [];
    }
  };
}

function alwaysOnTopProvider() {
  return {
    id: 'always-on-top',
    name: 'Always-On-Top Toggle',
    all: () => [
      {
        id: 'window:always-on-top',
        provider: 'always-on-top',
        group: 'Window Management',
        title: 'Toggle Always-On-Top for Active Window',
        subtitle: 'Pin the currently focused window on top of all other windows',
        icon: '📌',
        keywords: ['pin', 'top', 'topmost', 'always on top'],
        actions: [
          {
            id: 'toggle-pin',
            title: 'Toggle Pin',
            shortcut: '↵',
            run: async () => alwaysOnTop.toggleForegroundAlwaysOnTop()
          }
        ]
      }
    ],
    search: (query) => {
      const q = String(query || '').trim().toLowerCase();
      if (!q) return [];
      if (['top', 'pin', 'topmost', 'always'].some((k) => q.includes(k))) {
        return alwaysOnTopProvider().all();
      }
      return [];
    }
  };
}

function screenRecorderProvider() {
  return {
    id: 'screen-recorder',
    name: 'Screenshot & Screen Recording',
    all: () => [
      {
        id: 'screen:snip',
        provider: 'screen-recorder',
        group: 'Commands',
        title: 'Snip Screen Area',
        subtitle: 'Open Windows Snipping Tool overlay (Win+Shift+S)',
        icon: '✂️',
        keywords: ['snip', 'screenshot', 'capture', 'screen'],
        actions: [
          {
            id: 'snip',
            title: 'Snip Screen Area',
            shortcut: '↵',
            run: () => screenRecorder.triggerScreenSnip()
          }
        ]
      }
    ],
    search: (query) => {
      const q = String(query || '').trim().toLowerCase();
      if (!q) return [];
      if (['snip', 'screenshot', 'capture', 'record'].some((k) => q.includes(k))) {
        return screenRecorderProvider().all();
      }
      return [];
    }
  };
}

function remindersProvider() {
  return {
    id: 'reminders',
    name: 'Reminders & Todos',
    all: () => {
      const list = remindersManager.getReminders();
      return list.slice(0, 6).map((r) => ({
        id: `rem:item:${r.id}`,
        provider: 'reminders',
        group: 'Reminders',
        title: `${r.completed ? '✅' : '⏰'} ${r.text}`,
        subtitle: r.dueTimestamp ? `Due: ${new Date(r.dueTimestamp).toLocaleTimeString()}` : 'Todo item',
        icon: '⏰',
        keywords: ['reminder', 'todo', r.text],
        actions: [
          {
            id: 'complete',
            title: r.completed ? 'Delete Reminder' : 'Mark as Complete',
            shortcut: '↵',
            run: () => (r.completed ? remindersManager.deleteReminder(r.id) : remindersManager.completeReminder(r.id))
          }
        ]
      }));
    },
    search: (query) => {
      const q = String(query || '').trim();
      if (!q) return [];
      if (q.toLowerCase().startsWith('remind') || q.toLowerCase().startsWith('todo:') || q.toLowerCase().startsWith('in ')) {
        const parsed = remindersManager.parseReminderText(q);
        return [
          {
            id: 'rem:create',
            provider: 'reminders',
            group: 'Reminders',
            title: `Create Reminder: "${parsed.message}"`,
            subtitle: parsed.delayMs > 0 ? `Triggers in ${Math.round(parsed.delayMs / 60000)} minutes` : 'Add as immediate task',
            icon: '⏰',
            scoreBoost: 220,
            keywords: ['reminder', 'todo'],
            actions: [
              {
                id: 'create',
                title: 'Schedule Reminder',
                shortcut: '↵',
                run: () => remindersManager.addReminder(q)
              }
            ]
          }
        ];
      }
      return [];
    }
  };
}

function bitwardenProvider() {
  return {
    id: 'bitwarden',
    name: 'Bitwarden Vault',
    all: () => [],
    search: async (query) => {
      const q = String(query || '').trim();
      if (!q || (!q.toLowerCase().startsWith('bw ') && !q.toLowerCase().startsWith('pass '))) return [];
      const term = q.replace(/^(bw|pass)\s+/i, '').trim();
      if (!term) return [];
      const items = await bitwardenBridge.searchVaultItems(term);
      return items.map((it) => ({
        id: `bw:item:${it.id}`,
        provider: 'bitwarden',
        group: 'Bitwarden',
        title: `Bitwarden: ${it.name}`,
        subtitle: `User: ${it.username || 'None'} • Press Enter to copy password`,
        icon: '🔐',
        scoreBoost: 200,
        keywords: ['bitwarden', 'password', it.name, it.username],
        actions: [
          {
            id: 'copy-password',
            title: 'Copy Password',
            shortcut: '↵',
            run: async () => {
              const pass = await bitwardenBridge.getPassword(it.id);
              if (pass) clipboard.writeText(pass);
              return { ok: true };
            }
          }
        ]
      }));
    }
  };
}

function quickUtilitiesProvider() {
  return {
    id: 'quick-utilities',
    name: 'Quick Utilities',
    all: () => [
      {
        id: 'util:speedtest',
        provider: 'quick-utilities',
        group: 'Utilities',
        title: 'Network Speed & Latency Test',
        subtitle: 'Test ping latency to Cloudflare 1.1.1.1',
        icon: '⚡',
        keywords: ['ping', 'speed', 'network', 'latency'],
        actions: [
          {
            id: 'test',
            title: 'Run Latency Test',
            shortcut: '↵',
            run: async () => quickUtilities.testNetworkLatency()
          }
        ]
      }
    ],
    search: (query) => {
      const q = String(query || '').trim();
      if (!q) return [];
      if (q.toLowerCase().startsWith('qr ')) {
        const text = q.slice(3).trim();
        const qr = quickUtilities.generateQrSvg(text);
        return [
          {
            id: 'util:qr',
            provider: 'quick-utilities',
            group: 'Utilities',
            title: `Generate QR Code: "${text}"`,
            subtitle: 'Preview QR and copy SVG representation',
            icon: '📱',
            scoreBoost: 210,
            keywords: ['qr', 'code', text],
            actions: [
              {
                id: 'copy-qr',
                title: 'Copy QR SVG',
                shortcut: '↵',
                run: () => clipboard.writeText(qr.svg)
              }
            ]
          }
        ];
      }
      return [];
    }
  };
}

function terminalIntegrationProvider() {
  return {
    id: 'terminal',
    name: 'Terminal & SSH',
    all: () => {
      const profiles = terminalIntegration.getTerminalProfiles();
      return profiles.map((p) => ({
        id: `term:profile:${p.name}`,
        provider: 'terminal',
        group: 'Terminal',
        title: `Open Terminal: "${p.name}"`,
        subtitle: `Command: ${p.commandline}`,
        icon: '💻',
        keywords: ['terminal', 'wt', 'console', p.name],
        actions: [
          {
            id: 'launch',
            title: `Open ${p.name}`,
            shortcut: '↵',
            run: () => terminalIntegration.launchTerminalProfile(p.name)
          }
        ]
      }));
    },
    search: (query) => {
      const q = String(query || '').trim().toLowerCase();
      if (!q) return [];
      if (['term', 'wt', 'ssh', 'bash', 'console'].some((k) => q.includes(k))) {
        const hosts = terminalIntegration.getSshHosts();
        const items = terminalIntegrationProvider().all();
        for (const h of hosts) {
          items.push({
            id: `ssh:host:${h.name}`,
            provider: 'terminal',
            group: 'Terminal',
            title: `SSH Connect: "${h.name}"`,
            subtitle: `ssh ${h.user ? h.user + '@' : ''}${h.hostname} -p ${h.port}`,
            icon: '🌐',
            scoreBoost: 160,
            keywords: ['ssh', h.name, h.hostname],
            actions: [
              {
                id: 'connect',
                title: 'Connect via Terminal',
                shortcut: '↵',
                run: () => terminalIntegration.connectToSshHost(h.name)
              }
            ]
          });
        }
        return items;
      }
      return [];
    }
  };
}

function projectLauncherProvider() {
  return {
    id: 'projects',
    name: 'Project Workspace Launcher',
    all: () => {
      const projects = projectLauncher.listProjects();
      return projects.map((p) => ({
        id: `proj:launch:${p.id}`,
        provider: 'projects',
        group: 'Projects',
        title: `Launch Project: "${p.name}"`,
        subtitle: `Opens VS Code + Terminal in ${p.directory}`,
        icon: '🚀',
        keywords: ['project', 'workspace', p.name],
        actions: [
          {
            id: 'launch',
            title: 'Launch Workspace',
            shortcut: '↵',
            run: () => projectLauncher.launchProject(p.id)
          }
        ]
      }));
    },
    search: (query) => {
      const q = String(query || '').trim().toLowerCase();
      if (!q) return [];
      if (['project', 'proj', 'workspace'].some((k) => q.includes(k))) {
        return projectLauncherProvider().all();
      }
      return [];
    }
  };
}

function spotifyProvider() {
  return {
    id: 'spotify',
    name: 'Spotify Music Search',
    all: () => [],
    search: (query) => {
      const q = String(query || '').trim();
      if (!q || !q.toLowerCase().startsWith('spotify ')) return [];
      const term = q.slice(8).trim();
      return spotifySearch.searchSpotify(term);
    }
  };
}

function aiCommandsProvider() {
  return {
    id: 'ai-commands',
    name: 'AI Reusable Prompt Commands',
    all: () => aiCommands.PROMPT_TEMPLATES.map((t) => ({
      id: `ai-cmd:${t.id}`,
      provider: 'ai-commands',
      group: 'AI Commands',
      title: t.title,
      subtitle: t.subtitle,
      icon: t.icon,
      keywords: ['ai', 'prompt', t.title],
      actions: [
        {
          id: 'run-ai',
          title: 'Execute on Clipboard',
          shortcut: '↵',
          run: async () => aiCommands.runAiCommand(t.id)
        }
      ]
    })),
    search: (query) => {
      const q = String(query || '').trim().toLowerCase();
      if (!q) return [];
      if (['ai', 'prompt', 'grammar', 'summarize', 'explain', 'types'].some((k) => q.includes(k))) {
        return aiCommandsProvider().all();
      }
      return [];
    }
  };
}

function extensionStoreProvider() {
  return {
    id: 'extension-store',
    name: 'Rayclone Extension Store',
    all: () => {
      const list = extensionStore.listExtensions();
      return list.map((ext) => ({
        id: `ext:store:${ext.id}`,
        provider: 'extension-store',
        group: 'Extensions',
        title: `${ext.name} (v${ext.version}) ${ext.installed ? '• Installed' : ''}`,
        subtitle: `${ext.description} • By ${ext.author}`,
        icon: ext.icon,
        keywords: ['store', 'extension', 'plugin', ext.name, ext.category],
        actions: [
          {
            id: ext.installed ? 'uninstall' : 'install',
            title: ext.installed ? 'Uninstall Extension' : 'Install Extension',
            shortcut: '↵',
            run: () => (ext.installed ? extensionStore.uninstallExtension(ext.id) : extensionStore.installExtension(ext.id))
          }
        ]
      }));
    },
    search: (query) => {
      const q = String(query || '').trim().toLowerCase();
      if (!q) return [];
      if (['store', 'extension', 'plugin', 'addon'].some((k) => q.includes(k))) {
        return extensionStoreProvider().all();
      }
      return [];
    }
  };
}

function windowsSettingsCatalogProvider() {
  return {
    id: 'windows-settings',
    name: 'Windows Settings',
    all: () => {
      return windowsSettings.WINDOWS_SETTINGS_CATALOG.map(windowsSettings.formatSettingItem);
    },
    search: (query) => {
      const raw = String(query || '').replace(/^\$+/, '').trim();
      if (!raw) return windowsSettingsCatalogProvider().all();
      const items = windowsSettings.searchSettings(raw);
      return items.map((it) => {
        const item = windowsSettings.formatSettingItem(it);
        item.scoreBoost = (item.scoreBoost || 0) + (query.startsWith('$') ? 300 : 80);
        return item;
      });
    }
  };
}

function registryExplorerProvider() {
  return {
    id: 'registry',
    name: 'Windows Registry Explorer',
    all: () => registryExplorer.searchRegistry(''),
    search: async (query) => {
      const q = String(query || '').trim();
      if (!q.startsWith(':') && !q.toLowerCase().startsWith('reg:')) return [];
      const clean = q.replace(/^(:|reg:\s*)/i, '').trim();
      if (!clean) return registryExplorer.searchRegistry('');

      const res = await registryExplorer.queryRegistryKey(clean);
      const items = [];

      // Open Key Action
      items.push({
        id: `reg:open:${res.key}`,
        provider: 'registry',
        group: 'Registry',
        title: `Open in Regedit: "${res.key}"`,
        subtitle: 'Auto-navigate directly to this key in Registry Editor',
        icon: '🗄️',
        scoreBoost: 260,
        actions: [
          { id: 'open', title: 'Open in Regedit', shortcut: '↵', run: () => registryExplorer.openInRegedit(res.key) },
          { id: 'copy', title: 'Copy Key Path', run: () => clipboard.writeText(res.key) }
        ]
      });

      // Subkeys
      for (const sub of (res.subkeys || []).slice(0, 8)) {
        const shortName = sub.split('\\').pop();
        items.push({
          id: `reg:sub:${sub}`,
          provider: 'registry',
          group: 'Registry',
          title: `📁 ${shortName}`,
          subtitle: sub,
          icon: '📁',
          scoreBoost: 230,
          actions: [
            { id: 'open', title: 'Open Subkey in Regedit', shortcut: '↵', run: () => registryExplorer.openInRegedit(sub) },
            { id: 'copy', title: 'Copy Path', run: () => { if (clipboard && clipboard.writeText) clipboard.writeText(sub); return { ok: true }; } }
          ]
        });
      }

      // Values
      for (const val of (res.values || []).slice(0, 8)) {
        items.push({
          id: `reg:val:${res.key}:${val.name}`,
          provider: 'registry',
          group: 'Registry',
          title: `${val.name} (${val.type})`,
          subtitle: `Data: ${val.data}`,
          icon: '🏷️',
          scoreBoost: 210,
          actions: [
            { id: 'copy-data', title: 'Copy Value Data', shortcut: '↵', run: () => { if (clipboard && clipboard.writeText) clipboard.writeText(val.data); return { ok: true }; } },
            { id: 'copy-name', title: 'Copy Value Name', run: () => { if (clipboard && clipboard.writeText) clipboard.writeText(val.name); return { ok: true }; } }
          ]
        });
      }

      return items;
    }
  };
}

function vscodeWorkspacesProvider() {
  return {
    id: 'vscode-workspaces',
    name: 'VS Code Workspaces',
    all: async () => {
      const items = await vscodeWorkspaces.loadRecentWorkspaces();
      return items.slice(0, 8).map(vscodeWorkspaces.formatWorkspaceItem);
    },
    search: async (query) => {
      const q = String(query || '').trim();
      const isExplicit = q.startsWith('{') || q.toLowerCase().startsWith('vsc:');
      const clean = q.replace(/^(\{|vsc:\s*)/i, '').trim();
      if (!isExplicit && !['vscode', 'workspace', 'code'].some((k) => q.toLowerCase().includes(k))) return [];

      await vscodeWorkspaces.loadRecentWorkspaces();
      const items = vscodeWorkspaces.searchWorkspaces(clean);
      return items.map((it) => {
        const item = it.group ? it : vscodeWorkspaces.formatWorkspaceItem(it);
        if (isExplicit) item.scoreBoost = (item.scoreBoost || 0) + 250;
        return item;
      });
    }
  };
}

function windowWalkerProvider() {
  return {
    id: 'window-walker',
    name: 'Window Walker',
    all: async () => {
      const windows = await windowWalker.getRunningWindows();
      return windows.slice(0, 10).map((w) => ({
        id: `ww:win:${w.hwnd}`,
        provider: 'window-walker',
        group: 'Window Walker',
        title: `${w.isHung ? '⚠️ [Not Responding] ' : ''}${w.title}`,
        subtitle: `PID: ${w.pid} • Bring application to foreground`,
        icon: w.isHung ? '⚠️' : '🪟',
        scoreBoost: w.isHung ? 240 : 180,
        actions: [
          { id: 'focus', title: 'Switch to Window', shortcut: '↵', run: () => windowWalker.focusWindow(w.hwnd) },
          { id: 'kill-tree', title: 'Terminate Process Tree', shortcut: 'Ctrl+Shift+Delete', run: () => windowWalker.killProcessTree(w.pid, w.title) }
        ]
      }));
    },
    search: async (query) => {
      const q = String(query || '').trim();
      const isExplicit = q.startsWith('<');
      const clean = q.replace(/^</, '').trim().toLowerCase();
      if (!isExplicit && !['walker', 'window', 'hung', 'switch'].some((k) => q.toLowerCase().includes(k))) return [];

      const windows = await windowWalker.searchWindowWalker(clean);
      return windows.map((w) => ({
        id: `ww:win:${w.hwnd}`,
        provider: 'window-walker',
        group: 'Window Walker',
        title: `${w.isHung ? '⚠️ [Not Responding] ' : ''}${w.title}`,
        subtitle: `PID: ${w.pid} • HWND: ${w.hwnd}`,
        icon: w.isHung ? '⚠️' : '🪟',
        scoreBoost: isExplicit ? 280 : 180,
        actions: [
          { id: 'focus', title: 'Switch to Window', shortcut: '↵', run: () => windowWalker.focusWindow(w.hwnd) },
          { id: 'kill-tree', title: 'Terminate Process Tree', shortcut: 'Ctrl+Shift+Delete', run: () => windowWalker.killProcessTree(w.pid, w.title) }
        ]
      }));
    }
  };
}

function systemDiagnosticsProvider() {
  return {
    id: 'diagnostics',
    name: 'System Diagnostics & UEFI',
    all: () => [
      {
        id: 'diag:uefi',
        provider: 'diagnostics',
        group: 'System Diagnostics',
        title: 'Reboot to UEFI / BIOS Firmware',
        subtitle: 'Restarts computer directly into motherboard BIOS setup (Requires confirmation)',
        icon: '⚠️',
        keywords: ['uefi', 'bios', 'reboot', 'firmware', 'restart'],
        actions: [
          { id: 'reboot', title: 'Confirm: Reboot to UEFI Firmware', shortcut: 'Ctrl+Shift+↵', danger: true, run: () => systemDiagnostics.rebootToUefi() }
        ]
      },
      {
        id: 'diag:network',
        provider: 'diagnostics',
        group: 'System Diagnostics',
        title: 'Network Adapter Diagnostics',
        subtitle: 'Inspect link speeds, gateway, DNS servers, and IP addresses',
        icon: '🌐',
        keywords: ['nic', 'ethernet', 'wifi', 'gateway', 'dns', 'speed'],
        actions: [
          { id: 'inspect', title: 'Inspect Network Adapters', shortcut: '↵', run: () => systemDiagnostics.getNetworkDiagnostics() }
        ]
      }
    ],
    search: (query) => {
      const q = String(query || '').trim().toLowerCase();
      if (!q) return [];
      if (['uefi', 'bios', 'firmware', 'nic', 'adapter', 'diagnostics', 'gateway', 'dns'].some((k) => q.includes(k))) {
        return systemDiagnosticsProvider().all();
      }
      return [];
    }
  };
}

function chronometricsProvider() {
  return {
    id: 'chronometrics',
    name: 'Time & Chronometrics',
    all: () => {
      const c = systemDiagnostics.getChronometrics();
      return [
        {
          id: 'chrono:iso',
          provider: 'chronometrics',
          group: 'Time & Chronometrics',
          title: `ISO 8601: ${c.iso}`,
          subtitle: `Week ${c.weekOfYear} of year • Day ${c.dayOfYear}`,
          icon: '🕒',
          keywords: ['time', 'date', 'iso', 'now'],
          actions: [{ id: 'copy', title: 'Copy ISO 8601', shortcut: '↵', run: () => { if (clipboard && clipboard.writeText) clipboard.writeText(c.iso); return { ok: true }; } }]
        },
        {
          id: 'chrono:filetime',
          provider: 'chronometrics',
          group: 'Time & Chronometrics',
          title: `Windows FileTime: ${c.fileTime}`,
          subtitle: '64-bit timestamp (100-nanoseconds since 1601 UTC)',
          icon: '🕒',
          keywords: ['filetime', 'windows', 'timestamp', 'ft'],
          actions: [{ id: 'copy', title: 'Copy FileTime', shortcut: '↵', run: () => { if (clipboard && clipboard.writeText) clipboard.writeText(c.fileTime); return { ok: true }; } }]
        },
        {
          id: 'chrono:stats',
          provider: 'chronometrics',
          group: 'Time & Chronometrics',
          title: `Week ${c.weekOfYear} • Day ${c.dayOfYear} of ${c.isLeapYear ? '366' : '365'}`,
          subtitle: `${c.daysRemainingInMonth} days remaining in current month • Excel: ${c.excel1900}`,
          icon: '📅',
          keywords: ['calendar', 'week', 'day', 'month'],
          actions: [{ id: 'copy', title: 'Copy Date', shortcut: '↵', run: () => { if (clipboard && clipboard.writeText) clipboard.writeText(c.local); return { ok: true }; } }]
        }
      ];
    },
    search: (query) => {
      const q = String(query || '').trim().toLowerCase();
      if (!q) return [];
      if (q.startsWith(')') || ['time', 'date', 'filetime', 'iso', 'week', 'now', 'chrono'].some((k) => q.includes(k))) {
        const items = chronometricsProvider().all();
        if (q.startsWith(')')) {
          for (const it of items) it.scoreBoost = 260;
        }
        return items;
      }
      return [];
    }
  };
}

function wslProvider() {
  return {
    id: 'wsl',
    name: 'WSL Distributions',
    all: async () => {
      const list = await wslManager.listDistros();
      return list.map(wslManager.formatDistroItem);
    },
    search: async (query) => {
      const q = String(query || '').trim().toLowerCase();
      if (!q) return [];
      if (q.startsWith('wsl') || ['ubuntu', 'debian', 'distro', 'linux', 'bash'].some((k) => q.includes(k))) {
        return wslManager.searchWsl(query);
      }
      return [];
    }
  };
}

function bluetoothProvider() {
  return {
    id: 'bluetooth',
    name: 'Bluetooth Devices',
    all: async () => {
      const list = await bluetoothManager.getPairedDevices();
      return list.map(bluetoothManager.formatBluetoothItem);
    },
    search: async (query) => {
      const q = String(query || '').trim().toLowerCase();
      if (!q) return [];
      if (q.startsWith('bt') || q.startsWith('bluetooth') || ['headphone', 'earphone', 'airpod', 'buds', 'mouse', 'keyboard'].some((k) => q.includes(k))) {
        return bluetoothManager.searchBluetooth(query);
      }
      return [];
    }
  };
}

function dnsSwitcherProvider() {
  return {
    id: 'dns',
    name: 'DNS Switcher',
    all: async () => {
      const current = await dnsSwitcher.getCurrentDns();
      return dnsSwitcher.DNS_PRESETS.map((p) => dnsSwitcher.formatDnsPresetItem(p, current.servers));
    },
    search: async (query) => {
      const q = String(query || '').trim().toLowerCase();
      if (!q) return [];
      if (q.startsWith('dns') || ['cloudflare', 'google', 'quad9', 'dhcp', 'nameserver', '1.1.1.1', '8.8.8.8'].some((k) => q.includes(k))) {
        return dnsSwitcher.searchDns(query);
      }
      return [];
    }
  };
}

function sandboxedExtensionProvider() {
  return {
    id: 'sandboxed-extensions',
    name: 'Built-in Tools',
    all: () => {
      return extensionEngine.BUILTIN_EXTENSIONS.map(extensionEngine.formatExtensionItem);
    },
    search: async (query) => {
      const q = String(query || '').trim().toLowerCase();
      if (!q) return [];
      if (q.startsWith('ext') || ['extension', 'plugin', 'hash', 'slug', 'lorem', 'sandbox'].some((k) => q.includes(k))) {
        return extensionEngine.searchExtensions(query);
      }
      return [];
    }
  };
}

// ============================================================ registry


function createRegistry(opts = {}) {
  const userDataPath = opts && opts.userDataPath;
  store.init(userDataPath);

  const providers = [
    calculatorProvider(),
    appsProvider(),
    clipboardProvider(),
    filesProvider(),
    windowManagerProvider(),
    notesProvider(),
    snippetsProvider(),
    emojiProvider(),
    scriptsProvider(),
    processProvider(),
    devToolsProvider(),
    aiProvider(),
    webSearchProvider(),
    translatorProvider(),
    dictionaryProvider(),
    focusProvider(),
    calendarProvider(),
    mcpProvider(),
    contactsProvider(),
    windowsRunProvider(),
    typingPracticeProvider(),
    weatherProvider(),
    navigationProvider(),
    screenAwarenessProvider(),
    dictationProvider(),
    gamesProvider(),
    systemProvider(),
    portInspectorProvider(),
    gitRepositoriesProvider(),
    dockerManagerProvider(),
    githubShortcutsProvider(),
    audioSwitcherProvider(),
    windowsServicesProvider(),
    environmentVariablesProvider(),
    wingetUpdatesProvider(),
    hostsEditorProvider(),
    mediaHudProvider(),
    parameterizedQuicklinksProvider(),
    browserSearchProvider(),
    fastFilesProvider(),
    workspacesProvider(),
    colorPickerProvider(),
    taskManagerProvider(),
    wifiProvider(),
    powerProvider(),
    virtualDesktopsProvider(),
    diskCleanupProvider(),
    alwaysOnTopProvider(),
    screenRecorderProvider(),
    remindersProvider(),
    bitwardenProvider(),
    quickUtilitiesProvider(),
    terminalIntegrationProvider(),
    projectLauncherProvider(),
    spotifyProvider(),
    aiCommandsProvider(),
    extensionStoreProvider(),
    windowsSettingsCatalogProvider(),
    registryExplorerProvider(),
    vscodeWorkspacesProvider(),
    windowWalkerProvider(),
    systemDiagnosticsProvider(),
    chronometricsProvider(),
    wslProvider(),
    bluetoothProvider(),
    dnsSwitcherProvider(),
    sandboxedExtensionProvider()
  ];

  const byId = new Map(providers.map((p) => [p.id, p]));
  const itemsById = new Map();
  let frecency = store.read('frecency', {});
  if (typeof frecency !== 'object' || frecency === null) frecency = {};

  function remember(id) {
    const now = Date.now();
    const rec = frecency[id] || { count: 0, last: 0 };
    rec.count = Math.min(rec.count + 1, 50);
    rec.last = now;
    frecency[id] = rec;
    const keys = Object.keys(frecency);
    if (keys.length > 800) {
      keys.sort((a, b) => (frecency[b].last || 0) - (frecency[a].last || 0));
      const keep = {};
      for (const k of keys.slice(0, 400)) keep[k] = frecency[k];
      frecency = keep;
    }
    store.write('frecency', frecency);
  }

  function frecencyBoost(id) {
    const rec = frecency[id];
    if (!rec) return 0;
    const ageDays = (Date.now() - (rec.last || 0)) / 86400000;
    return Math.min(rec.count, 20) * 3 + Math.max(0, 14 - ageDays * 2);
  }

  function defaultItems() {
    const pool = [];
    const EXCLUDE_DEFAULT = new Set([
      'calculator', 'files', 'websearch', 'emojis', 'ports', 'docker', 'github-shortcuts',
      'audio', 'services', 'env', 'winget', 'hosts', 'media', 'quicklinks-param',
      'browser-bookmarks', 'fast-files', 'task-manager', 'wifi', 'power', 'disk-cleanup',
      'bitwarden', 'spotify', 'ai-commands', 'registry', 'vscode-workspaces',
      'window-walker', 'diagnostics', 'chronometrics', 'wsl', 'bluetooth', 'dns', 'sandboxed-extensions'
    ]);
    for (const p of providers) {
      if (EXCLUDE_DEFAULT.has(p.id)) continue;
      const all = p.all();
      for (const item of all) {
        const boost = frecencyBoost(item.id);
        if (boost > 0) pool.push({ item, score: boost });
      }
    }
    // Fall back to curated set on fresh install
    if (pool.length < 8) {
      for (const p of providers) {
        if (EXCLUDE_DEFAULT.has(p.id)) continue;
        for (const item of p.all()) {
          if (item.group === 'Commands' || item.group === 'Window Management' || item.group === 'Notes' || item.group === 'Snippets' || item.group === 'Workspaces' || item.group === 'Color Picker' || item.group === 'Windows Settings') {
            pool.push({ item, score: 1 });
          }
        }
      }
    }
    pool.sort((a, b) => b.score - a.score);
    return pool.slice(0, 24).map((e) => e.item);
  }

  async function search(query) {
    const q = String(query || '').trim();
    itemsById.clear();

    if (!q) {
      const items = defaultItems();
      for (const item of items) itemsById.set(item.id, item);
      return items;
    }

    // Universal Action Keyword Fast-Path Routing (PowerToys Run Parity)
    if (q.startsWith('=') && !q.startsWith('==') && q.length > 1) {
      const calcP = byId.get('calculator');
      if (calcP) {
        const res = await calcP.search(q.slice(1).trim());
        if (res && res.length > 0) {
          for (const item of res) itemsById.set(item.id, item);
          return res;
        }
      }
    }
    if (q.startsWith('$') && !/^\$\s*\d/.test(q)) {
      const winSetP = byId.get('windows-settings');
      if (winSetP) {
        const res = await winSetP.search(q);
        if (res && res.length > 0) {
          for (const item of res) itemsById.set(item.id, item);
          return res;
        }
      }
    }
    if (q === ':' || q.startsWith(': ') || /^:[a-zA-Z\\]/i.test(q)) {
      const regP = byId.get('registry');
      if (regP) {
        const res = await regP.search(q);
        if (res && res.length > 0) {
          for (const item of res) itemsById.set(item.id, item);
          return res;
        }
      }
    }
    if (q.startsWith('{')) {
      const vscP = byId.get('vscode-workspaces');
      if (vscP) {
        const res = await vscP.search(q);
        if (res && res.length > 0) {
          for (const item of res) itemsById.set(item.id, item);
          return res;
        }
      }
    }
    if (q.startsWith('<') && !q.startsWith('<=') && !q.startsWith('<<')) {
      const wwP = byId.get('window-walker');
      if (wwP) {
        const res = await wwP.search(q);
        if (res && res.length > 0) {
          for (const item of res) itemsById.set(item.id, item);
          return res;
        }
      }
    }
    if (q.startsWith('!') && !q.startsWith('!=') && q.length > 1) {
      const srvP = byId.get('services');
      if (srvP) {
        const res = await srvP.search(`services: ${q.slice(1).trim()}`);
        if (res && res.length > 0) {
          for (const item of res) itemsById.set(item.id, item);
          return res;
        }
      }
    }
    if (q.startsWith(')') && q.length >= 1) {
      const chronoP = byId.get('chronometrics');
      if (chronoP) {
        const res = await chronoP.search(q);
        if (res && res.length > 0) {
          for (const item of res) itemsById.set(item.id, item);
          return res;
        }
      }
    }
    if (q.startsWith('%%') && q.length > 2) {
      const calcP = byId.get('calculator');
      if (calcP) {
        const res = await calcP.search(q.slice(2).trim());
        if (res && res.length > 0) {
          for (const item of res) itemsById.set(item.id, item);
          return res;
        }
      }
    }
    if (q.startsWith('>') && !q.startsWith('>=') && !q.startsWith('>>') && q.length > 1) {
      const runP = byId.get('run');
      if (runP) {
        const res = await runP.search(`run: ${q.slice(1).trim()}`);
        if (res && res.length > 0) {
          for (const item of res) itemsById.set(item.id, item);
          return res;
        }
      }
    }
    if (q.startsWith('wsl:') || q.startsWith('wsl ')) {
      const wslP = byId.get('wsl');
      if (wslP) {
        const res = await wslP.search(q);
        if (res && res.length > 0) {
          for (const item of res) itemsById.set(item.id, item);
          return res;
        }
      }
    }
    if (q.startsWith('bt:') || q.startsWith('bluetooth:') || q.startsWith('bt ')) {
      const btP = byId.get('bluetooth');
      if (btP) {
        const res = await btP.search(q);
        if (res && res.length > 0) {
          for (const item of res) itemsById.set(item.id, item);
          return res;
        }
      }
    }
    if (q.startsWith('dns:') || q.startsWith('dns ')) {
      const dnsP = byId.get('dns');
      if (dnsP) {
        const res = await dnsP.search(q);
        if (res && res.length > 0) {
          for (const item of res) itemsById.set(item.id, item);
          return res;
        }
      }
    }
    if (q.startsWith('ext:') || q.startsWith('ext ')) {
      const extP = byId.get('sandboxed-extensions');
      if (extP) {
        const res = await extP.search(q);
        if (res && res.length > 0) {
          for (const item of res) itemsById.set(item.id, item);
          return res;
        }
      }
    }

    const aliasTarget = aliasManager.resolveAlias(q);

    const scored = [];
    let pCount = 0;
    for (const p of providers) {
      let produced;
      try { produced = await p.search(q); } catch { produced = []; }
      if (++pCount % 8 === 0) {
        await new Promise((resolve) => setImmediate(resolve));
      }
      for (const item of produced || []) {
        const s = scoreItem(q, item);
        if (s === null && !item.scoreBoost && !aliasTarget) continue;
        let aliasBoost = 0;
        if (aliasTarget) {
          if (item.id === aliasTarget || (item.keywords && item.keywords.includes(aliasTarget)) || p.id === aliasTarget) {
            aliasBoost = 1000;
          }
        }
        scored.push({
          item,
          score: (s === null ? 0 : s) + (item.scoreBoost || 0) + aliasBoost + frecencyBoost(item.id)
        });
      }
    }
    scored.sort((a, b) => b.score - a.score);

    // Sectioned list: each group stays contiguous, and groups are ordered by
    // their best match so the strongest provider still leads.
    const buckets = new Map();
    for (const entry of scored) {
      const g = entry.item.group || 'Other';
      if (!buckets.has(g)) buckets.set(g, []);
      buckets.get(g).push(entry);
    }

    const CAPS = {
      Applications: 12,
      'Window Management': 8,
      'Script Commands': 8,
      'Process Manager': 8,
      'Developer Tools': 8,
      'Raycast AI': 6,
      'Emojis & Symbols': 6,
      Notes: 6,
      Files: 8,
      'Clipboard History': 8,
      Commands: 10,
      Calculator: 3,
      Snippets: 6,
      Quicklinks: 4,
      'Web Search': 4,
      Translator: 6,
      Dictionary: 6,
      'Raycast Focus': 6,
      Calendar: 6,
      MCP: 6,
      Contacts: 6,
      Run: 6,
      'Typing Practice': 4,
      Weather: 4,
      Navigation: 8,
      'Screen Awareness': 6,
      Dictation: 6,
      Games: 8,
      'Listening Ports': 6,
      'Git Repositories': 6,
      'Docker Containers': 6,
      'GitHub / GitLab': 6,
      'Audio Endpoints': 6,
      'Windows Services': 8,
      'Environment Variables': 6,
      'Software Updates': 6,
      'Hosts File': 6,
      'Now Playing': 4,
      'Browser Bookmarks': 6,
      Workspaces: 6,
      'Color Picker': 6,
      'Task Manager': 8,
      'Wi-Fi': 6,
      'Power & Battery': 6,
      'Virtual Desktops': 4,
      'Disk Cleanup': 6,
      Reminders: 6,
      Bitwarden: 6,
      Utilities: 6,
      Terminal: 6,
      Projects: 6,
      Spotify: 6,
      'AI Commands': 6,
      Extensions: 6,
      'Windows Settings': 8,
      Registry: 8,
      'VS Code Workspaces': 8,
      'Window Walker': 8,
      'System Diagnostics': 6,
      'Time & Chronometrics': 6,
      'WSL Distributions': 8,
      'Bluetooth Devices': 8,
      'DNS Presets': 6,
      'Extensions (Sandboxed)': 6
    };
    const ordered = [...buckets.entries()]
      .map(([group, entries]) => ({ group, entries, best: entries[0].score }))
      .sort((a, b) => b.best - a.best);

    const out = [];
    for (const { group, entries } of ordered) {
      const cap = CAPS[group] ?? 8;
      for (const { item } of entries.slice(0, cap)) {
        out.push(item);
        if (out.length >= 50) break;
      }
      if (out.length >= 50) break;
    }

    // Fallback commands when 0 results matched
    if (out.length === 0) {
      const fallbacks = fallbackManager.getFallbackItems(q, {
        invokeAi: (prompt) => ai.ask(prompt),
        invokeTranslator: (text) => translator.translate(text, 'es'),
        invokeRun: (cmd) => windowsRun.runCommand(cmd)
      });
      for (const f of fallbacks) {
        out.push(f);
      }
    }

    for (const item of out) itemsById.set(item.id, item);
    return out;
  }

  async function execute(id, actionId) {
    const item = itemsById.get(id);
    if (!item) return { ok: false, error: 'unknown item' };
    const action = (item.actions || []).find((a) => a.id === actionId) || (item.actions || [])[0];
    if (!action || typeof action.run !== 'function') return { ok: false, error: 'no action' };
    const result = await action.run();
    remember(item.id);
    return result === undefined ? { ok: true } : result;
  }

  async function warm() {
    for (const p of providers) {
      if (typeof p.warm === 'function') {
        try { await p.warm(); } catch { /* provider is optional */ }
      }
    }
  }

  function dispose() {
    for (const p of providers) if (typeof p.dispose === 'function') p.dispose();
    store.flush();
  }

  return {
    search, execute, warm, dispose,
    getItem: (id) => itemsById.get(id),
    list: () => providers.map((p) => ({ id: p.id, name: p.name })),
    counts: () => Object.fromEntries(providers.map((p) => [p.id, (p.all() || []).length]))
  };
}

module.exports = { createRegistry, evaluateExpression, fuzzy };
