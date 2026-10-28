'use strict';

const api = window.rayclone;

const input = document.getElementById('query');
const resultsEl = document.getElementById('results');
const clearBtn = document.getElementById('clear');
const statusEl = document.getElementById('status');
const actionsPopover = document.getElementById('actions-popover');
const actionsListEl = document.getElementById('actions-list');
const actionsItemNameEl = document.getElementById('actions-item-name');
const actionsTriggerBtn = document.getElementById('actions-trigger');

const previewPane = document.getElementById('preview-pane');
const previewEmpty = document.getElementById('preview-empty');
const previewContent = document.getElementById('preview-content');

const settingsModal = document.getElementById('settings-modal');
const settingsTriggerBtn = document.getElementById('settings-trigger');
const settingsCloseBtn = document.getElementById('settings-close');
const settingHotkeyInput = document.getElementById('setting-hotkey');
const btnSaveHotkey = document.getElementById('btn-save-hotkey');
const settingThemeSelect = document.getElementById('setting-theme');
const settingPreviewCheck = document.getElementById('setting-preview');
const settingAiProvider = document.getElementById('setting-ai-provider');
const settingAiEndpoint = document.getElementById('setting-ai-endpoint');
const settingAiModel = document.getElementById('setting-ai-model');
const settingAiKey = document.getElementById('setting-ai-key');
const settingTargetLang = document.getElementById('setting-target-lang');
const settingFocusDuration = document.getElementById('setting-focus-duration');
const btnSaveSettings = document.getElementById('btn-save-settings');
const settingsStatus = document.getElementById('settings-status');

let items = [];
let selected = 0;
let activeQuery = '';
let searchToken = 0;
let info = { hotkey: null };

let actionsOpen = false;
let actionSelected = 0;
let currentActions = [];

let settingsOpen = false;
let cachedSettings = {
  hotkey: 'Alt+Space',
  theme: 'dark',
  accentColor: '#ff6363',
  showPreview: true,
  aiProvider: 'ollama',
  aiEndpoint: 'http://localhost:11434',
  aiModel: 'llama3.2',
  aiApiKey: ''
};

/* ---------------------------------------------------------------- icons */

