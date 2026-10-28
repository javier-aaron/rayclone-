'use strict';

const { clipboard, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const store = require('../store');
const ai = require('../ai');
const aiCommands = require('../ai-commands');
const mcp = require('../mcp');
const screenAwareness = require('../screen-awareness');
const dictation = require('../dictation');
const { fuzzy, scoreItem, HOME } = require('./utils');

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


module.exports = {
  aiProvider,
  mcpProvider,
  screenAwarenessProvider,
  dictationProvider,
  aiCommandsProvider
};
