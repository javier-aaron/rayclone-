// tools/test-challenger-m1-2.mjs
// Adversarial Empirical Stress Test Suite for Milestone 1 (Challenger 2)
// Targets: src/main/docker-manager.js, src/main/github-shortcuts.js, and integration with providers/preview

import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Import target modules (CommonJS)
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const dockerManager = require(path.join(projectRoot, 'src/main/docker-manager.js'));
const githubShortcuts = require(path.join(projectRoot, 'src/main/github-shortcuts.js'));
const { createRegistry } = require(path.join(projectRoot, 'src/main/providers.js'));
const { getPreviewForItem } = require(path.join(projectRoot, 'src/main/preview.js'));

let testsPassed = 0;
let testsFailed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    testsPassed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    testsFailed++;
    failures.push({ name, error: err });
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    testsPassed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    testsFailed++;
    failures.push({ name, error: err });
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
  }
}

console.log('=== Milestone 1 Challenger 2 Empirical Stress Test Suite ===\n');

// ============================================================================
// 1. DOCKER MANAGER ADVERSARIAL STRESS TESTS
// ============================================================================
console.log('--- Suite 1: Docker Manager Daemon Error & Pipe Handling ---');

test('checkDaemon detects standard Windows named pipe connection error', () => {
  const stderr = 'error during connect: open //./pipe/docker_engine: The system cannot find the file specified.';
  const res = dockerManager.checkDaemon(1, stderr);
  assert.strictEqual(res.active, false);
  assert.strictEqual(res.error, 'Docker daemon stopped');
});

test('checkDaemon detects linux socket connection error', () => {
  const stderr = 'Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?';
  const res = dockerManager.checkDaemon(1, stderr);
  assert.strictEqual(res.active, false);
  assert.strictEqual(res.error, 'Docker daemon stopped');
});

test('checkDaemon handles non-zero exit code with empty stderr', () => {
  const res = dockerManager.checkDaemon(1, '');
  assert.strictEqual(res.active, false);
  assert.strictEqual(res.error, 'Docker daemon stopped');
});

test('checkDaemon handles null and undefined inputs safely without throwing', () => {
  const res1 = dockerManager.checkDaemon(null, null);
  assert.strictEqual(res1.active, false);

  const res2 = dockerManager.checkDaemon(undefined, undefined);
  assert.strictEqual(res2.active, false);

  const res3 = dockerManager.checkDaemon(0, null);
  assert.strictEqual(res3.active, true);
});

test('checkDaemon handles exitCode 0 with normal stderr', () => {
  const res = dockerManager.checkDaemon(0, '');
  assert.strictEqual(res.active, true);
  assert.strictEqual(res.error, undefined);
});

console.log('\n--- Suite 2: Docker Manager JSON Parsing Corruptions & NDJSON Stress ---');

test('parseContainers handles empty, whitespace, and null inputs', () => {
  assert.deepStrictEqual(dockerManager.parseContainers(''), []);
  assert.deepStrictEqual(dockerManager.parseContainers('   \n  \r\n   '), []);
  assert.deepStrictEqual(dockerManager.parseContainers(null), []);
  assert.deepStrictEqual(dockerManager.parseContainers(undefined), []);
});

test('parseContainers skips syntax-corrupted JSON lines cleanly without throwing', () => {
  const corruptInput = [
    '{bad json line',
    '{"ID": ',
    '{"unclosed": "brace"',
    '<<<malformed>>>'
  ].join('\n');

  const containers = dockerManager.parseContainers(corruptInput);
  assert.ok(Array.isArray(containers));
  assert.strictEqual(containers.length, 0);
});

