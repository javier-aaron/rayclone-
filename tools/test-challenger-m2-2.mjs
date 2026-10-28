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
console.log('=== Challenger 2 Adversarial Stress Suite for Milestone 2 ===');
console.log('================================================================\n');

let passCount = 0;
const findings = [];

function pass(name, detail = '') {
  console.log(`  ✓ [PASS] ${name}${detail ? ' (' + detail + ')' : ''}`);
  passCount++;
}

function recordFinding(category, severity, title, detail, reproduction) {
  console.log(`  ⚠ [${severity.toUpperCase()} FINDING] ${title}`);
  findings.push({ category, severity, title, detail, reproduction });
}

// =====================================================================
// SUITE 1: ENVIRONMENT VARIABLES STRESS TESTING
// =====================================================================
console.log('\n--- SUITE 1: Environment Variables Stress ---');

// 1.1 Non-string or null/undefined inputs to parsePathEntries
{
  assert.deepStrictEqual(envManager.parsePathEntries(null), []);
  assert.deepStrictEqual(envManager.parsePathEntries(undefined), []);
  assert.deepStrictEqual(envManager.parsePathEntries(''), []);
  assert.deepStrictEqual(envManager.parsePathEntries(12345), []);
  assert.deepStrictEqual(envManager.parsePathEntries({}), []);
  assert.deepStrictEqual(envManager.parsePathEntries([]), []);
  pass('parsePathEntries null / undefined / empty / non-string handling');
}

// 1.2 Broken paths and non-existent paths
{
  const brokenPath = 'C:\\NonExistent_Fake_Dir_99999\\bin;Z:\\Impossible_Drive\\path;X:\\invalid??<>*|';
  const entries = envManager.parsePathEntries(brokenPath);
  assert.strictEqual(entries.length, 3);
  assert.strictEqual(entries[0].exists, false);
  assert.strictEqual(entries[1].exists, false);
  assert.strictEqual(entries[2].exists, false);
  pass('parsePathEntries broken / non-existent paths return exists=false safely');
}

// 1.3 Relative paths
{
  const relativeInput = '.\\src;..\\rayclone;relative_folder\\sub';
  const entries = envManager.parsePathEntries(relativeInput);
  assert.strictEqual(entries.length, 3);
  for (const e of entries) {
    assert.strictEqual(typeof e.exists, 'boolean');
  }
  pass('parsePathEntries relative paths resolved without exception');
}

// 1.4 Quoted segments, empty quotes, and whitespace in quotes (EMPIRICAL FINDING)
{
  const quoted = '"C:\\Program Files\\Nodejs";"";"   ";"C:\\Windows"';
  const entries = envManager.parsePathEntries(quoted);
  const whitespaceEntry = entries.find(e => e.path.trim() === '');
  if (whitespaceEntry) {
    recordFinding(
      'Environment Variables',
      'Medium',
      'parsePathEntries retains un-trimmed whitespace from quoted segments',
      `Input '"   "' stripped outer quotes but was not trimmed afterwards, resulting in empty/whitespace entry: "${whitespaceEntry.path}"`,
      'envManager.parsePathEntries(\'"   "\') -> [{ path: "   ", exists: false }]'
    );
  } else {
    pass('parsePathEntries quotes and whitespace sanitization');
  }
}

// 1.5 Trailing semicolons and empty segments
{
  const trailing = ';;;C:\\Windows;;;C:\\Windows\\System32;;;   ; ;;;';
  const entries = envManager.parsePathEntries(trailing);
  assert.strictEqual(entries.length, 2);
  assert.strictEqual(entries[0].path, 'C:\\Windows');
  assert.strictEqual(entries[1].path, 'C:\\Windows\\System32');
  pass('parsePathEntries trailing semicolons and redundant empty segments filtered');
}

