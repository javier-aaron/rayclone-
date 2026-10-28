'use strict';

const store = require('./store');

const DEFAULT_TEMPLATES = [
  {
    id: 'ql:jira',
    name: 'Jira Issue',
    prefix: 'jira',
    template: 'https://jira.company.com/browse/{ticket}',
    description: 'Open Jira issue ticket'
  },
  {
    id: 'ql:gh-pr',
    name: 'GitHub PR',
    prefix: 'pr',
    template: 'https://github.com/{owner}/{repo}/pull/{number}',
    description: 'Open GitHub Pull Request'
  },
  {
    id: 'ql:linear',
    name: 'Linear Issue',
    prefix: 'lin',
    template: 'https://linear.app/{workspace}/issue/{issue}',
    description: 'Open Linear issue'
  },
  {
    id: 'ql:npm-pkg',
    name: 'npm Package',
    prefix: 'npm',
    template: 'https://www.npmjs.com/package/{package}',
    description: 'View npm package page'
  },
  {
    id: 'ql:so',
    name: 'StackOverflow',
    prefix: 'so',
    template: 'https://stackoverflow.com/search?q={query}',
    description: 'Search Stack Overflow'
  }
];

/**
 * Replaces placeholders {param} with URI-encoded arguments.
 * If template has 1 placeholder and multiple arguments were provided,
 * joins all arguments into a single string.
 */
function interpolate(template, args = []) {
  const placeholders = [...String(template || '').matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((m) => m[1]);
  if (placeholders.length === 0) return { url: template, missing: [] };

  let url = template;
  const missing = [];

  for (let i = 0; i < placeholders.length; i++) {
    const ph = placeholders[i];
    let val = args[i];
    if (placeholders.length === 1 && args.length > 1) {
      val = args.join(' ');
    }

    if (val !== undefined && val !== null && String(val).trim() !== '') {
      url = url.replace(new RegExp(`\\{${ph}\\}`, 'g'), encodeURIComponent(String(val)));
    } else {
      missing.push(ph);
    }
  }

  return { url, missing };
}

/**
 * Factory creating an engine instance with dynamic template registration.
 */
function createEngine(customTemplates = []) {
  let stored = [];
  try {
    stored = store.read('parameterized_quicklinks', []);
    if (!Array.isArray(stored)) stored = [];
  } catch {}

  const templates = [
    ...DEFAULT_TEMPLATES.map((t) => ({ ...t })),
    ...stored,
    ...customTemplates
  ];

  function matchQuery(query) {
    const q = String(query || '').trim();
    if (!q) return null;

    const parts = q.split(/\s+/);
    const prefix = parts[0]?.toLowerCase();
    const args = parts.slice(1);

    const t = templates.find((item) => item.prefix.toLowerCase() === prefix);
    if (!t) return null;

    const { url, missing } = interpolate(t.template, args);
    return {
      matched: true,
      template: t,
      args,
      resolvedUrl: url,
      isComplete: missing.length === 0,
      missingParams: missing
    };
  }

  function addTemplate(template) {
    if (!template || !template.id || !template.prefix || !template.template) return null;
    const existingIdx = templates.findIndex((t) => t.id === template.id);
    if (existingIdx !== -1) {
      templates[existingIdx] = template;
    } else {
      templates.push(template);
    }
    try {
      store.write('parameterized_quicklinks', templates.filter((t) => !DEFAULT_TEMPLATES.some((d) => d.id === t.id)));
    } catch {}
    return template;
  }

  function deleteTemplate(id) {
    const idx = templates.findIndex((t) => t.id === id);
    if (idx === -1) return false;
    templates.splice(idx, 1);
    try {
      store.write('parameterized_quicklinks', templates.filter((t) => !DEFAULT_TEMPLATES.some((d) => d.id === t.id)));
    } catch {}
    return true;
  }

  function getTemplates() {
    return templates.slice();
  }

  return {
    templates,
    interpolate,
    matchQuery,
    addTemplate,
    deleteTemplate,
    getTemplates
  };
}

// Global default engine instance for provider and preview routing
const defaultEngine = createEngine();

module.exports = {
  DEFAULT_TEMPLATES,
  interpolate,
  createEngine,
  matchQuery: (q) => defaultEngine.matchQuery(q),
  getTemplates: () => defaultEngine.getTemplates(),
  addTemplate: (t) => defaultEngine.addTemplate(t),
  deleteTemplate: (id) => defaultEngine.deleteTemplate(id)
};
