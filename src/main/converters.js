'use strict';

// Natural unit & currency converter modeled after Raycast's Soulver-powered engine.

const CURRENCY_RATES = {
  USD: 1.0,
  EUR: 0.92,
  GBP: 0.79,
  JPY: 154.5,
  CAD: 1.38,
  AUD: 1.52,
  CHF: 0.90,
  CNY: 7.24,
  INR: 83.5,
  BRL: 5.65,
  MXN: 19.8,
  KRW: 1375.0,
  SGD: 1.34,
  NZD: 1.66,
  HKD: 7.82,
  SEK: 10.6,
  NOK: 10.9,
  BTC: 0.000015,
  ETH: 0.00038,
  SOL: 0.0068
};

const CURRENCY_ALIASES = {
  $: 'USD', usd: 'USD', dollar: 'USD', dollars: 'USD', usdollar: 'USD',
  '€': 'EUR', eur: 'EUR', euro: 'EUR', euros: 'EUR',
  '£': 'GBP', gbp: 'GBP', pound: 'GBP', pounds: 'GBP', sterling: 'GBP',
  '¥': 'JPY', jpy: 'JPY', yen: 'JPY',
  cad: 'CAD', aud: 'AUD', chf: 'CHF',
  cny: 'CNY', rmb: 'CNY', yuan: 'CNY',
  inr: 'INR', rupee: 'INR', rupees: 'INR',
  brl: 'BRL', real: 'BRL',
  mxn: 'MXN', peso: 'MXN', pesos: 'MXN',
  krw: 'KRW', won: 'KRW',
  sgd: 'SGD', nzd: 'NZD', hkd: 'HKD',
  sek: 'SEK', nok: 'NOK',
  btc: 'BTC', bitcoin: 'BTC',
  eth: 'ETH', ether: 'ETH', ethereum: 'ETH',
  sol: 'SOL', solana: 'SOL'
};

