'use strict';

const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');
const path = require('node:path');
const os = require('node:os');

// Standard Curated Extensions with sandboxed implementations
const BUILTIN_EXTENSIONS = [
  {
    id: 'ext:hash-inspector',
    name: 'Hash & Cryptography Inspector',
    description: 'Computes MD5, SHA-1, SHA-256, and SHA-512 hashes in an isolated worker',
    author: 'Rayclone Core',
    icon: '🔐',
    keywords: ['hash', 'crypto', 'sha256', 'md5', 'sha1', 'sha512', 'checksum'],
    code: `
      const crypto = Rayclone.crypto;
      const text = String(Rayclone.input || '').trim() || 'Rayclone v2.5.1 Built-in Tool';
      const md5 = crypto.createHash('md5').update(text).digest('hex');
      const sha1 = crypto.createHash('sha1').update(text).digest('hex');
      const sha256 = crypto.createHash('sha256').update(text).digest('hex');
      
      Rayclone.showToast({ style: 'success', title: 'Hashes Computed', message: 'SHA-256: ' + sha256.slice(0, 16) + '...' });
      return { text, md5, sha1, sha256 };
    `
  },
  {
    id: 'ext:slugify-text',
    name: 'URL Slugifier',
    description: 'Transforms string into clean SEO-friendly kebab-case URL slug',
    author: 'Rayclone Core',
    icon: '🔗',
    keywords: ['slug', 'slugify', 'url', 'kebab', 'string', 'permalink'],
    code: `
      const text = String(Rayclone.input || '').trim() || 'Rayclone 2.5.1 Power Launcher';
      const slug = text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '');
      Rayclone.clipboard.writeText(slug);
      Rayclone.showToast({ style: 'success', title: 'Slug Copied', message: slug });
      return { original: text, slug };
    `
  },
  {
    id: 'ext:lorem-ipsum',
    name: 'Lorem Ipsum Generator',
    description: 'Generates customizable dummy placeholder paragraphs and sentences',
    author: 'Rayclone Core',
    icon: '📝',
    keywords: ['lorem', 'ipsum', 'dummy', 'text', 'placeholder', 'generate'],
    code: `
      const count = parseInt(Rayclone.input, 10) || 3;
      const sentences = [
        'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
        'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
        'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.',
        'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore.',
        'Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia.'
      ];
      const result = [];
      for (let i = 0; i < count; i++) {
        result.push(sentences[i % sentences.length]);
      }
      const text = result.join(' ');
      Rayclone.clipboard.writeText(text);
      Rayclone.showToast({ style: 'success', title: 'Lorem Ipsum Generated', message: count + ' sentences copied' });
      return { count, text };
    `
  }
];

// In-Worker Execution Harness
if (!isMainThread) {
  (async () => {
    try {
      const { code, input, environment } = workerData;
      const toasts = [];
      let copiedText = null;

      const Rayclone = {
        input,
        environment,
        crypto: require('node:crypto'),
        showToast: (t) => toasts.push(t),
        clipboard: {
          writeText: (txt) => { copiedText = String(txt); },
          readText: () => input || ''
        }
      };

      const blockedGlobal = (name) => new Proxy({}, {
        get(_target, prop) {
          throw new Error(`Access to ${name}.${String(prop)} is forbidden in tools`);
        },
        apply() {
          throw new Error(`Direct call to ${name}() is forbidden in tools`);
        }
      });

      // Shadow sensitive globals: process, require, fetch
      const fn = new Function('Rayclone', 'process', 'require', 'fetch', code);
      const output = await fn(Rayclone, blockedGlobal('process'), blockedGlobal('require'), blockedGlobal('fetch'));

      parentPort.postMessage({
        ok: true,
        output,
        toasts,
        copiedText
      });
    } catch (err) {
      parentPort.postMessage({
        ok: false,
        error: err ? err.message : 'Unknown execution error'
      });
    }
  })();
}

function runExtensionInSandbox(extensionId, customInput = '', timeoutMs = 4000) {
  return new Promise((resolve) => {
    const ext = BUILTIN_EXTENSIONS.find((e) => e.id === extensionId);
    if (!ext) return resolve({ ok: false, error: 'Extension not found' });

    const startTime = Date.now();
    let isSettled = false;

    const worker = new Worker(__filename, {
      workerData: {
        code: ext.code,
        input: customInput,
        environment: {
          version: '2.5.0',
          platform: 'win32',
          arch: os.arch()
        }
      }
    });

    const timer = setTimeout(() => {
      if (!isSettled) {
        isSettled = true;
        worker.terminate();
        resolve({ ok: false, error: 'Extension timed out (Execution limit exceeded)' });
      }
    }, timeoutMs);

    worker.on('message', (msg) => {
      if (!isSettled) {
        isSettled = true;
        clearTimeout(timer);
        const durationMs = Date.now() - startTime;
        resolve({
          ...msg,
          extensionId,
          durationMs
        });
      }
    });

    worker.on('error', (err) => {
      if (!isSettled) {
        isSettled = true;
        clearTimeout(timer);
        resolve({ ok: false, error: err.message });
      }
    });
  });
}

function formatExtensionItem(ext) {
  return {
    id: ext.id,
    title: ext.name,
    subtitle: `${ext.description} • By ${ext.author}`,
    icon: ext.icon,
    group: 'Built-in Tools',
    keywords: ['tool', 'utility', 'builtin', 'extension', ext.name.toLowerCase()],
    scoreBoost: 220,
    extensionData: ext,
    actions: [
      {
        id: 'run',
        title: `Run ${ext.name}`,
        shortcut: '↵',
        run: () => runExtensionInSandbox(ext.id)
      }
    ]
  };
}

async function searchExtensions(query) {
  const q = String(query || '').replace(/^(ext:?|plugin:?)/i, '').trim().toLowerCase();
  if (!q) return BUILTIN_EXTENSIONS.map(formatExtensionItem);
  return BUILTIN_EXTENSIONS
    .filter((e) =>
      e.id.toLowerCase().includes(q) ||
      e.name.toLowerCase().includes(q) ||
      e.description.toLowerCase().includes(q) ||
      (e.keywords && e.keywords.some((k) => k.toLowerCase().includes(q)))
    )
    .map(formatExtensionItem);
}

module.exports = {
  BUILTIN_EXTENSIONS,
  runExtensionInSandbox,
  formatExtensionItem,
  searchExtensions
};