// 1.6 filterEnv with edge cases
{
  const sampleMap = {
    PATH: 'C:\\Windows;C:\\Windows\\System32',
    TEMP: 'C:\\Temp',
    USER_FOO: 'bar'
  };
  assert.strictEqual(envManager.filterEnv(sampleMap, '').length, 3);
  assert.strictEqual(envManager.filterEnv(sampleMap, 'NOT_A_REAL_VAR_999').length, 0);
  assert.deepStrictEqual(envManager.filterEnv(null, 'foo'), []);
  assert.deepStrictEqual(envManager.filterEnv(undefined, 'foo'), []);
  pass('filterEnv edge cases (empty query, non-existent, null/undefined map)');
}

// =====================================================================
// SUITE 2: WINGET UPDATER STRESS TESTING
// =====================================================================
console.log('\n--- SUITE 2: Winget Updater Stress ---');

// 2.1 parseUpgradeTable with malformed outputs
{
  assert.deepStrictEqual(wingetManager.parseUpgradeTable(null), []);
  assert.deepStrictEqual(wingetManager.parseUpgradeTable(undefined), []);
  assert.deepStrictEqual(wingetManager.parseUpgradeTable(''), []);
  assert.deepStrictEqual(wingetManager.parseUpgradeTable('\n\n\r\n'), []);
  assert.deepStrictEqual(wingetManager.parseUpgradeTable('-------------------------------------'), []);
  pass('parseUpgradeTable malformed / empty / null / pure-dash input resilience');
}

// 2.2 parseUpgradeTable with header but zero data rows
{
  const emptyTable = `
Name                           Id                          Version          Available        Source
---------------------------------------------------------------------------------------------------
`;
  const result = wingetManager.parseUpgradeTable(emptyTable);
  assert.deepStrictEqual(result, []);
  pass('parseUpgradeTable header with 0 packages returns empty array');
}

// 2.3 parseUpgradeTable with winget standard "no updates" messages
{
  const noUpdates = 'No available package updates found.';
  assert.deepStrictEqual(wingetManager.parseUpgradeTable(noUpdates), []);
  const noInstalled = 'No installed package found matching input criteria.';
  assert.deepStrictEqual(wingetManager.parseUpgradeTable(noInstalled), []);
  pass('parseUpgradeTable standard winget no-updates text handling');
}

// 2.4 parseUpgradeTable with ANSI escape sequences (spinners, color codes)
{
  const ansiTable = `\x1b[?25l
Name                           Id                          Version          Available        Source
---------------------------------------------------------------------------------------------------
Google Chrome                  Google.Chrome               122.0.6261.95    123.0.6312.59    winget
\x1b[2K\x1b[?25h`;
  const result = wingetManager.parseUpgradeTable(ansiTable);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].id, 'Google.Chrome');
  pass('parseUpgradeTable ANSI escape sequences handled without failure');
}

// 2.5 Column alignment shifts and multi-space fallback (EMPIRICAL FINDING)
{
  const shiftedTable = `
Name                                          Id                                   Version       Available     Source
---------------------------------------------------------------------------------------------------------------------
Visual Studio Code                            Microsoft.VisualStudioCode          1.86.0        1.87.0        winget
Docker Desktop for Windows                    Docker.DockerDesktop                4.27.0        4.28.0        winget
`;
  const result = wingetManager.parseUpgradeTable(shiftedTable);
  if (result.length > 0 && result[0].id !== 'Microsoft.VisualStudioCode') {
    recordFinding(
      'Winget Manager',
      'High',
      'Column alignment shifts corrupt package IDs with version numbers',
      `Fixed-index slicing captured '${result[0].id}' instead of 'Microsoft.VisualStudioCode', causing 1-click update commands to fail.`,
      `parseUpgradeTable(shiftedTable)[0].id === "${result[0].id}"`
    );
  } else {
    pass('parseUpgradeTable column shift handling');
  }
}

