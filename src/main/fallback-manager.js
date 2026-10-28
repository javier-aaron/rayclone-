'use strict';

const { shell } = require('electron');

const FALLBACK_ENGINES = [
  {
    id: 'fallback-google',
    title: (q) => `Search Google: "${q}"`,
    subtitle: 'Open web search in default browser',
    icon: '🌐',
    group: 'Web Search',
    action: (q) => shell.openExternal(`https://www.google.com/search?q=${encodeURIComponent(q)}`)
  },
  {
    id: 'fallback-ddg',
    title: (q) => `Search DuckDuckGo: "${q}"`,
    subtitle: 'Private web search',
    icon: '🦆',
    group: 'Web Search',
    action: (q) => shell.openExternal(`https://duckduckgo.com/?q=${encodeURIComponent(q)}`)
  },
  {
    id: 'fallback-github',
    title: (q) => `Search GitHub: "${q}"`,
    subtitle: 'Find repositories, code, and issues',
    icon: '🐙',
    group: 'Developer Tools',
    action: (q) => shell.openExternal(`https://github.com/search?q=${encodeURIComponent(q)}`)
  },
  {
    id: 'fallback-youtube',
    title: (q) => `Search YouTube: "${q}"`,
    subtitle: 'Search videos and music',
    icon: '▶️',
    group: 'Media',
    action: (q) => shell.openExternal(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`)
  },
  {
    id: 'fallback-ai',
    title: (q) => `Ask AI: "${q}"`,
    subtitle: 'Send prompt to local Ollama / OpenAI model',
    icon: '✨',
    group: 'Raycast AI',
    action: async (q, ctx) => {
      if (ctx && typeof ctx.invokeAi === 'function') {
        return ctx.invokeAi(q);
      }
      return shell.openExternal(`https://chatgpt.com/?q=${encodeURIComponent(q)}`);
    }
  },
  {
    id: 'fallback-translate',
    title: (q) => `Translate: "${q}"`,
    subtitle: 'Translate text via offline translator engine',
    icon: '🌐',
    group: 'Translator',
    action: async (q, ctx) => {
      if (ctx && typeof ctx.invokeTranslator === 'function') {
        return ctx.invokeTranslator(q);
      }
      return shell.openExternal(`https://translate.google.com/?text=${encodeURIComponent(q)}`);
    }
  },
  {
    id: 'fallback-run',
    title: (q) => `Run: "${q}"`,
    subtitle: 'Execute command directly in Windows Run',
    icon: '⚡',
    group: 'Run',
    action: async (q, ctx) => {
      if (ctx && typeof ctx.invokeRun === 'function') {
        return ctx.invokeRun(q);
      }
      const { exec } = require('node:child_process');
      exec(q);
    }
  }
];

function getFallbackItems(query, context = {}) {
  const q = String(query || '').trim();
  if (!q) return [];

  return FALLBACK_ENGINES.map((engine) => ({
    id: `${engine.id}-${encodeURIComponent(q)}`,
    title: engine.title(q),
    subtitle: engine.subtitle,
    icon: engine.icon,
    group: engine.group,
    scoreBoost: 5,
    fallback: true,
    actions: [
      {
        id: 'execute-fallback',
        title: engine.title(q),
        run: () => engine.action(q, context)
      }
    ]
  }));
}

module.exports = {
  FALLBACK_ENGINES,
  getFallbackItems
};
