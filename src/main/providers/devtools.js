'use strict';

const { clipboard } = require('electron');
const devtools = require('../devtools');
const { fuzzy, scoreItem } = require('./utils');

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


module.exports = {
  devToolsProvider
};