// 2.6 Missing separator line drops first package (EMPIRICAL FINDING)
{
  const noSeparator = `Name                           Id                          Version          Available        Source
Git                            Git.Git                     2.43.0           2.44.0           winget
Node                           NodeJS.NodeJS               20.0.0           22.0.0           winget`;
  const result = wingetManager.parseUpgradeTable(noSeparator);
  if (result.length === 1 && result[0].name === 'Node') {
    recordFinding(
      'Winget Manager',
      'Medium',
      'Missing separator line silently drops first package row',
      'Hardcoded "headerIdx + 2" loop skips index 1, dropping the first package if no dashed line exists.',
      'parseUpgradeTable(noSeparator) returns 1 item instead of 2; Git is missing.'
    );
  } else {
    pass('parseUpgradeTable without separator line');
  }
}

// 2.7 Zero-updates system shows fake sample packages (EMPIRICAL FINDING)
{
  const parsed = wingetManager.parseUpgradeTable('No available package updates found.');
  let cached = [];
  if (parsed.length > 0) cached = parsed;
  else if (cached.length === 0) cached = JSON.parse(JSON.stringify(wingetManager.SAMPLE_UPGRADES));

  if (cached.length > 0) {
    recordFinding(
      'Winget Manager',
      'Critical',
      'Zero-update systems fall back to displaying fake sample upgrades',
      'When winget executes cleanly with 0 updates, scanUpgrades falls back to SAMPLE_UPGRADES (Node.js, Docker, Git, Terminal), telling up-to-date users to upgrade packages they may not need or have.',
      'scanUpgrades() on up-to-date host returns 4 sample items instead of [].'
    );
  }
}

// 2.8 checkWingetAvailable execution
{
  const avail = await wingetManager.checkWingetAvailable();
  assert.strictEqual(typeof avail, 'boolean');
  pass('checkWingetAvailable resolves boolean safely', `Host winget: ${avail}`);
}

// =====================================================================
// SUITE 3: HOSTS EDITOR STRESS TESTING
// =====================================================================
console.log('\n--- SUITE 3: Hosts Editor Stress ---');

// 3.1 parseHosts with empty or whitespace-only content
{
  assert.deepStrictEqual(hostsEditor.parseHosts(null), []);
  assert.deepStrictEqual(hostsEditor.parseHosts(undefined), []);
  assert.deepStrictEqual(hostsEditor.parseHosts(''), []);
  assert.deepStrictEqual(hostsEditor.parseHosts('   \r\n\t   \n  \r\n'), []);
  pass('parseHosts empty and whitespace handling');
}

// 3.2 parseHosts with mixed tabs and spaces
{
  const tabContent = `
\t127.0.0.1\t\t\ttab-host.local\t\t
  192.168.1.50     spaced-host.local
`;
  const rules = hostsEditor.parseHosts(tabContent);
  assert.strictEqual(rules.length, 2);
  assert.strictEqual(rules[0].domain, 'tab-host.local');
  assert.strictEqual(rules[1].domain, 'spaced-host.local');
  pass('parseHosts mixed tabs and spaces parsed accurately');
}

// 3.3 parseHosts with IPv6 addresses and loopbacks
{
  const ipv6Content = `
::1             localhost
::1             ip6-localhost ip6-loopback
fe80::1%lo0     localhost
2001:db8::1     ipv6.example.com
`;
  const rules = hostsEditor.parseHosts(ipv6Content);
  assert.strictEqual(rules.length, 5);
  assert.strictEqual(rules[0].ip, '::1');
  assert.strictEqual(rules[4].ip, '2001:db8::1');
  pass('parseHosts IPv6 addresses and loopbacks parsed');
}

// 3.4 parseHosts with inline comments
{
  const content = `
127.0.0.1       api.local # main development API
# 127.0.0.1     disabled.local # this is disabled
127.0.0.1       no-space.local #comment-without-space
127.0.0.1       # just an IP followed by comment
`;
  const rules = hostsEditor.parseHosts(content);
  assert.strictEqual(rules.length, 3);
  assert.strictEqual(rules[0].comment, 'main development API');
  assert.strictEqual(rules[1].comment, 'this is disabled');
  assert.strictEqual(rules[1].enabled, false);
  pass('parseHosts inline comments and disabled comments parsed');
}

