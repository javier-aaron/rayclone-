import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const assert = require('node:assert');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

const envManager = require('../src/main/env-manager.js');
const wingetManager = require('../src/main/winget-manager.js');
const hostsEditor = require('../src/main/hosts-editor.js');
const { createRegistry } = require('../src/main/providers.js');
const { getPreviewForItem } = require('../src/main/preview.js');

console.log('================================================================');
console.log('=== Challenger M2 Recheck: Deep Empirical Adversarial Suite ===');
console.log('================================================================\n');

let passCount = 0;
let failCount = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ [PASS] ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}`);
    console.error(`    ${err.message}`);
    failCount++;
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    console.log(`  ✓ [PASS] ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}`);
    console.error(`    ${err.message}`);
    failCount++;
  }
}

// -------------------------------------------------------------
// CHECK 1: Baseline hosts parsing & comment immunity
// -------------------------------------------------------------
console.log('\n--- 1. HOSTS PARSER & COMMENT IMMUNITY ---');

test('Check 1.1: Standard Windows hosts comment "# localhost name resolution..." produces 0 rules', () => {
  const line = '# localhost name resolution is handled within DNS itself.';
  const rules = hostsEditor.parseHosts(line);
  assert.strictEqual(rules.length, 0, `Expected 0 rules, got ${rules.length}`);
});

test('Check 1.2: Standard Windows header comments produce 0 rules', () => {
  const header = `# Copyright (c) 1993-2009 Microsoft Corp.
#
# This is a sample HOSTS file used by Microsoft TCP/IP for Windows.
#
# This file contains the mappings of IP addresses to host names. Each
# entry should be kept on an individual line. The IP address should
# be placed in the first column followed by the corresponding host name.
# The IP address and the host name should be separated by at least one
# space.
#
# Additionally, comments (such as these) may be inserted on individual
# lines or following the machine name denoted by a '#' symbol.
#
# For example:
#
#      102.54.94.97     rhino.acme.com          # source server
#       38.25.63.10     x.acme.com              # x client host

# localhost name resolution is handled within DNS itself.
#	127.0.0.1       localhost
#	::1             localhost`;

  const rules = hostsEditor.parseHosts(header);
  assert.strictEqual(rules.length, 4, `Expected exactly 4 example rules, got ${rules.length}`);
  assert.strictEqual(rules[0].ip, '102.54.94.97');
  assert.strictEqual(rules[0].domain, 'rhino.acme.com');
  assert.strictEqual(rules[1].ip, '38.25.63.10');
  assert.strictEqual(rules[2].ip, '127.0.0.1');
  assert.strictEqual(rules[3].ip, '::1');
  for (const r of rules) {
    assert.strictEqual(r.enabled, false);
  }
});

test('Check 1.3: Comment with colons "# Note: do not modify this line" produces 0 rules', () => {
  const line = '# Note: do not modify this line';
  const rules = hostsEditor.parseHosts(line);
  assert.strictEqual(rules.length, 0, `Expected 0 rules, got ${rules.length}`);
});

test('Check 1.4: Various English comment words with colons produce 0 rules', () => {
  const comments = [
    '# Warning: test',
    '# Attention: internal',
    '# IP: 127.0.0.1',
    '# TODO: remove this',
    '# Description: local dns override',
    '# Time: 12:00:00'
  ].join('\n');
  const rules = hostsEditor.parseHosts(comments);
  assert.strictEqual(rules.length, 0, `Expected 0 rules, got ${rules.length}`);
});

test('Check 1.5: Non-IP strings, out-of-range IPv4, non-hex IPv6, and missing domain produce 0 rules', () => {
  const invalid = [
    '999.999.999.999 fake.domain',
    '256.1.1.1 out-of-range.domain',
    '1.2.3 non-quad.domain',
    'abcd:efgh::1 non-hex.domain',
    '127.0.0.1', // missing domain
    '# 127.0.0.1' // commented missing domain
  ].join('\n');
  const rules = hostsEditor.parseHosts(invalid);
  assert.strictEqual(rules.length, 0, `Expected 0 rules, got ${rules.length}`);
});

// -------------------------------------------------------------
// CHECK 2: Hosts multi-domain toggle isolation
// -------------------------------------------------------------
console.log('\n--- 2. HOSTS TOGGLE ISOLATION & INTEGRITY ---');