test('parseContainers survives primitive and non-object JSON values without unhandled exceptions', () => {
  const primitiveInput = [
    'null',
    '12345',
    '"just a string"',
    'true',
    '[1, 2, 3]',
    '{"valid": "but no standard container fields"}'
  ].join('\n');

  // Should parse without throwing any exception
  const containers = dockerManager.parseContainers(primitiveInput);
  assert.ok(Array.isArray(containers));
  // Note: JSON.parse("null") throws inside try block on property access and is cleanly skipped.
  // Primitives like 12345, "string", true, [1,2,3], and empty object return fallback defaults.
  assert.strictEqual(containers.length, 5);
  for (const c of containers) {
    assert.strictEqual(typeof c.id, 'string');
    assert.strictEqual(typeof c.name, 'string');
    assert.strictEqual(typeof c.running, 'boolean');
  }
});

test('parseContainers handles NDJSON with missing properties and null values', () => {
  const input = [
    JSON.stringify({ ID: 'abcdef1234567890', Names: '/my-app', Image: 'node:20', State: 'running', Status: 'Up 3 hours', Ports: '8080/tcp' }),
    JSON.stringify({ ID: '1122334455667788', Names: 'redis-cache', Image: 'redis:alpine', State: 'exited', Status: 'Exited (0) 10 minutes ago' }),
    JSON.stringify({ Id: 'aabbccddeeff', Name: '/postgres-db' }), // alternative property names
    JSON.stringify({ Names: '/leading-slash' }), // missing ID, Image, State, Ports
    JSON.stringify({ Status: 'Up 5 minutes' }) // missing State, should infer running from Status
  ].join('\n');

  const containers = dockerManager.parseContainers(input);
  assert.strictEqual(containers.length, 5);

  // Container 1: full properties
  assert.strictEqual(containers[0].id, 'abcdef123456'); // truncated to 12 chars
  assert.strictEqual(containers[0].name, 'my-app'); // leading slash stripped
  assert.strictEqual(containers[0].state, 'running');
  assert.strictEqual(containers[0].running, true);
  assert.strictEqual(containers[0].ports, '8080/tcp');

  // Container 2: exited state
  assert.strictEqual(containers[1].id, '112233445566');
  assert.strictEqual(containers[1].name, 'redis-cache');
  assert.strictEqual(containers[1].state, 'exited');
  assert.strictEqual(containers[1].running, false);

  // Container 3: Name and Id variants
  assert.strictEqual(containers[2].id, 'aabbccddeeff');
  assert.strictEqual(containers[2].name, 'postgres-db');
  assert.strictEqual(containers[2].state, 'exited');

  // Container 4: Only Names
  assert.strictEqual(containers[3].name, 'leading-slash');
  assert.strictEqual(containers[3].id, '');
  assert.strictEqual(containers[3].ports, '');

  // Container 5: Status 'Up ...' infers running
  assert.strictEqual(containers[4].name, 'container');
  assert.strictEqual(containers[4].state, 'running');
  assert.strictEqual(containers[4].running, true);
});

test('getFallbackItem returns valid actionable item structure', () => {
  const item = dockerManager.getFallbackItem();
  assert.strictEqual(item.id, 'docker:stopped');
  assert.strictEqual(item.group, 'Docker Containers');
  assert.ok(item.title.includes('Docker Desktop is stopped'));
  assert.ok(item.dockerData);
  assert.strictEqual(item.dockerData.status, 'stopped');
  assert.strictEqual(item.actions.length, 1);
  assert.strictEqual(item.actions[0].id, 'start-docker');
  const actionRes = item.actions[0].run();
  assert.strictEqual(actionRes.ok, true);
  assert.strictEqual(actionRes.started, true);
});

console.log('\n--- Suite 3: Docker Manager Container Lifecycle Actions Error Resilience ---');

await asyncTest('startContainer with non-existent container ID resolves with error without crashing', async () => {
  const res = await dockerManager.startContainer('non_existent_fake_container_99999');
  assert.strictEqual(typeof res, 'object');
  assert.strictEqual(res.id, 'non_existent_fake_container_99999');
  assert.strictEqual(typeof res.ok, 'boolean');
  assert.strictEqual(res.ok, false);
  assert.ok(res.error !== null);
});

await asyncTest('stopContainer with non-existent container ID resolves with error without crashing', async () => {
  const res = await dockerManager.stopContainer('non_existent_fake_container_99999');
  assert.strictEqual(typeof res, 'object');
  assert.strictEqual(res.id, 'non_existent_fake_container_99999');
  assert.strictEqual(res.ok, false);
  assert.ok(res.error !== null);
});