const UNITS = {
  // length (base: meter)
  m: { dim: 'len', toBase: 1, name: 'meters' },
  meter: { dim: 'len', toBase: 1, name: 'meters' },
  meters: { dim: 'len', toBase: 1, name: 'meters' },
  metre: { dim: 'len', toBase: 1, name: 'meters' },
  metres: { dim: 'len', toBase: 1, name: 'meters' },
  km: { dim: 'len', toBase: 1000, name: 'km' },
  kilometer: { dim: 'len', toBase: 1000, name: 'km' },
  kilometers: { dim: 'len', toBase: 1000, name: 'km' },
  cm: { dim: 'len', toBase: 0.01, name: 'cm' },
  centimeter: { dim: 'len', toBase: 0.01, name: 'cm' },
  centimeters: { dim: 'len', toBase: 0.01, name: 'cm' },
  mm: { dim: 'len', toBase: 0.001, name: 'mm' },
  millimeter: { dim: 'len', toBase: 0.001, name: 'mm' },
  millimeters: { dim: 'len', toBase: 0.001, name: 'mm' },
  mi: { dim: 'len', toBase: 1609.344, name: 'miles' },
  mile: { dim: 'len', toBase: 1609.344, name: 'miles' },
  miles: { dim: 'len', toBase: 1609.344, name: 'miles' },
  yd: { dim: 'len', toBase: 0.9144, name: 'yards' },
  yard: { dim: 'len', toBase: 0.9144, name: 'yards' },
  yards: { dim: 'len', toBase: 0.9144, name: 'yards' },
  ft: { dim: 'len', toBase: 0.3048, name: 'feet' },
  foot: { dim: 'len', toBase: 0.3048, name: 'feet' },
  feet: { dim: 'len', toBase: 0.3048, name: 'feet' },
  in: { dim: 'len', toBase: 0.0254, name: 'inches' },
  inch: { dim: 'len', toBase: 0.0254, name: 'inches' },
  inches: { dim: 'len', toBase: 0.0254, name: 'inches' },
  nm: { dim: 'len', toBase: 1852, name: 'nautical miles' },

  // mass (base: gram)
  g: { dim: 'mass', toBase: 1, name: 'g' },
  gram: { dim: 'mass', toBase: 1, name: 'grams' },
  grams: { dim: 'mass', toBase: 1, name: 'grams' },
  kg: { dim: 'mass', toBase: 1000, name: 'kg' },
  kilogram: { dim: 'mass', toBase: 1000, name: 'kg' },
  kilograms: { dim: 'mass', toBase: 1000, name: 'kg' },
  kilo: { dim: 'mass', toBase: 1000, name: 'kg' },
  kilos: { dim: 'mass', toBase: 1000, name: 'kg' },
  mg: { dim: 'mass', toBase: 0.001, name: 'mg' },
  milligram: { dim: 'mass', toBase: 0.001, name: 'mg' },
  milligrams: { dim: 'mass', toBase: 0.001, name: 'mg' },
  lb: { dim: 'mass', toBase: 453.59237, name: 'lbs' },
  lbs: { dim: 'mass', toBase: 453.59237, name: 'lbs' },
  pound: { dim: 'mass', toBase: 453.59237, name: 'lbs' },
  pounds: { dim: 'mass', toBase: 453.59237, name: 'lbs' },
  oz: { dim: 'mass', toBase: 28.349523, name: 'oz' },
  ounce: { dim: 'mass', toBase: 28.349523, name: 'oz' },
  ounces: { dim: 'mass', toBase: 28.349523, name: 'oz' },
  stone: { dim: 'mass', toBase: 6350.29318, name: 'stone' },
  ton: { dim: 'mass', toBase: 907184.74, name: 'tons' },
  tonne: { dim: 'mass', toBase: 1000000, name: 'tonnes' },

  // digital storage (base: byte)
  b: { dim: 'data', toBase: 1, name: 'B' },
  byte: { dim: 'data', toBase: 1, name: 'bytes' },
  bytes: { dim: 'data', toBase: 1, name: 'bytes' },
  kb: { dim: 'data', toBase: 1024, name: 'KB' },
  kilobyte: { dim: 'data', toBase: 1024, name: 'KB' },
  kilobytes: { dim: 'data', toBase: 1024, name: 'KB' },
  mb: { dim: 'data', toBase: 1024 ** 2, name: 'MB' },
  megabyte: { dim: 'data', toBase: 1024 ** 2, name: 'MB' },
  megabytes: { dim: 'data', toBase: 1024 ** 2, name: 'MB' },
  gb: { dim: 'data', toBase: 1024 ** 3, name: 'GB' },
  gigabyte: { dim: 'data', toBase: 1024 ** 3, name: 'GB' },
  gigabytes: { dim: 'data', toBase: 1024 ** 3, name: 'GB' },
  tb: { dim: 'data', toBase: 1024 ** 4, name: 'TB' },
  terabyte: { dim: 'data', toBase: 1024 ** 4, name: 'TB' },
  terabytes: { dim: 'data', toBase: 1024 ** 4, name: 'TB' },

  // time (base: second)
  s: { dim: 'time', toBase: 1, name: 'seconds' },
  sec: { dim: 'time', toBase: 1, name: 'seconds' },
  second: { dim: 'time', toBase: 1, name: 'seconds' },
  seconds: { dim: 'time', toBase: 1, name: 'seconds' },
  min: { dim: 'time', toBase: 60, name: 'minutes' },
  mins: { dim: 'time', toBase: 60, name: 'minutes' },
  minute: { dim: 'time', toBase: 60, name: 'minutes' },
  minutes: { dim: 'time', toBase: 60, name: 'minutes' },
  h: { dim: 'time', toBase: 3600, name: 'hours' },
  hr: { dim: 'time', toBase: 3600, name: 'hours' },
  hrs: { dim: 'time', toBase: 3600, name: 'hours' },
  hour: { dim: 'time', toBase: 3600, name: 'hours' },
  hours: { dim: 'time', toBase: 3600, name: 'hours' },
  d: { dim: 'time', toBase: 86400, name: 'days' },
  day: { dim: 'time', toBase: 86400, name: 'days' },
  days: { dim: 'time', toBase: 86400, name: 'days' },
  w: { dim: 'time', toBase: 604800, name: 'weeks' },
  wk: { dim: 'time', toBase: 604800, name: 'weeks' },
  week: { dim: 'time', toBase: 604800, name: 'weeks' },
  weeks: { dim: 'time', toBase: 604800, name: 'weeks' },
  month: { dim: 'time', toBase: 86400 * 30.4375, name: 'months' },
  months: { dim: 'time', toBase: 86400 * 30.4375, name: 'months' },
  y: { dim: 'time', toBase: 86400 * 365.25, name: 'years' },
  yr: { dim: 'time', toBase: 86400 * 365.25, name: 'years' },
  year: { dim: 'time', toBase: 86400 * 365.25, name: 'years' },
  years: { dim: 'time', toBase: 86400 * 365.25, name: 'years' },

  // speed (base: m/s)
  'm/s': { dim: 'speed', toBase: 1, name: 'm/s' },
  'km/h': { dim: 'speed', toBase: 1 / 3.6, name: 'km/h' },
  kph: { dim: 'speed', toBase: 1 / 3.6, name: 'km/h' },
  kmh: { dim: 'speed', toBase: 1 / 3.6, name: 'km/h' },
  mph: { dim: 'speed', toBase: 0.44704, name: 'mph' },
  knot: { dim: 'speed', toBase: 0.514444, name: 'knots' },
  knots: { dim: 'speed', toBase: 0.514444, name: 'knots' }
};

