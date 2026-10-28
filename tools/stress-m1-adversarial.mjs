// tools/stress-m1-adversarial.mjs
// Empirical Adversarial Stress Harness for Milestone 1 (R1): Port Inspector & Git Indexer

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const portInspector = require('../src/main/port-inspector.js');
const gitIndexer = require('../src/main/git-indexer.js');

console.log('======================================================================');
console.log('🚀 EMPIRICAL ADVERSARIAL STRESS HARNESS — MILESTONE 1 (R1)');
console.log('======================================================================\n');

let passCount = 0;
let failCount = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ PASS: ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${err.message}`);
    failCount++;
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    console.log(`  ✓ PASS: ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${err.message}`);
    failCount++;
  }
}

// ============================================================================
// SUITE 1: PORT INSPECTOR ABNORMAL PORT BOUNDARIES
// ============================================================================
console.log('\n--- SUITE 1: Port Inspector — Abnormal Port Boundaries ---');

test('Port 0 must be rejected/filtered out in parseNetstat', () => {
  const mockNetstat = `
Active Connections
  Proto  Local Address          Foreign Address        State           PID
  TCP    0.0.0.0:0              0.0.0.0:0              LISTENING       1234
  TCP    [::]:0                 [::]:0                 LISTENING       1234
`;
  const results = portInspector.parseNetstat(mockNetstat);
  assert.strictEqual(results.length, 0, 'Port 0 should be filtered out from results');
});

test('Port 65536 (> 65535) must be rejected/filtered out in parseNetstat', () => {
  const mockNetstat = `
  TCP    0.0.0.0:65536          0.0.0.0:0              LISTENING       1234
  TCP    127.0.0.1:99999        0.0.0.0:0              LISTENING       1234
`;
  const results = portInspector.parseNetstat(mockNetstat);
  assert.strictEqual(results.length, 0, 'Ports > 65535 should be filtered out');
});

test('Boundary ports 1 and 65535 must be accepted', () => {
  const mockNetstat = `
  TCP    0.0.0.0:1              0.0.0.0:0              LISTENING       1111
  TCP    0.0.0.0:65535          0.0.0.0:0              LISTENING       2222
`;
  const results = portInspector.parseNetstat(mockNetstat);
  assert.strictEqual(results.length, 2, 'Ports 1 and 65535 must be valid');
  assert.strictEqual(results[0].port, 1);
  assert.strictEqual(results[1].port, 65535);
});

test('Negative ports and non-numeric strings must be rejected in parseNetstat', () => {
  const mockNetstat = `
  TCP    0.0.0.0:-1             0.0.0.0:0              LISTENING       1234
  TCP    0.0.0.0:-8080          0.0.0.0:0              LISTENING       1234
  TCP    0.0.0.0:http           0.0.0.0:0              LISTENING       1234
  TCP    0.0.0.0:abc            0.0.0.0:0              LISTENING       1234
  TCP    0.0.0.0:               0.0.0.0:0              LISTENING       1234
`;
  const results = portInspector.parseNetstat(mockNetstat);
  assert.strictEqual(results.length, 0, 'Negative and non-numeric ports must be filtered out');
});

await testAsync('killPort with abnormal ports (0, 65536, negative, NaN) must fail cleanly', async () => {
  const mockList = [
    { port: 8080, pid: 1234, processName: 'node.exe' },
    { port: 3000, pid: 5678, processName: 'react.exe' }
  ];

  const r0 = await portInspector.killPort(0, mockList);
  assert.strictEqual(r0.ok, false);
  assert.strictEqual(r0.error, 'Port not found');

  const r65536 = await portInspector.killPort(65536, mockList);
  assert.strictEqual(r65536.ok, false);
  assert.strictEqual(r65536.error, 'Port not found');

  const rNeg = await portInspector.killPort(-80, mockList);
  assert.strictEqual(rNeg.ok, false);
  assert.strictEqual(rNeg.error, 'Port not found');

  const rStr = await portInspector.killPort('not-a-port', mockList);
  assert.strictEqual(rStr.ok, false);
  assert.strictEqual(rStr.error, 'Port not found');

  const rNull = await portInspector.killPort(null, mockList);
  assert.strictEqual(rNull.ok, false);
  assert.strictEqual(rNull.error, 'Port not found');
});

// ============================================================================
// SUITE 2: PORT INSPECTOR MALFORMED NETSTAT LINES & IPV6
// ============================================================================
console.log('\n--- SUITE 2: Port Inspector — Malformed Netstat & IPv6 Parsing ---');

test('IPv6 with zone / scope ID (e.g. %eth0, %12) must parse port correctly', () => {
  const mockNetstat = `
  TCP    [fe80::1ff:fe23:4567:890a%12]:8080      [::]:0                 LISTENING       4321
  TCP    [fe80::2%eth0]:9090                     [::]:0                 LISTENING       5432