const GLYPHS = {
  calculator:
    '<rect x="3" y="1.5" width="10" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="1.4"/>' +
    '<path d="M5.5 5h5M5.5 8h1.5M8 8h1.5M10.5 8H12M5.5 11h1.5M8 11h1.5M10.5 11H12" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>',
  app:
    '<rect x="2.5" y="2.5" width="11" height="11" rx="3" fill="none" stroke="currentColor" stroke-width="1.4"/>' +
    '<circle cx="8" cy="8" r="2" fill="currentColor"/>',
  file:
    '<path d="M4 1.5h4.5L12 5v9.5H4z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>' +
    '<path d="M8.5 1.5V5H12" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>',
  clipboard:
    '<rect x="3.5" y="3" width="9" height="11.5" rx="2" fill="none" stroke="currentColor" stroke-width="1.4"/>' +
    '<rect x="6" y="1.5" width="4" height="3" rx="1" fill="currentColor"/>',
  folder:
    '<path d="M1.5 4.5A1.5 1.5 0 0 1 3 3h2.6l1.2 1.6H13A1.5 1.5 0 0 1 14.5 6.1v6.4A1.5 1.5 0 0 1 13 14H3a1.5 1.5 0 0 1-1.5-1.5z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>',
  power:
    '<path d="M8 1.8v5.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>' +
    '<path d="M4.6 4.3a4.8 4.8 0 1 0 6.8 0" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  gear:
    '<circle cx="8" cy="8" r="2.2" fill="none" stroke="currentColor" stroke-width="1.4"/>' +
    '<path d="M8 1.4v1.8M8 12.8v1.8M14.6 8h-1.8M3.2 8H1.4M12.7 3.3l-1.3 1.3M4.6 11.4l-1.3 1.3M12.7 12.7l-1.3-1.3M4.6 4.6 3.3 3.3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>',
  terminal:
    '<rect x="1.5" y="2.5" width="13" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.4"/>' +
    '<path d="M4.5 6.5 6.8 8.5 4.5 10.5M8.5 11h3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
  bolt:
    '<path d="M9.2 1.5 3.6 9h3.4l-.9 5.5L11.9 7H8.4z" fill="currentColor"/>',
  monitor:
    '<rect x="1.5" y="2.5" width="13" height="9" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.4"/>' +
    '<path d="M6 14h4M8 11.5V14" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>',
  speaker:
    '<path d="M2.5 6h2.2L8 3.4v9.2L4.7 10H2.5z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>' +
    '<path d="M10.5 6.2a2.6 2.6 0 0 1 0 3.6" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>',
  wifi:
    '<path d="M2 6.4a8.5 8.5 0 0 1 12 0" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>' +
    '<path d="M4.6 9a4.8 4.8 0 0 1 6.8 0" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>' +
    '<circle cx="8" cy="12.2" r="1.2" fill="currentColor"/>',
  download:
    '<path d="M8 2v8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>' +
    '<path d="M4.8 7 8 10.2 11.2 7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path d="M2.5 13.5h11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  bell:
    '<path d="M4 7a4 4 0 1 1 8 0c0 3 1.2 4 1.2 4H2.8S4 10 4 7z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>' +
    '<path d="M6.6 13a1.6 1.6 0 0 0 2.8 0" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>',
  trash:
    '<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 9h5.6l.7-9" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/>',
  moon:
    '<path d="M13 9.6A5.6 5.6 0 0 1 6.4 3a5.6 5.6 0 1 0 6.6 6.6z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>',
  camera:
    '<rect x="1.5" y="4" width="13" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="1.4"/>' +
    '<circle cx="8" cy="8.5" r="2.6" fill="none" stroke="currentColor" stroke-width="1.4"/>',
  globe:
    '<circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.3"/>' +
    '<ellipse cx="8" cy="8" rx="2.8" ry="6" fill="none" stroke="currentColor" stroke-width="1.3"/>' +
    '<path d="M2.5 8h11M3.5 5.2h9M3.5 10.8h9" stroke="currentColor" stroke-width="1.2"/>',
  google:
    '<path d="M13.5 8.2c0-.5-.04-1-.13-1.4H8v2.7h3.1a2.7 2.7 0 0 1-1.2 1.8v1.5h1.9c1.1-1 1.7-2.6 1.7-4.6z" fill="currentColor"/>' +
    '<path d="M8 14c1.6 0 3-.5 4-1.5l-1.9-1.5c-.5.4-1.2.6-2.1.6-1.6 0-3-1.1-3.5-2.6H2.6v1.6A6 6 0 0 0 8 14z" fill="currentColor"/>',
  youtube:
    '<rect x="1.5" y="3.5" width="13" height="9" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.4"/>' +
    '<path d="M6.5 6l4 2-4 2z" fill="currentColor"/>',
  github:
    '<path d="M8 1.5a6.5 6.5 0 0 0-2 12.7c.3.1.4-.1.4-.3v-1.2c-1.8.4-2.2-.8-2.2-.8-.3-.8-.7-1-.7-1-.6-.4 0-.4 0-.4.7 0 1 .7 1 .7.6 1 1.5.7 1.9.5 0-.4.2-.7.4-.9-1.4-.2-2.9-.7-2.9-3.2 0-.7.2-1.3.7-1.8 0-.2-.3-.8 0-1.8 0 0 .5-.2 1.8.7a6.2 6.2 0 0 1 3.2 0c1.3-.9 1.8-.7 1.8-.7.3 1 .1 1.6 0 1.8.5.5.7 1.1.7 1.8 0 2.5-1.5 3-2.9 3.2.2.2.4.6.4 1.2v1.8c0 .2.1.4.4.3A6.5 6.5 0 0 0 8 1.5z" fill="none" stroke="currentColor" stroke-width="1.2"/>',
  snippet:
    '<rect x="2.5" y="2" width="11" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.3"/>' +
    '<path d="M5 5.5h6M5 8.5h6M5 11.5h3.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>',
  currency:
    '<circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.3"/>' +
    '<path d="M8 4.2v7.6M6 6c.5-.7 1.3-1 2-1 1.5 0 2.2.8 2.2 1.6 0 2-4.4 1.6-4.4 3.6 0 1 .8 1.8 2.2 1.8 1 0 1.8-.4 2.2-1.1" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>',
  window:
    '<rect x="2" y="2" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.3"/>' +
    '<path d="M2 6h12" stroke="currentColor" stroke-width="1.2"/>',
  media:
    '<polygon points="5 4 12 8 5 12 5 4" fill="currentColor"/>',
  emoji:
    '<circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.3"/>' +
    '<circle cx="6" cy="7" r="0.9" fill="currentColor"/>' +
    '<circle cx="10" cy="7" r="0.9" fill="currentColor"/>' +
    '<path d="M5.5 9.5a3 3 0 0 0 5 0" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>',
  notes:
    '<rect x="3" y="2" width="10" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.3"/>' +
    '<path d="M5.5 5.5h5M5.5 8h5M5.5 10.5h3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>',
  theme:
    '<circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.3"/>' +
    '<path d="M8 2a6 6 0 0 0 0 12z" fill="currentColor"/>',
  code:
    '<path d="m5 6-3 2.5L5 11M11 6l3 2.5-3 2.5M9.5 4.5l-3 7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
  sparkle:
    '<path d="M8 1.5 9.5 6l4.5 1.5-4.5 1.5L8 13.5 6.5 9 2 7.5 6.5 6z" fill="currentColor"/>'
};

const NAME_TO_GLYPH = {
  lock: 'power', sleep: 'moon', restart: 'power', shutdown: 'power', signout: 'power',
  'empty-trash': 'trash', 'toggle-theme': 'theme',
  taskmgr: 'terminal', devmgmt: 'gear', diskmgmt: 'gear', services: 'gear',
  regedit: 'gear', control: 'gear', resmon: 'monitor', msinfo: 'monitor',
  terminal: 'terminal', cmd: 'terminal', powershell: 'terminal',
  display: 'monitor', sound: 'speaker', bluetooth: 'wifi', wifi: 'wifi',
  nightlight: 'moon', 'focus-assist': 'bell', 'sound-mixer': 'speaker',
  update: 'download', 'apps-features': 'app', notifications: 'bell',
  storage: 'folder', privacy: 'gear', datetime: 'gear', defaultapps: 'gear',
  screenclip: 'camera', project: 'monitor', 'data-folder': 'folder',
  'vol-up': 'speaker', 'vol-down': 'speaker', 'vol-mute': 'speaker',
  'media-play': 'media', 'media-next': 'media', 'media-prev': 'media',
  'win-left': 'window', 'win-right': 'window', 'win-max': 'window', 'win-min': 'window',
  currency: 'currency', snippet: 'snippet', globe: 'globe',
  google: 'google', youtube: 'youtube', github: 'github',
  emoji: 'emoji', notes: 'notes', code: 'code', sparkle: 'sparkle', settings: 'gear',
  'scripts-folder': 'code'
};