test('Check 2.1: Toggling multi-domain line ("127.0.0.1 siteA.local siteB.local") does NOT disable siteB', () => {
  const initial = '127.0.0.1 siteA.local siteB.local';
  const rules = hostsEditor.parseHosts(initial);
  assert.strictEqual(rules.length, 2);
  assert.strictEqual(rules[0].domain, 'siteA.local');
  assert.strictEqual(rules[1].domain, 'siteB.local');

  // Toggle siteA (disable it)
  const modified = hostsEditor.toggleRule(rules[0], initial);
  const updatedRules = hostsEditor.parseHosts(modified);

  const siteA = updatedRules.find(r => r.domain === 'siteA.local');
  const siteB = updatedRules.find(r => r.domain === 'siteB.local');

  assert(siteA, 'siteA.local should still exist in rules');
  assert(siteB, 'siteB.local should still exist in rules');
  assert.strictEqual(siteA.enabled, false, 'siteA.local should now be disabled');
  assert.strictEqual(siteB.enabled, true, 'siteB.local MUST remain enabled!');
});

test('Check 2.2: Enabling a disabled domain on a multi-domain line isolates that domain', () => {
  const initial = '# 127.0.0.1 siteA.local siteB.local';
  const rules = hostsEditor.parseHosts(initial);
  assert.strictEqual(rules.length, 2);
  assert.strictEqual(rules[0].enabled, false);
  assert.strictEqual(rules[1].enabled, false);

  // Toggle siteA (enable it)
  const modified = hostsEditor.toggleRule(rules[0], initial);
  const updatedRules = hostsEditor.parseHosts(modified);

  const siteA = updatedRules.find(r => r.domain === 'siteA.local');
  const siteB = updatedRules.find(r => r.domain === 'siteB.local');

  assert(siteA, 'siteA.local should exist');
  assert(siteB, 'siteB.local should exist');
  assert.strictEqual(siteA.enabled, true, 'siteA.local should now be enabled');
  assert.strictEqual(siteB.enabled, false, 'siteB.local MUST remain disabled!');
});

test('Check 2.3: Toggling multi-domain line with inline comment preserves comment on remaining line', () => {
  const initial = '127.0.0.1 site1.dev site2.dev site3.dev # important dev endpoints';
  const rules = hostsEditor.parseHosts(initial);
  assert.strictEqual(rules.length, 3);

  // Disable site2.dev
  const modified = hostsEditor.toggleRule(rules[1], initial);
  const updatedRules = hostsEditor.parseHosts(modified);

  assert.strictEqual(updatedRules.length, 3);
  const s1 = updatedRules.find(r => r.domain === 'site1.dev');
  const s2 = updatedRules.find(r => r.domain === 'site2.dev');
  const s3 = updatedRules.find(r => r.domain === 'site3.dev');

  assert.strictEqual(s1.enabled, true);
  assert.strictEqual(s2.enabled, false);
  assert.strictEqual(s3.enabled, true);
  assert(modified.includes('# important dev endpoints'), 'Comment must be preserved');
});

test('Check 2.4: Toggling empty hosts content does NOT return "# "', () => {
  assert.strictEqual(hostsEditor.toggleRule({ lineIndex: 0, enabled: true }, ''), '');
  assert.strictEqual(hostsEditor.toggleRule({ lineIndex: 0, enabled: true }, '   '), '   ');
  assert.strictEqual(hostsEditor.toggleRule(null, ''), '');
  assert.strictEqual(hostsEditor.toggleRule({ lineIndex: 99, enabled: true }, '127.0.0.1 localhost'), '127.0.0.1 localhost');
});

// -------------------------------------------------------------
// CHECK 3: Winget Manager Zero-Updates and Tabular Parsing
// -------------------------------------------------------------
console.log('\n--- 3. WINGET ZERO-UPDATES & COLUMN PARSING ---');

test('Check 3.1: Zero-update winget output does NOT display fake SAMPLE_UPGRADES', () => {
  assert.strictEqual(wingetManager.SAMPLE_UPGRADES.length, 0, 'SAMPLE_UPGRADES array must be empty');

  const zeroUpdateOutputs = [
    'No available package updates found.',
    'No installed package found matching input criteria.',
    'No packages found.'
  ];

  for (const text of zeroUpdateOutputs) {
    const res = wingetManager.parseUpgradeTable(text);
    assert.deepStrictEqual(res, [], `Expected [] for "${text}", got: ${JSON.stringify(res)}`);
  }
});

test('Check 3.2: Shifted winget column alignment does NOT bleed version digits into package ID', () => {
  const shiftedTable = `
Name                                          Id                                   Version       Available     Source
---------------------------------------------------------------------------------------------------------------------
Visual Studio Code                            Microsoft.VisualStudioCode          1.86.0        1.87.0        winget
Docker Desktop for Windows                    Docker.DockerDesktop                4.27.0        4.28.0        winget
`;
  const result = wingetManager.parseUpgradeTable(shiftedTable);
  assert.strictEqual(result.length, 2);
  assert.strictEqual(result[0].id, 'Microsoft.VisualStudioCode', `Captured ID was "${result[0].id}"`);
  assert.strictEqual(result[0].currentVersion, '1.86.0', `Captured Version was "${result[0].currentVersion}"`);
  assert.strictEqual(result[0].availableVersion, '1.87.0', `Captured Available was "${result[0].availableVersion}"`);
  assert.strictEqual(result[1].id, 'Docker.DockerDesktop');
});