const TEMPS = {
  c: 'c', celsius: 'c', '°c': 'c',
  f: 'f', fahrenheit: 'f', '°f': 'f',
  k: 'k', kelvin: 'k'
};

function formatVal(v) {
  if (Math.abs(v) >= 1e9 || (Math.abs(v) < 1e-4 && v !== 0)) {
    return v.toExponential(4);
  }
  const rounded = Number(v.toFixed(4));
  return rounded.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

function convert(query) {
  const raw = String(query || '').trim().toLowerCase();
  if (!raw || raw.length > 80) return null;

  // Patterns:
  // "100 usd to eur", "$100 in eur", "50 eur to gbp"
  // "5 km to miles", "100 f to c", "16 gb in mb"
  let amount = null;
  let fromStr = null;
  let toStr = null;

  // Check currency symbol prefix like "$100 in eur" or "£50 to usd"
  const symMatch = raw.match(/^([$€£¥])\s*(\d+(?:\.\d+)?)\s+(?:to|in|into|as)\s+([a-zA-Z$€£¥]+)$/);
  if (symMatch) {
    amount = parseFloat(symMatch[2]);
    fromStr = symMatch[1];
    toStr = symMatch[3];
  } else {
    const stdMatch = raw.match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z°/]+(?:\s+[a-zA-Z]+)?)\s+(?:to|in|into|as)\s+([a-zA-Z°/]+(?:\s+[a-zA-Z]+)?)$/);
    if (stdMatch) {
      amount = parseFloat(stdMatch[1]);
      fromStr = stdMatch[2].trim();
      toStr = stdMatch[3].trim();
    }
  }

  if (amount === null || !Number.isFinite(amount)) return null;

  // 1. Currency conversion
  const fromCurr = CURRENCY_ALIASES[fromStr];
  const toCurr = CURRENCY_ALIASES[toStr];
  if (fromCurr && toCurr && CURRENCY_RATES[fromCurr] && CURRENCY_RATES[toCurr]) {
    const usdVal = amount / CURRENCY_RATES[fromCurr];
    const targetVal = usdVal * CURRENCY_RATES[toCurr];
    const formatted = targetVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    return {
      type: 'currency',
      value: targetVal,
      text: `${formatted} ${toCurr}`,
      description: `${amount} ${fromCurr} = ${formatted} ${toCurr}`
    };
  }

  // 2. Temperature conversion
  const fromTemp = TEMPS[fromStr];
  const toTemp = TEMPS[toStr];
  if (fromTemp && toTemp) {
    if (fromTemp === toTemp) {
      return { type: 'temp', value: amount, text: `${amount} °${toTemp.toUpperCase()}`, description: `${amount} °${fromTemp.toUpperCase()}` };
    }
    // convert fromTemp to Celsius
    let c = amount;
    if (fromTemp === 'f') c = (amount - 32) * (5 / 9);
    else if (fromTemp === 'k') c = amount - 273.15;

    // convert Celsius to toTemp
    let res = c;
    if (toTemp === 'f') res = (c * (9 / 5)) + 32;
    else if (toTemp === 'k') res = c + 273.15;

    const formatted = formatVal(res);
    const unitLabel = toTemp === 'k' ? 'K' : `°${toTemp.toUpperCase()}`;
    const fromLabel = fromTemp === 'k' ? 'K' : `°${fromTemp.toUpperCase()}`;
    return {
      type: 'temp',
      value: res,
      text: `${formatted} ${unitLabel}`,
      description: `${amount} ${fromLabel} = ${formatted} ${unitLabel}`
    };
  }

  // 3. Physical & Digital Units
  const u1 = UNITS[fromStr];
  const u2 = UNITS[toStr];
  if (u1 && u2 && u1.dim === u2.dim) {
    const baseVal = amount * u1.toBase;
    const targetVal = baseVal / u2.toBase;
    const formatted = formatVal(targetVal);
    return {
      type: 'unit',
      value: targetVal,
      text: `${formatted} ${u2.name}`,
      description: `${amount} ${u1.name} = ${formatted} ${u2.name}`
    };
  }

  return null;
}

module.exports = { convert };
