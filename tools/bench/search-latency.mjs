/**
 * Rayclone v2.5.1 Benchmark: Search Latency
 * Measures p50 and p95 latency over 200 queries after warmup,
 * testing per-prefix routers (=, $, :, {, <, !, ), >) and unified search.
 */

import { performance } from 'node:perf_hooks';
import { createRegistry } from '../../src/main/providers.js';

function percentile(arr, p) {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

async function runBenchmark() {
  console.log('=== Rayclone Search Latency Benchmark (v2.5.1) ===');
  const registry = createRegistry({ userDataPath: '.' });

  const benchmarkCases = [
    { name: 'Unified Search ("note")', query: 'note' },
    { name: 'Prefix "=" Calculator ("= 128 * 64")', query: '= 128 * 64' },
    { name: 'Prefix "$" Settings ("$ dark mode")', query: '$ dark mode' },
    { name: 'Prefix ":" Registry (": HKCU")', query: ': HKCU' },
    { name: 'Prefix "{" VS Code ("{ rayclone")', query: '{ rayclone' },
    { name: 'Prefix "<" Window Walker ("< code")', query: '< code' },
    { name: 'Prefix "!" Services ("! spooler")', query: '! spooler' },
    { name: 'Prefix ">" Run Command ("> cmd")', query: '> cmd' }
  ];

  const results = {};

  for (const tc of benchmarkCases) {
    // 1. Warmup: 10 queries
    for (let i = 0; i < 10; i++) {
      await registry.search(tc.query);
    }

    // 2. Measure: 200 queries
    const latencies = [];
    for (let i = 0; i < 200; i++) {
      const t0 = performance.now();
      await registry.search(tc.query);
      const dt = performance.now() - t0;
      latencies.push(dt);
    }

    const p50 = Number(percentile(latencies, 50).toFixed(3));
    const p95 = Number(percentile(latencies, 95).toFixed(3));
    const min = Number(Math.min(...latencies).toFixed(3));
    const max = Number(Math.max(...latencies).toFixed(3));
    const avg = Number((latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(3));

    results[tc.name] = { min, avg, p50, p95, max };
    console.log(`${tc.name.padEnd(40)} | p50: ${p50.toFixed(2)} ms | p95: ${p95.toFixed(2)} ms | avg: ${avg.toFixed(2)} ms`);
  }

  console.log('\n--- Overall Summary (Machine Readable) ---');
  console.log(JSON.stringify(results, null, 2));
  return results;
}

runBenchmark().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