function glyphSvg(name) {
  const key = NAME_TO_GLYPH[name] || name;
  const path = GLYPHS[key] || GLYPHS.bolt;
  return `<svg viewBox="0 0 16 16" aria-hidden="true">${path}</svg>`;
}

function renderIcon(icon) {
  if (!icon) return glyphSvg('bolt');
  if (icon.kind === 'data') return `<img src="${icon.value}" alt="" />`;
  if (icon.kind === 'glyph') return glyphSvg(icon.name);
  return glyphSvg('bolt');
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function renderShortcut(sc) {
  if (!sc) return '';
  const tokens = sc.split('+');
  return tokens.map((t) => `<kbd>${escapeHtml(t.trim())}</kbd>`).join('');
}

/* ---------------------------------------------------------------- render */

function render() {
  if (!items.length) {
    resultsEl.innerHTML = activeQuery
      ? `<div class="empty"><strong>No results for &ldquo;${escapeHtml(activeQuery)}&rdquo;</strong>
         <span>Try an app name, a file, a conversion like 100 usd to eur, or a calculation</span></div>`
      : `<div class="empty"><strong>Start typing</strong>
         <span>Search apps, files, clipboard history, conversions and commands</span></div>`;
    closeActions();
    clearPreview();
    return;
  }

  const parts = [];
  let lastGroup = null;
  let flatIndex = 0;

  for (const item of items) {
    if (item.group !== lastGroup) {
      parts.push(`<div class="section-header">${escapeHtml(item.group || 'Results')}</div>`);
      lastGroup = item.group;
    }
    const primary = (item.actions || [])[0];
    const showAction = primary && primary.title && primary.title !== item.title;
    parts.push(
      `<div class="row${flatIndex === selected ? ' selected' : ''}" data-index="${flatIndex}" role="option" aria-selected="${flatIndex === selected}">` +
        `<div class="row-icon">${renderIcon(item.icon)}</div>` +
        `<div class="row-body">` +
          `<span class="row-title">${escapeHtml(item.title)}</span>` +
          (item.subtitle ? `<span class="row-subtitle">${escapeHtml(item.subtitle)}</span>` : '') +
        `</div>` +
        (showAction ? `<span class="row-action">${escapeHtml(primary.title)}</span>` : '') +
      `</div>`
    );
    flatIndex++;
  }

  resultsEl.innerHTML = parts.join('');
  const el = resultsEl.querySelector('.row.selected');
  if (el) el.scrollIntoView({ block: 'nearest' });

  if (actionsOpen) {
    renderActions();
  }

  updatePreview();
}

function setStatus() {
  if (!items.length) {
    statusEl.textContent = info.hotkey ? `Toggle with ${info.hotkey}` : '';
    return;
  }
  statusEl.innerHTML = `<b>${items.length}</b> ${items.length === 1 ? 'result' : 'results'}`;
}

/* ---------------------------------------------------------------- preview pane */

let previewDebounce = null;

function clearPreview() {
  previewContent.hidden = true;
  previewEmpty.hidden = false;
  previewEmpty.textContent = 'No item selected';
}

function updatePreview() {
  if (!cachedSettings.showPreview) {
    previewPane.hidden = true;
    return;
  }
  previewPane.hidden = false;

  const item = items[selected];
  if (!item) {
    clearPreview();
    return;
  }

  clearTimeout(previewDebounce);
  previewDebounce = setTimeout(async () => {
    try {
      const prev = await api.getPreview(item.id);
      if (!prev || items[selected]?.id !== item.id) return;

      previewEmpty.hidden = true;
      previewContent.hidden = false;

      let inner = `<div class="preview-title">${escapeHtml(prev.title || item.title)}</div>`;
      if (item.group) {
        inner += `<span class="preview-badge">${escapeHtml(item.group)}</span>`;
      }

      if (prev.type === 'image' && prev.dataUrl) {
        inner += `<div class="preview-image-wrap"><img src="${prev.dataUrl}" alt="" /></div>`;
      } else if (prev.type === 'text' && prev.content) {
        inner += `<div class="preview-code-block">${escapeHtml(prev.content)}</div>`;
      } else if ((prev.type === 'note' || prev.type === 'snippet') && prev.content) {
        inner += `<div class="preview-code-block">${escapeHtml(prev.content)}</div>`;
      } else if (prev.type === 'folder' && prev.content) {
        inner += `<div class="preview-code-block">${escapeHtml(prev.content)}</div>`;
      } else if (prev.type === 'translator') {
        inner += `<div style="margin:12px 0;padding:12px;background:var(--bg-card);border:1px solid var(--border);border-radius:8px;">` +
          `<div style="font-size:18px;font-weight:600;color:var(--brand);margin-bottom:6px;">${escapeHtml(prev.translatedText)}</div>` +
          `<div style="font-size:13px;color:var(--fg-60);">${escapeHtml(prev.sourceText)}</div>` +
        `</div>`;
      } else if (prev.type === 'dictionary') {
        inner += `<div style="margin:8px 0;font-size:13px;color:var(--brand);">${escapeHtml(prev.phonetic || '')}</div>`;
        if (prev.meanings && prev.meanings.length) {
          inner += '<div style="margin:10px 0;max-height:220px;overflow-y:auto;">';
          for (const m of prev.meanings.slice(0, 3)) {
            inner += `<div style="margin-bottom:8px;"><span style="font-size:11px;font-weight:700;color:var(--fg-40);text-transform:uppercase;">${escapeHtml(m.partOfSpeech)}</span>`;
            for (const d of (m.definitions || []).slice(0, 2)) {
              inner += `<div style="font-size:13px;margin:3px 0 3px 6px;">• ${escapeHtml(d.definition)}</div>`;
              if (d.example) inner += `<div style="font-size:11px;color:var(--fg-60);margin-left:12px;font-style:italic;">"${escapeHtml(d.example)}"</div>`;
            }
            inner += '</div>';
          }
          inner += '</div>';
        }
      } else if (prev.type === 'focus') {
        inner += `<div style="margin:16px 0;padding:16px;background:var(--bg-card);border:1px solid var(--border);border-radius:10px;text-align:center;">` +
          `<div style="font-size:36px;font-weight:700;letter-spacing:1px;color:var(--brand);">${escapeHtml(prev.remainingFormatted)}</div>` +
          `<div style="font-size:12px;color:var(--fg-60);margin-top:4px;">${escapeHtml(prev.category)} · ${escapeHtml(prev.state.toUpperCase())}</div>` +
          `<div style="margin-top:12px;height:6px;background:var(--border);border-radius:3px;overflow:hidden;"><div style="height:100%;width:${prev.progressPercent || 0}%;background:var(--brand);"></div></div>` +
        `</div>`;
      } else if (prev.type === 'calendar') {
        inner += `<div style="margin:12px 0;padding:12px;background:var(--bg-card);border:1px solid var(--border);border-radius:8px;">` +
          `<div style="font-size:14px;font-weight:600;margin-bottom:4px;">${escapeHtml(prev.title)}</div>` +
          `<div style="font-size:12px;color:var(--brand);margin-bottom:6px;">${escapeHtml(prev.date || '')}</div>` +
          (prev.meetingUrl ? `<div style="font-size:11px;color:var(--fg-60);word-break:break-all;">${escapeHtml(prev.meetingUrl)}</div>` : '') +
        `</div>`;
      } else if (prev.type === 'weather') {
        inner += `<div style="margin:16px 0;padding:16px;background:var(--bg-card);border:1px solid var(--border);border-radius:10px;">` +
          `<div style="font-size:28px;font-weight:700;color:var(--brand);margin-bottom:4px;">${escapeHtml(prev.temp || '')}</div>` +
          `<div style="font-size:14px;color:var(--fg);">${escapeHtml(prev.condition || '')}</div>` +
        `</div>`;
      } else if (prev.type === 'contacts') {
        inner += `<div style="margin:12px 0;padding:12px;background:var(--bg-card);border:1px solid var(--border);border-radius:8px;">` +
          `<div style="font-size:16px;font-weight:600;margin-bottom:2px;">${escapeHtml(prev.title)}</div>` +
          `<div style="font-size:12px;color:var(--brand);margin-bottom:6px;">${escapeHtml(prev.role || '')} · ${escapeHtml(prev.company || '')}</div>` +
          `<div style="font-size:12px;color:var(--fg-60);">✉ ${escapeHtml(prev.email || '')}</div>` +
          `<div style="font-size:12px;color:var(--fg-60);margin-top:2px;">☎ ${escapeHtml(prev.phone || '')}</div>` +
        `</div>`;
      } else if (prev.type === 'mcp') {
        inner += `<div style="margin:10px 0;font-size:12px;color:var(--fg-60);">${escapeHtml(prev.description || '')}</div>`;
        if (prev.tools && prev.tools.length) {
          inner += '<div style="margin-top:8px;font-size:11px;font-weight:700;color:var(--fg-40);">AVAILABLE TOOLS:</div>';
          inner += '<div style="margin-top:4px;max-height:160px;overflow-y:auto;">';
          for (const t of prev.tools) {
            inner += `<div style="padding:4px 0;font-size:12px;border-bottom:1px solid var(--border);"><span style="color:var(--brand);font-weight:600;">${escapeHtml(t.name)}</span> — <span style="color:var(--fg-60);">${escapeHtml(t.description || '')}</span></div>`;
          }
          inner += '</div>';
        }
      } else if (prev.type === 'typing') {
        inner += `<div style="margin:16px 0;padding:16px;background:var(--bg-card);border:1px solid var(--border);border-radius:10px;">` +
          `<div style="font-size:15px;line-height:1.5;font-style:italic;margin-bottom:8px;">"${escapeHtml(prev.text || '')}"</div>` +
          `<div style="font-size:12px;color:var(--brand);font-weight:600;">— ${escapeHtml(prev.author || '')}</div>` +
        `</div>`;
      } else if (prev.type === 'windows-run') {
        inner += `<div style="margin:12px 0;padding:12px;background:var(--bg-card);border:1px solid var(--border);border-radius:8px;">` +
          `<div style="font-family:monospace;font-size:14px;color:var(--brand);margin-bottom:6px;">${escapeHtml(prev.command || '')}</div>` +
          `<div style="font-size:12px;color:var(--fg-60);">${escapeHtml(prev.description || '')}</div>` +
        `</div>`;
      } else if (prev.type === 'dictation') {
        inner += `<div style="margin:12px 0;padding:12px;background:var(--bg-card);border:1px solid var(--border);border-radius:8px;">` +
          `<div style="font-size:14px;line-height:1.4;margin-bottom:8px;">"${escapeHtml(prev.text || '')}"</div>` +
          `<div style="font-size:11px;color:var(--brand);font-weight:600;">🎙 ${escapeHtml(prev.source || 'Voice Typing')} · ${escapeHtml(prev.timestamp || '')}</div>` +
        `</div>`;
      } else if (prev.type === 'games') {
        inner += `<div style="margin:12px 0;padding:12px;background:var(--bg-card);border:1px solid var(--border);border-radius:8px;">` +
          `<div style="font-size:16px;font-weight:700;color:var(--brand);margin-bottom:4px;">${escapeHtml(prev.title || '')}</div>` +
          `<div style="font-size:12px;color:var(--fg-60);margin-bottom:6px;">${escapeHtml(prev.genre || 'Game')} · ${escapeHtml(prev.platform || 'PC')}</div>` +
          `<div style="font-size:12px;">${escapeHtml(prev.description || '')}</div>` +
        `</div>`;
      } else if (prev.type === 'media') {
        inner += `<div style="margin:16px 0;padding:16px;background:var(--bg-card);border:1px solid var(--border);border-radius:10px;">` +
          `<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">` +
            `<div style="width:48px;height:48px;background:var(--brand);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:24px;color:#fff;">🎵</div>` +
            `<div style="flex:1;min-width:0;">` +
              `<div style="font-size:16px;font-weight:700;color:var(--fg);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(prev.title || '')}</div>` +
              `<div style="font-size:13px;color:var(--brand);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(prev.artist || '')}</div>` +
              `<div style="font-size:11px;color:var(--fg-60);margin-top:2px;">${escapeHtml(prev.album || '')}</div>` +
            `</div>` +
          `</div>` +
          `<div style="display:flex;justify-content:space-between;align-items:center;padding-top:10px;border-top:1px solid var(--border);font-size:12px;">` +
            `<span style="color:var(--brand);font-weight:600;">${escapeHtml(prev.status || 'Playing')}</span>` +
            `<span style="color:var(--fg-60);">${escapeHtml(prev.app || '')}</span>` +
            `<span style="color:var(--fg-80);">Vol: ${prev.volume !== undefined ? prev.volume : 50}%</span>` +
          `</div>` +
        `</div>`;
      } else if (prev.type === 'quicklink') {
        inner += `<div style="margin:16px 0;padding:16px;background:var(--bg-card);border:1px solid var(--border);border-radius:10px;">` +
          `<div style="font-size:15px;font-weight:700;color:var(--brand);margin-bottom:6px;">${escapeHtml(prev.templateName || prev.title || 'Quicklink')}</div>` +
          `<div style="font-size:12px;color:var(--fg-90);font-family:monospace;word-break:break-all;margin-bottom:8px;">${escapeHtml(prev.resolvedUrl || prev.url || '')}</div>` +
          (prev.templatePattern ? `<div style="font-size:11px;color:var(--fg-60);">Pattern: ${escapeHtml(prev.templatePattern)}</div>` : '') +
        `</div>`;
      } else if (item.subtitle) {
        inner += `<div style="font-size:12px;color:var(--fg-60);margin-top:8px;">${escapeHtml(item.subtitle)}</div>`;
      }

      // Metadata rows
      const meta = [];
      if (prev.size) meta.push(['Size', prev.size]);
      if (prev.modified) meta.push(['Modified', prev.modified]);
      if (prev.path) meta.push(['Location', prev.path]);
      if (prev.pid) meta.push(['PID', prev.pid]);
      if (prev.memory) meta.push(['Memory', prev.memory]);
      if (prev.mode) meta.push(['Mode', prev.mode]);
      if (prev.provider) meta.push(['Engine', prev.provider]);
      if (prev.platform) meta.push(['Platform', prev.platform]);
      if (prev.humidity) meta.push(['Humidity', prev.humidity]);
      if (prev.wind) meta.push(['Wind Speed', prev.wind]);
      if (prev.app) meta.push(['Application', prev.app]);
      if (prev.status) meta.push(['Status', prev.status]);
      if (prev.volume !== undefined) meta.push(['Volume', `${prev.volume}%`]);

      if (meta.length) {
        inner += '<div class="preview-meta-list">';
        for (const [k, v] of meta) {
          inner += `<div class="preview-meta-row"><span class="preview-meta-key">${escapeHtml(k)}</span><span class="preview-meta-val">${escapeHtml(v)}</span></div>`;
        }
        inner += '</div>';
      }

      previewContent.innerHTML = inner;
    } catch {
      clearPreview();
    }
  }, 40);
}

/* ---------------------------------------------------------------- actions menu */

function openActions() {
  const item = items[selected];
  if (!item || !item.actions || !item.actions.length) return;
  currentActions = item.actions;
  actionSelected = 0;
  actionsOpen = true;
  actionsItemNameEl.textContent = item.title;
  actionsTriggerBtn.classList.add('active');
  renderActions();
  actionsPopover.hidden = false;
}

function closeActions() {
  actionsOpen = false;
  actionsPopover.hidden = true;
  actionsTriggerBtn.classList.remove('active');
  currentActions = [];
  actionSelected = 0;
  input.focus();
}

function toggleActions() {
  if (actionsOpen) closeActions();
  else openActions();
}

function renderActions() {
  const parts = [];
  currentActions.forEach((act, idx) => {
    parts.push(
      `<div class="action-row${idx === actionSelected ? ' selected' : ''}" data-action-index="${idx}">` +
        `<span class="action-name">${escapeHtml(act.title)}</span>` +
        (act.shortcut ? `<span class="action-shortcut">${renderShortcut(act.shortcut)}</span>` : '') +
      `</div>`
    );
  });
  actionsListEl.innerHTML = parts.join('');
  const el = actionsListEl.querySelector('.action-row.selected');
  if (el) el.scrollIntoView({ block: 'nearest' });
}

function moveAction(delta) {
  if (!currentActions.length) return;
  actionSelected = Math.max(0, Math.min(currentActions.length - 1, actionSelected + delta));
  renderActions();
}

const confettiCanvas = document.getElementById('confetti-canvas');
function triggerConfetti() {
  if (!confettiCanvas) return;
  confettiCanvas.hidden = false;
  confettiCanvas.width = confettiCanvas.offsetWidth || 960;
  confettiCanvas.height = confettiCanvas.offsetHeight || 500;
  const ctx = confettiCanvas.getContext('2d');
  const pieces = [];
  const colors = ['#ff6363', '#68d391', '#63b3ed', '#f6e05e', '#b794f4', '#f687b3'];
  for (let i = 0; i < 75; i++) {
    pieces.push({
      x: Math.random() * confettiCanvas.width,
      y: Math.random() * confettiCanvas.height * 0.4,
      w: Math.random() * 8 + 4,
      h: Math.random() * 6 + 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      vx: (Math.random() - 0.5) * 4,
      vy: Math.random() * 3 + 2,
      rot: Math.random() * Math.PI,
      vrot: (Math.random() - 0.5) * 0.2
    });
  }
  let frames = 0;
  function anim() {
    ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
    for (const p of pieces) {
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vrot;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    frames++;
    if (frames < 90) {
      requestAnimationFrame(anim);
    } else {
      ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
      confettiCanvas.hidden = true;
    }
  }
  requestAnimationFrame(anim);
}

async function executeAction(actionId) {
  const item = items[selected];
  if (!item) return;
  closeActions();
  const res = await api.execute(item.id, actionId);
  if (res && res.result && res.result.confetti) {
    triggerConfetti();
  }
}

/* ---------------------------------------------------------------- settings */

async function openSettings() {
  closeActions();
  settingsOpen = true;
  try {
    cachedSettings = await api.getSettings();
  } catch {}

  settingHotkeyInput.value = cachedSettings.hotkey || 'Alt+Space';
  settingThemeSelect.value = cachedSettings.theme || 'dark';
  settingPreviewCheck.checked = cachedSettings.showPreview !== false;
  settingAiProvider.value = cachedSettings.aiProvider || 'ollama';
  settingAiEndpoint.value = cachedSettings.aiEndpoint || 'http://localhost:11434';
  settingAiModel.value = cachedSettings.aiModel || 'llama3.2';
  settingAiKey.value = cachedSettings.aiApiKey || '';
  if (settingTargetLang) settingTargetLang.value = cachedSettings.targetLanguage || 'es';
  if (settingFocusDuration) settingFocusDuration.value = cachedSettings.focusDuration || 25;
  settingsStatus.textContent = '';

  // Update color swatch selection
  document.querySelectorAll('.color-swatch').forEach((sw) => {
    if (sw.dataset.color.toLowerCase() === (cachedSettings.accentColor || '#ff6363').toLowerCase()) {
      sw.classList.add('active');
    } else {
      sw.classList.remove('active');
    }
  });

  settingsModal.hidden = false;
}

function closeSettings() {
  settingsOpen = false;
  settingsModal.hidden = true;
  input.focus();
}

async function saveAllSettings() {
  const patch = {
    hotkey: settingHotkeyInput.value.trim() || 'Alt+Space',
    theme: settingThemeSelect.value,
    showPreview: settingPreviewCheck.checked,
    aiProvider: settingAiProvider.value,
    aiEndpoint: settingAiEndpoint.value.trim() || 'http://localhost:11434',
    aiModel: settingAiModel.value.trim() || 'llama3.2',
    aiApiKey: settingAiKey.value.trim(),
    targetLanguage: settingTargetLang ? settingTargetLang.value : 'es',
    focusDuration: settingFocusDuration ? (parseInt(settingFocusDuration.value, 10) || 25) : 25,
    accentColor: cachedSettings.accentColor || '#ff6363'
  };

  const res = await api.updateSettings(patch);
  if (res && res.ok) {
    cachedSettings = res.settings;
    applyTheme(cachedSettings);
    settingsStatus.textContent = 'Settings saved successfully!';
    setTimeout(() => {
      if (settingsOpen) closeSettings();
    }, 600);
  } else {
    settingsStatus.textContent = res.error || 'Failed to update settings';
  }
}

function applyTheme(s) {
  document.documentElement.setAttribute('data-theme', s.theme || 'dark');
  if (s.accentColor) {
    document.documentElement.style.setProperty('--brand', s.accentColor);
  }
  if (s.showPreview === false) {
    previewPane.hidden = true;
  } else {
    previewPane.hidden = false;
  }
}

/* ---------------------------------------------------------------- search */

async function runSearch(q) {
  activeQuery = q;
  const token = ++searchToken;
  const res = await api.search(q);
  if (token !== searchToken) return;
  items = (res && res.items) || [];
  selected = 0;
  render();
  setStatus();
}

function scheduleSearch() {
  const q = input.value;
  clearBtn.hidden = q.length === 0;
  closeActions();
  clearTimeout(scheduleSearch.timer);
  scheduleSearch.timer = setTimeout(() => runSearch(q), 50);
}

async function executeSelected() {
  const item = items[selected];
  if (!item) return;
  const action = (item.actions || [])[0];
  const res = await api.execute(item.id, action ? action.id : undefined);
  if (res && res.result && res.result.confetti) {
    triggerConfetti();
  }
}

function move(delta) {
  if (!items.length) return;
  selected = Math.max(0, Math.min(items.length - 1, selected + delta));
  render();
}

/* ---------------------------------------------------------------- events */

input.addEventListener('input', scheduleSearch);

input.addEventListener('keydown', (e) => {
  // Settings modal is OPEN
  if (settingsOpen) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeSettings();
    }
    return;
  }

  // Toggle settings with Ctrl+,
  if (e.ctrlKey && e.key === ',') {
    e.preventDefault();
    openSettings();
    return;
  }

  // Actions popover is OPEN
  if (actionsOpen) {
    if (e.key === 'ArrowDown') { e.preventDefault(); moveAction(1); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); moveAction(-1); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      const act = currentActions[actionSelected];
      if (act) executeAction(act.id);
      return;
    }
    if (e.key === 'Escape' || (e.key === 'k' && e.ctrlKey)) {
      e.preventDefault();
      closeActions();
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      moveAction(e.shiftKey ? -1 : 1);
      return;
    }
    return;
  }

  // Actions popover is CLOSED
  if (e.key === 'k' && e.ctrlKey) {
    e.preventDefault();
    openActions();
    return;
  }

  // Quick action shortcuts
  const currentItem = items[selected];
  if (currentItem && currentItem.actions) {
    if (e.ctrlKey && e.shiftKey && (e.key === 'O' || e.key === 'o')) {
      const act = currentItem.actions.find((a) => a.id === 'reveal');
      if (act) { e.preventDefault(); executeAction(act.id); return; }
    }
    if (e.ctrlKey && e.shiftKey && (e.key === 'C' || e.key === 'c')) {
      const act = currentItem.actions.find((a) => a.id === 'copy-path');
      if (act) { e.preventDefault(); executeAction(act.id); return; }
    }
    if (e.ctrlKey && !e.shiftKey && (e.key === 'C' || e.key === 'c') && input.selectionStart === input.selectionEnd) {
      const act = currentItem.actions.find((a) => a.id === 'copy' || a.id === 'copy-text' || a.id === 'copy-expr');
      if (act) { e.preventDefault(); executeAction(act.id); return; }
    }
    if (e.ctrlKey && (e.key === 'd' || e.key === 'D')) {
      const act = currentItem.actions.find((a) => a.id === 'remove' || a.id === 'delete' || a.id === 'kill');
      if (act) { e.preventDefault(); executeAction(act.id); return; }
    }
  }

  switch (e.key) {
    case 'ArrowDown': e.preventDefault(); move(1); break;
    case 'ArrowUp': e.preventDefault(); move(-1); break;
    case 'Enter': e.preventDefault(); executeSelected(); break;
    case 'Escape':
      e.preventDefault();
      if (input.value) {
        input.value = '';
        clearBtn.hidden = true;
        runSearch('');
      } else {
        api.hide();
      }
      break;
    case 'Home': e.preventDefault(); selected = 0; render(); break;
    case 'End': e.preventDefault(); selected = items.length - 1; render(); break;
    default: break;
  }
});