`;
  const results = portInspector.parseNetstat(mockNetstat);
  assert.strictEqual(results.length, 2, 'IPv6 with zone IDs should be parsed');
  assert.strictEqual(results[0].port, 8080);
  assert.strictEqual(results[0].pid, 4321);
  assert.strictEqual(results[1].port, 9090);
  assert.strictEqual(results[1].pid, 5432);
});

test('IPv6 unspecified and loopback formats ([::]:port, [::1]:port)', () => {
  const mockNetstat = `
  TCP    [::]:4000              [::]:0                 LISTENING       6001
  TCP    [::1]:5000             [::]:0                 LISTENING       6002
`;
  const results = portInspector.parseNetstat(mockNetstat);
  assert.strictEqual(results.length, 2);
  assert.strictEqual(results[0].port, 4000);
  assert.strictEqual(results[1].port, 5000);
});

test('Malformed netstat lines without PID or missing columns must be skipped without crashing', () => {
  const mockNetstat = `
  TCP    0.0.0.0:8080           0.0.0.0:0              LISTENING
  TCP    0.0.0.0:8081           0.0.0.0:0              LISTENING       abc
  TCP    0.0.0.0:8082           0.0.0.0:0              LISTENING       NaN
  TCP    0.0.0.0:8083           LISTENING
  TCP    0.0.0.0:8084
  TCP
  
       
  SOME GARBAGE RANDOM LINE IN STDOUT
  TCP    0.0.0.0:8085           0.0.0.0:0              ESTABLISHED     9999
  UDP    0.0.0.0:8086           *:*                                    9998
  TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       1234