await asyncTest('restartContainer with non-existent container ID resolves with error without crashing', async () => {
  const res = await dockerManager.restartContainer('non_existent_fake_container_99999');
  assert.strictEqual(typeof res, 'object');
  assert.strictEqual(res.id, 'non_existent_fake_container_99999');
  assert.strictEqual(res.ok, false);
  assert.ok(res.error !== null);
});

await asyncTest('getContainerLogs with non-existent container ID resolves with error without crashing', async () => {
  const res = await dockerManager.getContainerLogs('non_existent_fake_container_99999', 10);
  assert.strictEqual(typeof res, 'object');
  assert.strictEqual(res.id, 'non_existent_fake_container_99999');
  assert.strictEqual(res.ok, false);
});

await asyncTest('container actions with shell metacharacters do not execute injected commands', async () => {
  // Pass malicious payload as ID: execFile should not execute the command because it does not use a shell
  const res = await dockerManager.startContainer('& echo INJECTED &');
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.id, '& echo INJECTED &');
});

// ============================================================================
// 2. GITHUB & GITLAB SHORTCUTS ADVERSARIAL STRESS TESTS
// ============================================================================
console.log('\n--- Suite 4: GitHub / GitLab Special Characters & Query Injection ---');

test('parseShortcut handles special characters, ampersands, hashes, questions, and equals', () => {
  const query = 'gh pr test & special # ? =';
  const parsed = githubShortcuts.parseShortcut(query);
  assert.ok(parsed !== null);
  assert.strictEqual(parsed.platform, 'github');
  assert.strictEqual(parsed.kind, 'pr');
  assert.strictEqual(parsed.query, 'test & special # ? =');
  assert.strictEqual(
    parsed.url,
    'https://github.com/pulls?q=test%20%26%20special%20%23%20%3F%20%3D'
  );
});

test('parseShortcut handles quotes, angle brackets, scripts, and backticks safely', () => {
  const query = 'gh issue <script>alert("xss")</script> `code`';
  const parsed = githubShortcuts.parseShortcut(query);
  assert.ok(parsed !== null);
  assert.strictEqual(parsed.platform, 'github');
  assert.strictEqual(parsed.kind, 'issue');
  assert.strictEqual(parsed.query, '<script>alert("xss")</script> `code`');
  assert.strictEqual(
    parsed.url,
    'https://github.com/issues?q=%3Cscript%3Ealert(%22xss%22)%3C%2Fscript%3E%20%60code%60'
  );
});

test('parseShortcut handles GitLab MR with complex punctuation and path tokens', () => {
  const query = 'gl mr feature/login-v2!@$%^*()_+';
  const parsed = githubShortcuts.parseShortcut(query);
  assert.ok(parsed !== null);
  assert.strictEqual(parsed.platform, 'gitlab');
  assert.strictEqual(parsed.kind, 'mr');
  assert.strictEqual(parsed.query, 'feature/login-v2!@$%^*()_+');
  assert.strictEqual(
    parsed.url,
    'https://gitlab.com/dashboard/merge_requests?search=feature%2Flogin-v2!%40%24%25%5E*()_%2B'
  );
});

test('parseShortcut handles Unicode characters and Emojis', () => {
  const query = 'glab issue 🚀 bug in 日本語 search';
  const parsed = githubShortcuts.parseShortcut(query);
  assert.ok(parsed !== null);
  assert.strictEqual(parsed.platform, 'gitlab');
  assert.strictEqual(parsed.kind, 'issue');
  assert.strictEqual(parsed.query, '🚀 bug in 日本語 search');
  assert.ok(parsed.url.includes(encodeURIComponent('🚀 bug in 日本語 search')));
});

console.log('\n--- Suite 5: GitHub / GitLab Case Insensitivity Stress ---');