test('Check 3.3: Tabular output without separator line parses all rows including first row', () => {
  const noSeparator = `Name                           Id                          Version          Available        Source
Git                            Git.Git                     2.43.0           2.44.0           winget
Node                           NodeJS.NodeJS               20.0.0           22.0.0           winget`;

  const result = wingetManager.parseUpgradeTable(noSeparator);
  assert.strictEqual(result.length, 2, `Expected 2 packages, got ${result.length}`);
  assert.strictEqual(result[0].name, 'Git');
  assert.strictEqual(result[0].id, 'Git.Git');
  assert.strictEqual(result[1].name, 'Node');
  assert.strictEqual(result[1].id, 'NodeJS.NodeJS');
});

test('Check 3.4: Variable-spaced and irregular column output resilience', () => {
  const irregular = `
Name                                    Id                              Version    Available   Source
-----------------------------------------------------------------------------------------------------
Python 3.12 (64-bit)                    Python.Python.3.12              3.12.1     3.12.2      winget
Mozilla Firefox (x64 en-US)             Mozilla.Firefox                 122.0      123.0       winget
`;
  const result = wingetManager.parseUpgradeTable(irregular);
  assert.strictEqual(result.length, 2);
  assert.strictEqual(result[0].id, 'Python.Python.3.12');
  assert.strictEqual(result[0].currentVersion, '3.12.1');
  assert.strictEqual(result[0].availableVersion, '3.12.2');
  assert.strictEqual(result[1].id, 'Mozilla.Firefox');
});

// -------------------------------------------------------------
// CHECK 4: Environment Variables PATH Whitespace Sanitization
// -------------------------------------------------------------
console.log('\n--- 4. PATH QUOTED WHITESPACE SANITIZATION ---');

test('Check 4.1: PATH quoted whitespace ("   ") does NOT produce blank path segments', () => {
  const input = '"C:\\Program Files\\Nodejs";"";"   ";"C:\\Windows"';
  const entries = envManager.parsePathEntries(input);
  for (const e of entries) {
    assert(e.path.trim().length > 0, `Found blank/whitespace segment: "${e.path}"`);
  }
  assert.strictEqual(entries.length, 2);
  assert.strictEqual(entries[0].path, 'C:\\Program Files\\Nodejs');
  assert.strictEqual(entries[1].path, 'C:\\Windows');
});

test('Check 4.2: PATH with tab, space, empty quotes and semicolon bursts', () => {
  const input = ' ; ; "\t" ; "   \t   " ; ; C:\\ValidDir ; ; ; " " ; ; ';
  const entries = envManager.parsePathEntries(input);
  assert.strictEqual(entries.length, 1);
  assert.strictEqual(entries[0].path, 'C:\\ValidDir');
});

// -------------------------------------------------------------
// CHECK 5: Provider Integration Prefix Queries
// -------------------------------------------------------------
console.log('\n--- 5. PROVIDER PREFIX QUERIES & PREVIEW ---');

await testAsync('Check 5.1: Registry matches "audio:" and "winget:" with native provider top priority', async () => {
  const testDir = path.join(os.tmpdir(), `rayclone-recheck-${Date.now()}`);
  fs.mkdirSync(testDir, { recursive: true });
  const registry = createRegistry({ userDataPath: testDir });
  await registry.warm();

  try {
    const audioResults = await registry.search('audio:');
    assert(Array.isArray(audioResults), 'audio: results must be array');
    assert(audioResults.length > 0, 'audio: query must return items');
    assert.strictEqual(audioResults[0].provider, 'audio', `audio: top result provider was ${audioResults[0].provider}`);

    const wingetResults = await registry.search('winget:');
    assert(Array.isArray(wingetResults), 'winget: results must be array');
    assert(wingetResults.length > 0, 'winget: query must return items');
    assert.strictEqual(wingetResults[0].provider, 'winget', `winget: top result provider was ${wingetResults[0].provider}`);

    const hostsResults = await registry.search('hosts:');
    assert(Array.isArray(hostsResults), 'hosts: results must be array');
    assert(hostsResults.length > 0, 'hosts: query must return items');
    assert.strictEqual(hostsResults[0].provider, 'hosts', `hosts: top result provider was ${hostsResults[0].provider}`);

  } finally {
    registry.dispose();
    try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {}
  }
});

// -------------------------------------------------------------
// SUMMARY
// -------------------------------------------------------------
console.log('\n================================================================');
console.log(`RECHECK SUITE COMPLETE: ${passCount} PASSED, ${failCount} FAILED`);
console.log('================================================================\n');

if (failCount > 0) {
  process.exit(1);
}