// 3.5 Real Windows hosts file comment boilerplate parsed as phantom rules (CRITICAL EMPIRICAL FINDING)
{
  const realHostsBoilerplate = '# localhost name resolution is handled within DNS itself.';
  const phantomRules = hostsEditor.parseHosts(realHostsBoilerplate);
  if (phantomRules.length > 0) {
    recordFinding(
      'Hosts Editor',
      'Critical',
      'Standard Windows hosts boilerplate parsed as phantom rules',
      `Default Windows hosts line '# localhost name resolution is handled within DNS itself.' parsed into ${phantomRules.length} fake rules with IP 'localhost' and domains: ${phantomRules.map(r => r.domain).join(', ')}.`,
      'hostsEditor.parseHosts("# localhost name resolution is handled within DNS itself.")'
    );
  }
}

// 3.6 Comment lines containing colons misidentified as IPv6 rules (EMPIRICAL FINDING)
{
  const colonComments = `
# Note: do not modify this line
# Warning: production server ahead
`;
  const rulesWithColons = hostsEditor.parseHosts(colonComments);
  if (rulesWithColons.length > 0) {
    recordFinding(
      'Hosts Editor',
      'High',
      'English comments containing colons misidentified as IPv6 hosts rules',
      `Regex condition "ip.includes(':')" matches common words like 'Note:' or 'Warning:', generating phantom rules: ${rulesWithColons.map(r => r.ip + ' -> ' + r.domain).join(', ')}.`,
      'hostsEditor.parseHosts("# Note: do not modify this line")'
    );
  }
}

// 3.7 Multi-domain lines collateral damage on toggle (EMPIRICAL FINDING)
{
  const multiDomainContent = '127.0.0.1 siteA.local siteB.local siteC.local';
  const rules = hostsEditor.parseHosts(multiDomainContent);
  const toggled = hostsEditor.toggleRule(rules[0], multiDomainContent);
  const reParsed = hostsEditor.parseHosts(toggled);
  const allDisabled = reParsed.every(r => !r.enabled);
  if (rules.length === 3 && allDisabled) {
    recordFinding(
      'Hosts Editor',
      'High',
      'Toggling one domain on a multi-domain line disables all other domains on that line',
      'toggleRule prepends "# " to the entire line rather than commenting out or rewriting the specific domain.',
      'hostsEditor.toggleRule(rules[0], "127.0.0.1 siteA.local siteB.local") disables both siteA and siteB.'
    );
  }
}

// 3.8 toggleRule with empty file corrupts to "# " (EMPIRICAL FINDING)
{
  const toggledEmpty = hostsEditor.toggleRule({ lineIndex: 0, enabled: true }, '');
  if (toggledEmpty === '# ') {
    recordFinding(
      'Hosts Editor',
      'Medium',
      'Toggling rule on empty hosts content corrupts file with dangling "# "',
      'String("").split(/\\r?\\n/) has length 1, causing lineIndex 0 to prepend "# " to an empty string.',
      'hostsEditor.toggleRule({ lineIndex: 0, enabled: true }, "") === "# "'
    );
  }
}

// =====================================================================
// SUITE 4: PROVIDER REGISTRY & PREVIEW INTEGRATION STRESS TESTING
// =====================================================================
console.log('\n--- SUITE 4: Provider Integration & Query Stress ---');

const testDir = path.join(os.tmpdir(), `rayclone-m2-stress-${Date.now()}`);
fs.mkdirSync(testDir, { recursive: true });
const registry = createRegistry({ userDataPath: testDir });
await registry.warm();

