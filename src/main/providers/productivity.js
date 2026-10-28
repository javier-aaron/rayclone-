'use strict';

const { app, shell, clipboard } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const store = require('../store');
const { convert } = require('../converters');
const { searchEmojis, EMOJIS } = require('../emojis');
const notesManager = require('../notes');
const quicklinksManager = require('../quicklinks-manager');
const colorPicker = require('../color-picker');
const remindersManager = require('../reminders-manager');
const bitwardenBridge = require('../bitwarden-bridge');
const quickUtilities = require('../quick-utilities');
const games = require('../games');
const { fuzzy, scoreItem, evaluateExpression, saveCalcHistory, HOME } = require('./utils');

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


module.exports = {
  calculatorProvider,
  snippetsProvider,
  emojiProvider,
  notesProvider,
  parameterizedQuicklinksProvider,
  colorPickerProvider,
  remindersProvider,
  bitwardenProvider,
  quickUtilitiesProvider,
  gamesProvider
};