clearBtn.addEventListener('click', () => {
  input.value = '';
  clearBtn.hidden = true;
  closeActions();
  input.focus();
  runSearch('');
});

resultsEl.addEventListener('mousemove', (e) => {
  if (actionsOpen || settingsOpen) return;
  const row = e.target.closest('.row');
  if (!row) return;
  const index = Number(row.dataset.index);
  if (Number.isInteger(index) && index !== selected) {
    selected = index;
    render();
  }
});

resultsEl.addEventListener('click', (e) => {
  if (settingsOpen) return;
  const row = e.target.closest('.row');
  if (!row) return;
  selected = Number(row.dataset.index) || 0;
  executeSelected();
});

actionsTriggerBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleActions();
});

settingsTriggerBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  openSettings();
});

settingsCloseBtn.addEventListener('click', closeSettings);
btnSaveSettings.addEventListener('click', saveAllSettings);

btnSaveHotkey.addEventListener('click', async () => {
  const key = settingHotkeyInput.value.trim();
  if (!key) return;
  const valRes = await api.validateHotkey(key);
  if (!valRes.ok) {
    settingsStatus.textContent = `Hotkey invalid or in use (${valRes.error || 'registration failed'})`;
    return;
  }
  const res = await api.updateSettings({ hotkey: key });
  if (res && res.ok) {
    settingsStatus.textContent = `Hotkey updated to ${key}!`;
  }
});