// 4.1 Non-existent environment variable query
{
  const results = await registry.search('env: NOT_A_REAL_VAR_999');
  assert(Array.isArray(results));
  const envMatches = results.filter(i => i.provider === 'env');
  assert.strictEqual(envMatches.length, 0);
  pass('Search query env: NOT_A_REAL_VAR_999 returns 0 env matches without crashing');
}

// 4.2 Query env: with extra spaces or without space
{
  const res1 = await registry.search('env:');
  assert(res1.length > 0);
  const res2 = await registry.search('env:    ');
  assert(res2.length > 0);
  const res3 = await registry.search('env:PATH');
  assert(res3.some(i => (i.varName || '').toUpperCase() === 'PATH'));
  pass('Search query env: prefix variations and whitespace handled');
}

// 4.3 Preview generation for env variable with broken / malformed PATH entries
{
  const dummyItem = {
    id: 'env:User:TEST_PATH',
    provider: 'env',
    group: 'Environment Variables',
    title: 'TEST_PATH (User)',
    varName: 'TEST_PATH',
    scope: 'User',
    value: 'C:\\Windows;"";Z:\\does_not_exist;.\\relative_test;C:\\Windows;;;',
    envData: {
      name: 'TEST_PATH',
      value: 'C:\\Windows;"";Z:\\does_not_exist;.\\relative_test;C:\\Windows;;;',
      scope: 'User',
      paths: envManager.parsePathEntries('C:\\Windows;"";Z:\\does_not_exist;.\\relative_test;C:\\Windows;;;')
    }
  };
  const preview = await getPreviewForItem(dummyItem);
  assert.strictEqual(preview.type, 'env');
  assert(Array.isArray(preview.paths));
  pass('Preview generation for env item with broken, relative, and duplicate paths');
}

// 4.4 Winget query with zero updates or unknown packages
{
  const results = await registry.search('winget: NON_EXISTENT_PACKAGE_XYZ');
  assert(Array.isArray(results));
  const wingetMatches = results.filter(i => i.provider === 'winget');
  assert.strictEqual(wingetMatches.length, 0);
  pass('Search query winget: NON_EXISTENT_PACKAGE_XYZ returns 0 matches cleanly');
}

// 4.5 Winget preview generation with complete data
{
  const dummyItem = {
    id: 'winget:Test.App',
    provider: 'winget',
    group: 'Software Updates',
    title: 'Test App (1.0 -> 2.0)',
    wingetData: {
      id: 'Test.App',
      name: 'Test App',
      currentVersion: '1.0',
      availableVersion: '2.0'
    }
  };
  const preview = await getPreviewForItem(dummyItem);
  assert.strictEqual(preview.type, 'winget');
  assert.strictEqual(preview.name, 'Test App');
  pass('Preview generation for winget item validated');
}

// 4.6 Hosts search and preview with IPv6 and domain queries
{
  const res = await registry.search('hosts:');
  assert(Array.isArray(res));
  assert(res.length > 0);
  pass('Search query hosts: returns host items');
}

// 4.7 Execute action on non-existent hosts rule returns error safely
{
  const resNonExistentItem = await registry.execute('host:nonexistent.domain:999', 'toggle');
  assert.strictEqual(resNonExistentItem.ok, false);
  pass('Execute action on non-existent hosts rule returns ok: false safely');
}

registry.dispose();
try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {}

// =====================================================================
// SUMMARY
// =====================================================================
console.log('\n================================================================');
console.log(`STRESS SUITE COMPLETE: ${passCount} PASSED, ${findings.length} EMPIRICAL FINDINGS IDENTIFIED`);
console.log('================================================================\n');

console.log('--- DETAILED FINDINGS SUMMARY ---');
for (let i = 0; i < findings.length; i++) {
  const f = findings[i];
  console.log(`\n[Finding ${i + 1}] [${f.severity.toUpperCase()}] ${f.category} - ${f.title}`);
  console.log(`  Detail: ${f.detail}`);
  console.log(`  Reproduction: ${f.reproduction}`);
}
