/**
 * Rayclone v2.5.1 Benchmark: Memory Usage
 * Measures baseline and idle memory working set for the Node/Electron process.
 */

import { performance } from 'node:perf_hooks';
import { createRegistry } from '../../src/main/providers.js';

function formatMB(bytes) {
  return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

async function runBenchmark() {
  console.log('=== Rayclone Working Set & Idle Memory Benchmark ===');

  const baseline = process.memoryUsage();
  console.log('Initial Process Memory:');
  console.log(`  RSS:        ${formatMB(baseline.rss)}`);
  console.log(`  Heap Total: ${formatMB(baseline.heapTotal)}`);
  console.log(`  Heap Used:  ${formatMB(baseline.heapUsed)}`);

  console.log('\nInitializing provider registry and executing test queries...');
  const registry = createRegistry({ userDataPath: '.' });
  await registry.search('notepad');
  await registry.search('= 50 * 20');
  await registry.search('$ dark mode');

  if (global.gc) {
    global.gc();
  }

  const loaded = process.memoryUsage();
  console.log('\nLoaded Provider Registry Memory:');
  console.log(`  RSS:        ${formatMB(loaded.rss)}`);
  console.log(`  Heap Total: ${formatMB(loaded.heapTotal)}`);
  console.log(`  Heap Used:  ${formatMB(loaded.heapUsed)}`);

  const summary = {
    baselineRssMB: Number((baseline.rss / 1024 / 1024).toFixed(2)),
    baselineHeapUsedMB: Number((baseline.heapUsed / 1024 / 1024).toFixed(2)),
    loadedRssMB: Number((loaded.rss / 1024 / 1024).toFixed(2)),
    loadedHeapUsedMB: Number((loaded.heapUsed / 1024 / 1024).toFixed(2))
  };

  console.log('\nResult summary:', JSON.stringify(summary));
  return summary;
}

runBenchmark().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
