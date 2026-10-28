'use strict';

import { performance } from 'node:perf_hooks';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const { createRegistry } = require('../src/main/providers');

async function runBenchmark() {
  console.log('=== Running Rayclone Performance & Latency Benchmark ===\n');

  // 1. Cold-Start Latency
  const t0 = performance.now();
  const registry = createRegistry();
  await registry.warm();
  const coldStartMs = performance.now() - t0;
  console.log(`[Cold-Start Time]: ${coldStartMs.toFixed(2)} ms (Registry warm-up + 43 providers)`);

  // 2. Memory Footprint
  const mem = process.memoryUsage();
  const rssMb = (mem.rss / (1024 * 1024)).toFixed(2);
  const heapUsedMb = (mem.heapUsed / (1024 * 1024)).toFixed(2);
  console.log(`[Memory Footprint]: RSS: ${rssMb} MB | Heap Used: ${heapUsedMb} MB`);

  // 3. Search Query Latency (p50, p95, p99 across 50 iterations of mixed realistic queries)
  const TEST_QUERIES = [
    'code', 'git', 'port 3000', 'docker', 'calc 100 USD to EUR',
    'weather Tokyo', 'services: update', 'notes meeting', 'define serendipity',
    'kill-port', 'chrome', 'screenshot', 'color', 'remind in 20m'
  ];

  const latencies = [];
  console.log(`\nBenchmarking ${TEST_QUERIES.length * 5} query executions across providers...`);

  for (let round = 0; round < 5; round++) {
    for (const q of TEST_QUERIES) {
      const qStart = performance.now();
      const results = await registry.search(q);
      const elapsed = performance.now() - qStart;
      latencies.push(elapsed);
    }
  }

  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.50)].toFixed(2);
  const p95 = latencies[Math.floor(latencies.length * 0.95)].toFixed(2);
  const p99 = latencies[Math.floor(latencies.length * 0.99)].toFixed(2);
  const avg = (latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(2);

  console.log(`[Query Latency p50]: ${p50} ms`);
  console.log(`[Query Latency p95]: ${p95} ms`);
  console.log(`[Query Latency p99]: ${p99} ms`);
  console.log(`[Query Latency Avg]: ${avg} ms`);

  console.log('\n======================================================');
  console.log('✅ BENCHMARK SUMMARY:');
  console.log(`   Cold-Start: ${coldStartMs.toFixed(2)} ms (Target: < 250 ms)`);
  console.log(`   p50 Latency: ${p50} ms (Target: < 15 ms)`);
  console.log(`   p99 Latency: ${p99} ms (Target: < 35 ms)`);
  console.log(`   Node/V8 RSS: ${rssMb} MB (PowerToys Run ~200MB, Raycast ~180MB)`);
  console.log('======================================================\n');
}

runBenchmark().catch(console.error);