// Color swatch click handlers
document.querySelectorAll('.color-swatch').forEach((sw) => {
  sw.addEventListener('click', () => {
    document.querySelectorAll('.color-swatch').forEach((s) => s.classList.remove('active'));
    sw.classList.add('active');
    cachedSettings.accentColor = sw.dataset.color;
    document.documentElement.style.setProperty('--brand', sw.dataset.color);
  });
});

settingThemeSelect.addEventListener('change', () => {
  document.documentElement.setAttribute('data-theme', settingThemeSelect.value);
});

actionsListEl.addEventListener('mousemove', (e) => {
  const row = e.target.closest('.action-row');
  if (!row) return;
  const index = Number(row.dataset.actionIndex);
  if (Number.isInteger(index) && index !== actionSelected) {
    actionSelected = index;
    renderActions();
  }
});

actionsListEl.addEventListener('click', (e) => {
  const row = e.target.closest('.action-row');
  if (!row) return;
  const index = Number(row.dataset.actionIndex) || 0;
  const act = currentActions[index];
  if (act) executeAction(act.id);
});

document.addEventListener('click', (e) => {
  if (actionsOpen && !actionsPopover.contains(e.target) && e.target !== actionsTriggerBtn) {
    closeActions();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (settingsOpen) closeSettings();
    else if (actionsOpen) closeActions();
    else api.hide();
  }
});

