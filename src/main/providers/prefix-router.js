'use strict';

async function routePrefix(q, byId, itemsById) {
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
  return null;
}

module.exports = { routePrefix };
