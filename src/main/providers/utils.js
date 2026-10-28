'use strict';

const os = require('node:os');
const store = require('../store');

const HOME = os.homedir();

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


module.exports = {
  fuzzy,
  scoreItem,
  evaluateExpression,
  saveCalcHistory,
  HOME
};