api.onShown(() => {
  input.value = '';
  clearBtn.hidden = true;
  selected = 0;
  closeActions();
  if (settingsOpen) closeSettings();
  input.focus();
  runSearch('');
});

api.onHidden(() => {
  input.value = '';
  items = [];
  selected = 0;
  closeActions();
  if (settingsOpen) closeSettings();
  resultsEl.innerHTML = '';
});

api.onOpenSettings(() => {
  openSettings();
});

api.onSettingsChanged((s) => {
  cachedSettings = s;
  applyTheme(s);
});

api.getSettings().then((s) => {
  if (s) {
    cachedSettings = s;
    applyTheme(s);
  }
}).catch(() => {});

api.info().then((res) => {
  if (res && res.ok) info = res;
  setStatus();
}).catch(() => {});

input.focus();
runSearch('');

/* ---------------------------------------------------------------- floating HUD mode */

const hudContainer = document.getElementById('hud-container');
const hudTitle = document.getElementById('hud-title');
const hudBody = document.getElementById('hud-body');
const hudCloseBtn = document.getElementById('hud-close');
const hudDetachBtn = document.getElementById('hud-detach-trigger');

const isHudMode = window.location.search.includes('mode=hud');

if (isHudMode) {
  const launcherWindow = document.querySelector('.window');
  if (launcherWindow) launcherWindow.style.display = 'none';
  if (hudContainer) hudContainer.hidden = false;

  function renderHud(payload) {
    if (!payload) payload = { type: 'note', title: 'Scratchpad', content: '' };
    if (hudTitle) hudTitle.textContent = payload.title || 'HUD Widget';
    if (!hudBody) return;

    if (payload.type === 'note' || payload.type === 'scratchpad' || !payload.type) {
      hudBody.innerHTML = `<textarea class="hud-textarea" placeholder="Type quick notes here...">${escapeHtml(payload.content || '')}</textarea>`;
    } else if (payload.type === 'conversion' && payload.data) {
      hudBody.innerHTML = `<div class="hud-card">` +
        `<div class="hud-card-title">${escapeHtml(payload.title || 'Conversion')}</div>` +
        `<div style="font-size:18px;font-weight:700;color:var(--fg);margin:8px 0;">${escapeHtml(payload.data.to || payload.content || '')}</div>` +
        `<div class="hud-card-desc">${escapeHtml(payload.data.from || '')}</div>` +
      `</div>`;
    } else if (payload.type === 'git' && payload.data) {
      hudBody.innerHTML = `<div class="hud-card">` +
        `<div class="hud-card-title">${escapeHtml(payload.title || 'Git Repository')}</div>` +
        `<div style="font-size:14px;color:var(--brand);margin:6px 0;">Branch: ${escapeHtml(payload.data.branch || 'main')}</div>` +
        `<div class="hud-card-desc">${payload.data.dirty ? `Dirty worktree (${payload.data.dirtyCount || 1} modified)` : 'Clean working directory'}</div>` +
      `</div>`;
    } else if (payload.type === 'media') {
      hudBody.innerHTML = `<div class="hud-card">` +
        `<div class="hud-card-title">${escapeHtml(payload.title || 'Now Playing')}</div>` +
        `<div style="font-size:13px;color:var(--fg);margin-top:4px;">${escapeHtml(payload.artist || '')}</div>` +
        `<div class="hud-card-desc">${escapeHtml(payload.album || '')} · ${escapeHtml(payload.status || 'Playing')}</div>` +
      `</div>`;
    } else {
      hudBody.innerHTML = `<div class="hud-card">` +
        `<div class="hud-card-title">${escapeHtml(payload.title || 'Widget')}</div>` +
        `<div class="hud-card-desc" style="white-space:pre-wrap;">${escapeHtml(payload.content || JSON.stringify(payload.data || '', null, 2))}</div>` +
      `</div>`;
    }
  }

  if (api.onHudLoad) {
    api.onHudLoad((payload) => renderHud(payload));
  }
  if (api.hudGetPayload) {
    api.hudGetPayload().then((p) => { if (p) renderHud(p); }).catch(() => {});
  }
  if (hudCloseBtn) {
    hudCloseBtn.addEventListener('click', () => {
      if (api.hudClose) api.hudClose();
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (api.hudClose) api.hudClose();
    }
  });
}

async function detachCurrentItem() {
  const item = items[selected];
  let payload = null;
  if (item) {
    let prev = null;
    try { prev = await api.getPreview(item.id); } catch {}
    payload = {
      id: item.id,
      type: prev?.type || 'note',
      title: prev?.title || item.title || 'Detached Item',
      content: prev?.content || item.subtitle || '',
      data: prev || item
    };
  } else {
    payload = { type: 'note', title: 'Scratchpad', content: input.value || '' };
  }

  if (api.hudDetach) {
    await api.hudDetach(payload);
  }
}

if (hudDetachBtn) {
  hudDetachBtn.addEventListener('click', () => detachCurrentItem());
}

if (api.onHudRequestDetach) {
  api.onHudRequestDetach(() => detachCurrentItem());
}

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
    e.preventDefault();
    detachCurrentItem();
  }
});
