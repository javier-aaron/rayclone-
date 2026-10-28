/**
 * Rayclone v2.5.1 Benchmark: Settings Indexing
 * Measures execution time for 50 queries across the Windows Settings catalog.
 */

import { performance } from 'node:perf_hooks';
import { searchSettings, WINDOWS_SETTINGS_CATALOG } from '../../src/main/windows-settings.js';

async function runBenchmark() {
  console.log('=== Rayclone Windows Settings Index Benchmark ===');
  console.log(`Catalog size: ${WINDOWS_SETTINGS_CATALOG.length} settings`);

  const sampleQueries = [
    'display', 'sound', 'dark mode', 'bluetooth', 'wifi', 'battery',
    'mouse', 'keyboard', 'update', 'firewall', 'storage', 'vpn',
    'proxy', 'region', 'game', 'touchpad', 'power', 'theme'
  ];

  // 1. Warmup
  for (let i = 0; i < 10; i++) {
    searchSettings(sampleQueries[i % sampleQueries.length]);
  }

  // 2. Run 50 queries
  const t0 = performance.now();
  for (let i = 0; i < 50; i++) {
    const q = sampleQueries[i % sampleQueries.length];
    searchSettings(q);
  }
  const totalMs = performance.now() - t0;
  const avgMsPerQuery = totalMs / 50;

  console.log(`Executed 50 queries in ${totalMs.toFixed(2)} ms`);
  console.log(`Average latency per query: ${avgMsPerQuery.toFixed(3)} ms`);

  const res = {
    queries: 50,
    catalogEntries: WINDOWS_SETTINGS_CATALOG.length,
    totalMs: Number(totalMs.toFixed(2)),
    avgMs: Number(avgMsPerQuery.toFixed(3))
  };

  console.log('\nResult summary:', JSON.stringify(res));
  return res;
}

runBenchmark().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