test('parseShortcut is case insensitive across prefix, subcommands, and mixed casings', () => {
  const cases = [
    { input: 'GH PR electron', platform: 'github', kind: 'pr', query: 'electron' },
    { input: 'Gh Prs electron', platform: 'github', kind: 'pr', query: 'electron' },
    { input: 'gH PULLS electron', platform: 'github', kind: 'pr', query: 'electron' },
    { input: 'GH ISSUE memory leak', platform: 'github', kind: 'issue', query: 'memory leak' },
    { input: 'gh ISSUES crash', platform: 'github', kind: 'issue', query: 'crash' },
    { input: 'GH REPO raycast/extensions', platform: 'github', kind: 'repo', query: 'raycast/extensions' },
    { input: 'Gh REPOS raycast', platform: 'github', kind: 'repo', query: 'raycast' },
    { input: 'GL MR backend-api', platform: 'gitlab', kind: 'mr', query: 'backend-api' },
    { input: 'GlAb MrS frontend', platform: 'gitlab', kind: 'mr', query: 'frontend' },
    { input: 'GLAB MERGE_REQUESTS sync', platform: 'gitlab', kind: 'mr', query: 'sync' },
    { input: 'GlAb IsSuE auth token', platform: 'gitlab', kind: 'issue', query: 'auth token' },
    { input: 'GL REPO org/project', platform: 'gitlab', kind: 'repo', query: 'org/project' },
    { input: 'gLaB PROJECTS infrastructure', platform: 'gitlab', kind: 'repo', query: 'infrastructure' }
  ];

  for (const c of cases) {
    const res = githubShortcuts.parseShortcut(c.input);
    assert.ok(res !== null, `Failed to parse: ${c.input}`);
    assert.strictEqual(res.platform, c.platform, `Platform mismatch for ${c.input}`);
    assert.strictEqual(res.kind, c.kind, `Kind mismatch for ${c.input}`);
    assert.strictEqual(res.query, c.query, `Query mismatch for ${c.input}`);
  }
});

console.log('\n--- Suite 6: URL Resolution & Fallback Behavior ---');

test('parseShortcut handles empty subqueries and root dashboards correctly', () => {
  // Empty PR / MR
  assert.strictEqual(githubShortcuts.parseShortcut('gh pr').url, 'https://github.com/pulls');
  assert.strictEqual(githubShortcuts.parseShortcut('GH PR').url, 'https://github.com/pulls');
  assert.strictEqual(githubShortcuts.parseShortcut('gl mr').url, 'https://gitlab.com/dashboard/merge_requests');
  assert.strictEqual(githubShortcuts.parseShortcut('glab mr').url, 'https://gitlab.com/dashboard/merge_requests');

  // Empty Issues
  assert.strictEqual(githubShortcuts.parseShortcut('gh issue').url, 'https://github.com/issues');
  assert.strictEqual(githubShortcuts.parseShortcut('gl issue').url, 'https://gitlab.com/dashboard/issues');

  // Empty Repos
  assert.strictEqual(githubShortcuts.parseShortcut('gh repo').url, 'https://github.com');
  assert.strictEqual(githubShortcuts.parseShortcut('gl repo').url, 'https://gitlab.com/explore');
  assert.strictEqual(githubShortcuts.parseShortcut('glab repo').url, 'https://gitlab.com/explore');

  // Bare prefix without subcommand
  assert.strictEqual(githubShortcuts.parseShortcut('gh').url, 'https://github.com');
  assert.strictEqual(githubShortcuts.parseShortcut('GH').url, 'https://github.com');
  assert.strictEqual(githubShortcuts.parseShortcut('gl').url, 'https://gitlab.com/explore');
  assert.strictEqual(githubShortcuts.parseShortcut('glab').url, 'https://gitlab.com/explore');
});

test('parseShortcut handles trailing and multiple whitespace', () => {
  const res1 = githubShortcuts.parseShortcut('   gh    pr    ');
  assert.ok(res1 !== null);
  assert.strictEqual(res1.query, '');
  assert.strictEqual(res1.url, 'https://github.com/pulls');

  const res2 = githubShortcuts.parseShortcut('   gh    pr    fix   issue   ');
  assert.ok(res2 !== null);
  assert.strictEqual(res2.query, 'fix issue');
  assert.strictEqual(res2.url, 'https://github.com/pulls?q=fix%20issue');
});