`;
  const results = portInspector.parseNetstat(mockNetstat);
  assert.strictEqual(results.length, 1, 'Only valid TCP LISTENING with numeric PID should parse');
  assert.strictEqual(results[0].port, 3000);
  assert.strictEqual(results[0].pid, 1234);
});

test('Null, undefined, empty, or huge input to parseNetstat must not crash', () => {
  assert.deepStrictEqual(portInspector.parseNetstat(null), []);
  assert.deepStrictEqual(portInspector.parseNetstat(undefined), []);
  assert.deepStrictEqual(portInspector.parseNetstat(''), []);
  assert.deepStrictEqual(portInspector.parseNetstat('     \n\n\r\n   '), []);

  // 10,000 lines of gibberish
  const hugeGarbage = 'GARBAGE NOT NETSTAT\r\n'.repeat(10000);
  const results = portInspector.parseNetstat(hugeGarbage);
  assert.strictEqual(results.length, 0);
});

// ============================================================================
// SUITE 3: PORT INSPECTOR SAFETY GUARDS (PID 0 AND PID 4)
// ============================================================================
console.log('\n--- SUITE 3: Port Inspector — Safety Guard (PID 0 & PID 4) ---');

await testAsync('Attempt to kill PID 4 (System) must be rejected', async () => {
  const mockPorts = [
    { port: 445, pid: 4, processName: 'System' }
  ];
  let killCalled = false;
  const mockKillFn = (pid) => {
    killCalled = true;
    return { ok: true, pid };
  };

  const result = await portInspector.killPort(445, mockPorts, mockKillFn);
  assert.strictEqual(result.ok, false, 'Should reject killing PID 4');
  assert.strictEqual(result.error, 'Cannot terminate protected system process');
  assert.strictEqual(killCalled, false, 'killFn must NOT have been called for PID 4');
});

await testAsync('Attempt to kill PID 0 (System Idle) must be rejected', async () => {
  const mockPorts = [
    { port: 80, pid: 0, processName: 'System Idle Process' }
  ];
  let killCalled = false;
  const mockKillFn = (pid) => {
    killCalled = true;
    return { ok: true, pid };
  };

  const result = await portInspector.killPort(80, mockPorts, mockKillFn);
  assert.strictEqual(result.ok, false, 'Should reject killing PID 0');
  assert.strictEqual(result.error, 'Cannot terminate protected system process');
  assert.strictEqual(killCalled, false, 'killFn must NOT have been called for PID 0');
});

await testAsync('Kill normal PID (e.g. 5678) must succeed via killFn', async () => {
  const mockPorts = [
    { port: 3000, pid: 5678, processName: 'node.exe' }
  ];
  let killCalledWith = null;
  const mockKillFn = (pid) => {
    killCalledWith = pid;
    return { ok: true, pid };
  };

  const result = await portInspector.killPort(3000, mockPorts, mockKillFn);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(killCalledWith, 5678, 'killFn should be called with PID 5678');
});

// ============================================================================
// SUITE 4: GIT INDEXER DETACHED HEAD & CORRUPT STATUS
// ============================================================================
console.log('\n--- SUITE 4: Git Indexer — Detached HEAD & Corrupt Status ---');

test('parseGitHead handles valid branch refs and branch slashes', () => {
  const r1 = gitIndexer.parseGitHead('ref: refs/heads/main');
  assert.strictEqual(r1.branch, 'main');
  assert.strictEqual(r1.detached, false);

  const r2 = gitIndexer.parseGitHead('ref: refs/heads/feature/adversarial-tests/v2\n');
  assert.strictEqual(r2.branch, 'feature/adversarial-tests/v2');
  assert.strictEqual(r2.detached, false);
});

test('parseGitHead handles detached HEAD commits (40 hex chars)', () => {
  const sha = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4';
  const r = gitIndexer.parseGitHead(sha);
  assert.strictEqual(r.branch, 'e3b0c442', 'Branch should be first 8 chars of commit');
  assert.strictEqual(r.detached, true);
  assert.strictEqual(r.commit, sha);

  // Mixed case hex with whitespace
  const shaUpper = '  E3B0C44298FC1C149AFBF4C8996FB92427AE41E4\r\n';
  const rUpper = gitIndexer.parseGitHead(shaUpper);
  assert.strictEqual(rUpper.branch, 'E3B0C442');
  assert.strictEqual(rUpper.detached, true);
});

test('parseGitHead rejects invalid SHA lengths and non-hex characters', () => {
  // 39 hex chars (too short)
  const shortSha = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e';
  assert.strictEqual(gitIndexer.parseGitHead(shortSha).branch, 'unknown');

  // 41 hex chars (too long)
  const longSha = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e40';
  assert.strictEqual(gitIndexer.parseGitHead(longSha).branch, 'unknown');

  // 40 chars with non-hex char 'g'
  const invalidHex = 'g3b0c44298fc1c149afbf4c8996fb92427ae41e4';
  assert.strictEqual(gitIndexer.parseGitHead(invalidHex).branch, 'unknown');
});

test('parseGitHead handles missing, null, undefined, empty, or corrupt content', () => {
  assert.strictEqual(gitIndexer.parseGitHead(null).branch, 'unknown');
  assert.strictEqual(gitIndexer.parseGitHead(undefined).branch, 'unknown');
  assert.strictEqual(gitIndexer.parseGitHead('').branch, 'unknown');
  assert.strictEqual(gitIndexer.parseGitHead('   \n\r  ').branch, 'unknown');
  assert.strictEqual(gitIndexer.parseGitHead('corrupt garbage not a git head').branch, 'unknown');
});

test('parseGitStatus handles clean, dirty, corrupt, null, and large porcelain outputs', () => {
  // Clean
  const clean = gitIndexer.parseGitStatus('');
  assert.strictEqual(clean.dirty, false);
  assert.strictEqual(clean.dirtyCount, 0);
  assert.deepStrictEqual(clean.files, []);

  // Null / undefined
  assert.strictEqual(gitIndexer.parseGitStatus(null).dirty, false);
  assert.strictEqual(gitIndexer.parseGitStatus(undefined).dirty, false);

  // Standard porcelain
  const porcelain = ' M src/main/port-inspector.js\n?? tools/stress.mjs\nD  old-file.txt\n';
  const dirty = gitIndexer.parseGitStatus(porcelain);
  assert.strictEqual(dirty.dirty, true);
  assert.strictEqual(dirty.dirtyCount, 3);
  assert.deepStrictEqual(dirty.files, ['src/main/port-inspector.js', 'tools/stress.mjs', 'old-file.txt']);

  // Corrupt / malformed lines (short lines, whitespace, unknown tokens)
  const corrupt = '??\n!\n   \nX\n';
  const parsedCorrupt = gitIndexer.parseGitStatus(corrupt);
  assert.strictEqual(parsedCorrupt.dirty, true);
  assert.strictEqual(parsedCorrupt.dirtyCount, 3); // 3 non-empty lines

  // 100+ files capping files array at 10
  const manyLines = Array.from({ length: 150 }, (_, i) => ` M file_${i}.js`).join('\n');
  const parsedMany = gitIndexer.parseGitStatus(manyLines);
  assert.strictEqual(parsedMany.dirty, true);
  assert.strictEqual(parsedMany.dirtyCount, 150);
  assert.strictEqual(parsedMany.files.length, 10, 'Preview files list should cap at 10');
});

// ============================================================================
// SUITE 5: GIT INDEXER FILESYSTEM RESILIENCE & ERROR HANDLING
// ============================================================================
console.log('\n--- SUITE 5: Git Indexer — Filesystem Resilience & Error Handling ---');

test('readBranchName on non-existent directory safely returns main fallback', () => {
  const fakePath = 'C:\\NonExistentDirectory_ChallengerTest_12345';
  const branch = gitIndexer.readBranchName(fakePath);
  assert.strictEqual(branch, 'main', 'Non-existent directory should return main without throwing');
});

test('readBranchName on repo with detached HEAD returns short commit SHA', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rayclone-test-git-'));
  const gitDir = path.join(tmpDir, '.git');
  fs.mkdirSync(gitDir, { recursive: true });
  fs.writeFileSync(path.join(gitDir, 'HEAD'), '4b825dc642cb6eb9a060e54bf8d69288fbee4904\n', 'utf8');

  try {
    const branch = gitIndexer.readBranchName(tmpDir);
    assert.strictEqual(branch, '4b825dc6', 'Detached HEAD should resolve to short SHA');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

await testAsync('checkDirty on non-existent directory resolves safely without rejection', async () => {
  const fakePath = 'C:\\NonExistentDirectory_ChallengerTest_99999';
  const status = await gitIndexer.checkDirty(fakePath);
  assert.strictEqual(status.dirty, false);
  assert.strictEqual(status.dirtyCount, 0);
});

await testAsync('scanRepositories with non-existent or invalid roots completes cleanly', async () => {
  const fakeRoots = [
    'C:\\NonExistentDirectory_ChallengerTest_Alpha',
    'C:\\NonExistentDirectory_ChallengerTest_Beta'
  ];
  const repos = await gitIndexer.scanRepositories(fakeRoots);
  assert(Array.isArray(repos), 'Should return an array');
  assert.strictEqual(repos.length, 0, 'No repos should be found in non-existent roots');
});

test('getActions returns 3 valid action descriptors with run() methods', () => {
  const actions = gitIndexer.getActions('C:\\test\\repo');
  assert.strictEqual(actions.length, 3);
  assert.strictEqual(actions[0].id, 'open-vscode');
  assert.strictEqual(actions[1].id, 'open-terminal');
  assert.strictEqual(actions[2].id, 'open-explorer');

  // Verify run methods return expected descriptors without throwing
  const rCode = actions[0].run();
  assert.strictEqual(rCode.tool, 'code');
  assert.strictEqual(rCode.ok, true);

  const rTerm = actions[1].run();
  assert.strictEqual(rTerm.tool, 'wt');
  assert.strictEqual(rTerm.ok, true);

  const rExp = actions[2].run();
  assert.strictEqual(rExp.tool, 'explorer');
  assert.strictEqual(rExp.ok, true);
});

// ============================================================================
// SUMMARY & VERDICT
// ============================================================================
console.log('\n======================================================================');
console.log(`STRESS RESULTS: ${passCount} PASSED, ${failCount} FAILED`);
console.log('======================================================================');

if (failCount > 0) {
  process.exit(1);
} else {
  console.log('🎉 ALL EMPIRICAL ADVERSARIAL STRESS CHALLENGES PASSED!\n');
  process.exit(0);
}