test('parseShortcut rejects non-matching queries gracefully', () => {
  assert.strictEqual(githubShortcuts.parseShortcut(''), null);
  assert.strictEqual(githubShortcuts.parseShortcut('   '), null);
  assert.strictEqual(githubShortcuts.parseShortcut(null), null);
  assert.strictEqual(githubShortcuts.parseShortcut(undefined), null);
  assert.strictEqual(githubShortcuts.parseShortcut('google search query'), null);
  assert.strictEqual(githubShortcuts.parseShortcut('git status'), null);
});

test('resolveGithubUrl and resolveGitlabUrl direct invocation', () => {
  assert.strictEqual(githubShortcuts.resolveGithubUrl('pr', 'test'), 'https://github.com/pulls?q=test');
  assert.strictEqual(githubShortcuts.resolveGithubUrl('pr', ''), 'https://github.com/pulls');
  assert.strictEqual(githubShortcuts.resolveGithubUrl('issues', 'bug'), 'https://github.com/issues?q=bug');
  assert.strictEqual(githubShortcuts.resolveGithubUrl('repo', 'rayclone'), 'https://github.com/search?q=rayclone&type=repositories');

  assert.strictEqual(githubShortcuts.resolveGitlabUrl('mr', 'fix'), 'https://gitlab.com/dashboard/merge_requests?search=fix');
  assert.strictEqual(githubShortcuts.resolveGitlabUrl('mr', ''), 'https://gitlab.com/dashboard/merge_requests');
  assert.strictEqual(githubShortcuts.resolveGitlabUrl('issues', '500'), 'https://gitlab.com/dashboard/issues?search=500');
  assert.strictEqual(githubShortcuts.resolveGitlabUrl('repo', 'infra'), 'https://gitlab.com/explore/projects?name=infra');
});

console.log('\n--- Suite 7: Full Registry & Preview Integration Verification ---');

const tmpDir = path.join(projectRoot, '.cache', 'test-adversarial-m1-2');
if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true });
}

await asyncTest('Registry search with GitHub special characters and preview generation', async () => {
  const registry = createRegistry({ userDataPath: tmpDir });
  const results = await registry.search('gh pr test & special # ? =');
  assert.ok(results.length >= 1);
  const item = results.find((r) => r.provider === 'github-shortcuts');
  assert.ok(item, 'Expected github-shortcuts item in search results');
  assert.strictEqual(item.group, 'GitHub / GitLab');
  assert.strictEqual(item.targetUrl, 'https://github.com/pulls?q=test%20%26%20special%20%23%20%3F%20%3D');

  // Preview generation test
  const preview = await getPreviewForItem(item);
  assert.strictEqual(preview.type, 'quicklink');
  assert.strictEqual(preview.platform, 'GitHub');
  assert.strictEqual(preview.url, item.targetUrl);

  // Copy action execution test
  const copyAction = item.actions.find((a) => a.id === 'copy');
  assert.ok(copyAction);
  const copyRes = await copyAction.run();
  assert.strictEqual(copyRes, item.targetUrl);
});

await asyncTest('Registry search with Docker query when stopped produces fallback', async () => {
  const registry = createRegistry({ userDataPath: tmpDir });
  const results = await registry.search('docker');
  assert.ok(results.length > 0);
  const dockerItem = results.find((r) => r.provider === 'docker');
  assert.ok(dockerItem, 'Expected docker provider item in search results');

  // If daemon is stopped, should have start-docker action
  const preview = await getPreviewForItem(dockerItem);
  assert.strictEqual(preview.type, 'docker');
  assert.ok(preview.title);
});

console.log('\n============================================================');
console.log(`Summary: ${testsPassed} passed, ${testsFailed} failed`);
console.log('============================================================');

if (testsFailed > 0) {
  process.exit(1);
}
