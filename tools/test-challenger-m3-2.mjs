// tools/test-challenger-m3-2.mjs
// Empirical Adversarial Stress Suite for Milestone 3 (R3):
// Parameterized Quicklinks, Providers & Preview Integration

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const assert = require('node:assert');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

const quicklinksManager = require('../src/main/quicklinks-manager.js');
const mediaHud = require('../src/main/media-hud.js');
const { createRegistry } = require('../src/main/providers.js');
const { getPreviewForItem } = require('../src/main/preview.js');
const store = require('../src/main/store.js');

console.log('================================================================');
console.log('=== Challenger 2 Adversarial Stress Suite for Milestone 3 ===');
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

// Sandbox storage for test isolation
const sandboxDir = path.resolve(os.tmpdir(), 'rayclone-m3-challenger-' + Date.now());
fs.mkdirSync(sandboxDir, { recursive: true });
store.init(sandboxDir);

// =====================================================================
// SUITE 1: PARAMETERIZED QUICKLINKS URL INTERPOLATION & SPECIAL CHARACTERS
// =====================================================================
console.log('\n--- SUITE 1: Quicklinks URL Template Interpolation Stress ---');

// 1.1 Special characters: spaces, &, ?, #, /, +, emojis, Unicode
{
  const testEngine = quicklinksManager.createEngine();
  const specialChars = [
    { name: 'Spaces', input: 'so javascript async await', expectedPart: 'javascript%20async%20await' },
    { name: 'Ampersand', input: 'so C++ & Rust', expectedPart: 'C%2B%2B%20%26%20Rust' },
    { name: 'Question Mark', input: 'so why?what?', expectedPart: 'why%3Fwhat%3F' },
    { name: 'Hash/Fragment', input: 'so #heading-1', expectedPart: '%23heading-1' },
    { name: 'Slashes', input: 'so path/to/file', expectedPart: 'path%2Fto%2Ffile' },
    { name: 'Plus sign', input: 'so C++ + 1', expectedPart: 'C%2B%2B%20%2B%201' },
    { name: 'Emojis', input: 'so 🚀 🔥 💻', expectedPart: '%F0%9F%9A%80%20%F0%9F%94%A5%20%F0%9F%92%BB' },
    { name: 'Chinese Unicode', input: 'so 快速排序 算法', expectedPart: '%E5%BF%AB%E9%80%9F%E6%8E%92%E5%BA%8F%20%E7%AE%97%E6%B3%95' },
    { name: 'Accented/European Unicode', input: 'so café résumé naïve', expectedPart: 'caf%C3%A9%20r%C3%A9sum%C3%A9%20na%C3%AFve' },
    { name: 'Cyrillic Unicode', input: 'so Привет мир', expectedPart: '%D0%9F%D1%80%D0%B8%D0%B2%D0%B5%D1%82%20%D0%BC%D0%B8%D1%80' },
    { name: 'Quotes and Brackets', input: 'so "json" [test] {key}', expectedPart: '%22json%22%20%5Btest%5D%20%7Bkey%7D' }
  ];

  for (const tc of specialChars) {
    const match = testEngine.matchQuery(tc.input);
    assert(match, `matchQuery should match prefix for: ${tc.name}`);
    assert.strictEqual(match.isComplete, true, `Should be complete for ${tc.name}`);
    assert(match.resolvedUrl.includes(tc.expectedPart), `Expected resolved URL to contain "${tc.expectedPart}", got: "${match.resolvedUrl}"`);
    
    // Verify resolved URL is a valid parseable URL
    const parsed = new URL(match.resolvedUrl);
    assert(parsed.protocol.startsWith('http'), 'URL should have valid http/https protocol');
  }
  pass('URL template interpolation with spaces, &, ?, #, /, +, emojis, Unicode');
}

// 1.2 Dollar signs and regex replacement escape tokens ($1, $&, $`, $', $$)
{
  const testEngine = quicklinksManager.createEngine();
  const dollarInputs = [
    'so price $100',
    'so $1 $2 $& $` $\'',
    'so $$$$'
  ];

  for (const q of dollarInputs) {
    const match = testEngine.matchQuery(q);
    assert(match && match.isComplete, `Query "${q}" should match and complete`);
    // encodeURIComponent encodes $ as %24, preventing JS String.replace dollar substitution bugs
    assert(match.resolvedUrl.includes('%24'), `Dollar sign must be encoded as %24 in: ${match.resolvedUrl}`);
  }
  pass('Dollar signs ($1, $&, $$, etc.) safely encoded and do not corrupt template');
}

// 1.3 Null and non-string template inputs to interpolate
{
  const { interpolate } = quicklinksManager;
  assert.deepStrictEqual(interpolate(null, ['a']), { url: null, missing: [] });
  assert.deepStrictEqual(interpolate(undefined, ['a']), { url: undefined, missing: [] });
  assert.deepStrictEqual(interpolate('', ['a']), { url: '', missing: [] });
  assert.deepStrictEqual(interpolate('https://test.com/no-params', ['a', 'b']), { url: 'https://test.com/no-params', missing: [] });
  pass('interpolate handles null, undefined, empty, and placeholder-free templates');
}

// =====================================================================
// SUITE 2: PLACEHOLDER & ARGUMENT CARDINALITY MISMATCHES
// =====================================================================
console.log('\n--- SUITE 2: Argument Cardinality & Missing Arguments Stress ---');

// 2.1 Multi-placeholder template with missing arguments
{
  const testEngine = quicklinksManager.createEngine();
  // Template: https://github.com/{owner}/{repo}/pull/{number} (3 placeholders)

  // 1 argument provided
  const pr1 = testEngine.matchQuery('pr electron');
  assert(pr1, 'pr electron should match');
  assert.strictEqual(pr1.isComplete, false);
  assert.deepStrictEqual(pr1.missingParams, ['repo', 'number']);
  assert.strictEqual(pr1.resolvedUrl, 'https://github.com/electron/{repo}/pull/{number}');

  // 2 arguments provided
  const pr2 = testEngine.matchQuery('pr electron electron');
  assert.strictEqual(pr2.isComplete, false);
  assert.deepStrictEqual(pr2.missingParams, ['number']);
  assert.strictEqual(pr2.resolvedUrl, 'https://github.com/electron/electron/pull/{number}');

  // 3 arguments provided (complete)
  const pr3 = testEngine.matchQuery('pr electron electron 42');
  assert.strictEqual(pr3.isComplete, true);
  assert.deepStrictEqual(pr3.missingParams, []);
  assert.strictEqual(pr3.resolvedUrl, 'https://github.com/electron/electron/pull/42');

  // 0 arguments provided
  const pr0 = testEngine.matchQuery('pr');
  assert(pr0, 'pr with 0 args should match template');
  assert.strictEqual(pr0.isComplete, false);
  assert.deepStrictEqual(pr0.missingParams, ['owner', 'repo', 'number']);

  pass('Multi-placeholder template detects incomplete argument lists and tracks missingParams');
}

// 2.2 Surplus arguments (more arguments than placeholders)
{
  const testEngine = quicklinksManager.createEngine();
  // Template: https://github.com/{owner}/{repo}/pull/{number} (3 placeholders)
  const prExtra = testEngine.matchQuery('pr facebook react 1234 extraToken ignoredToken');
  assert(prExtra && prExtra.isComplete);
  assert.strictEqual(prExtra.resolvedUrl, 'https://github.com/facebook/react/pull/1234');
  assert.strictEqual(prExtra.args.length, 5);
  pass('Multi-placeholder template safely ignores extra arguments beyond placeholder count');
}

// 2.3 Single placeholder receiving multi-term query
{
  const testEngine = quicklinksManager.createEngine();
  const soMatch = testEngine.matchQuery('so how to parse json in js without eval');
  assert(soMatch && soMatch.isComplete);
  assert.strictEqual(soMatch.resolvedUrl, 'https://stackoverflow.com/search?q=how%20to%20parse%20json%20in%20js%20without%20eval');

  const jiraSingle = testEngine.matchQuery('jira PROJ-101');
  assert(jiraSingle && jiraSingle.isComplete);
  assert.strictEqual(jiraSingle.resolvedUrl, 'https://jira.company.com/browse/PROJ-101');

  // If jira receives multiple words, since jira has 1 placeholder, it joins them
  const jiraMulti = testEngine.matchQuery('jira PROJ 101');
  assert(jiraMulti && jiraMulti.isComplete);
  assert.strictEqual(jiraMulti.resolvedUrl, 'https://jira.company.com/browse/PROJ%20101');
  pass('Single placeholder joins multi-term arguments into a unified encoded string');
}

// 2.4 Blank / whitespace arguments in multi-placeholder templates
{
  const { interpolate } = quicklinksManager;
  const res = interpolate('https://example.com/{user}/{repo}', ['john', '   ']);
  assert.strictEqual(res.missing.length, 1);
  assert.strictEqual(res.missing[0], 'repo');
  assert.strictEqual(res.url, 'https://example.com/john/{repo}');
  pass('Whitespace-only arguments treated as missing parameter in interpolate');
}

// =====================================================================
// SUITE 3: QUERY PARSING, DELIMITERS, SPACES & COLONS
// =====================================================================
console.log('\n--- SUITE 3: Query Parsing, Normalization, Colons & Delimiters ---');

// 3.1 Empty queries, null, undefined, non-strings
{
  const testEngine = quicklinksManager.createEngine();
  assert.strictEqual(testEngine.matchQuery(''), null);
  assert.strictEqual(testEngine.matchQuery('   '), null);
  assert.strictEqual(testEngine.matchQuery(null), null);
  assert.strictEqual(testEngine.matchQuery(undefined), null);
  assert.strictEqual(testEngine.matchQuery(12345), null);
  assert.strictEqual(testEngine.matchQuery({}), null);
  pass('matchQuery returns null on empty, null, undefined, and non-string queries');
}

// 3.2 Leading and trailing spaces, irregular whitespace tabs and newlines
{
  const testEngine = quicklinksManager.createEngine();
  const q1 = testEngine.matchQuery('   jira   PROJ-555   ');
  assert(q1 && q1.isComplete);
  assert.strictEqual(q1.resolvedUrl, 'https://jira.company.com/browse/PROJ-555');

  const q2 = testEngine.matchQuery('\tjira\t\tPROJ-666\n');
  assert(q2 && q2.isComplete);
  assert.strictEqual(q2.resolvedUrl, 'https://jira.company.com/browse/PROJ-666');
  pass('Irregular whitespace, leading/trailing spaces, and tabs normalized cleanly');
}

// 3.3 Colons in query prefix (e.g. "jira: PROJ-123" vs "jira PROJ-123")
{
  const testEngine = quicklinksManager.createEngine();
  // Standard prefix is 'jira'
  const withColon = testEngine.matchQuery('jira: PROJ-123');
  // In quicklinks-manager, prefix is matched by exact token (parts[0].toLowerCase() === prefix)
  // Let's document whether "jira:" is matched or returns null
  if (!withColon) {
    recordFinding(
      'quicklinks-prefix',
      'low',
      'Quicklinks query with trailing colon "jira:" does not match template prefix "jira"',
      'Users typing "jira: PROJ-123" receive null because prefix token is "jira:" rather than "jira". Standard Raycast convention supports space separation "jira PROJ-123".',
      'quicklinksManager.matchQuery("jira: PROJ-123") === null'
    );
  } else {
    pass('Trailing colon in prefix handled');
  }

  // Prefix with leading colon
  const leadingColon = testEngine.matchQuery(':jira PROJ-123');
  assert.strictEqual(leadingColon, null, 'Leading colon prefix should not match');
  pass('Leading colon query correctly returns null');
}

// 3.4 Unknown templates and prefixes
{
  const testEngine = quicklinksManager.createEngine();
  assert.strictEqual(testEngine.matchQuery('unknown-service foo bar'), null);
  assert.strictEqual(testEngine.matchQuery('http://google.com'), null);
  assert.strictEqual(testEngine.matchQuery('!bang query'), null);
  pass('Unknown service prefixes safely return null');
}

// =====================================================================
// SUITE 4: DYNAMIC TEMPLATE LIFECYCLE & CRUD
// =====================================================================
console.log('\n--- SUITE 4: Dynamic Template Lifecycle & CRUD Stress ---');

// 4.1 Adding new custom template
{
  const testEngine = quicklinksManager.createEngine();
  const customTpl = {
    id: 'ql:custom-gitlab',
    name: 'GitLab Merge Request',
    prefix: 'mr',
    template: 'https://gitlab.com/{group}/{project}/-/merge_requests/{mr_id}',
    description: 'Custom GitLab MR Quicklink'
  };

  const added = testEngine.addTemplate(customTpl);
  assert.deepStrictEqual(added, customTpl);

  const match = testEngine.matchQuery('mr myorg backend 42');
  assert(match && match.isComplete);
  assert.strictEqual(match.resolvedUrl, 'https://gitlab.com/myorg/backend/-/merge_requests/42');
  pass('Add custom multi-parameter template and match query');
}

// 4.2 Updating existing template
{
  const testEngine = quicklinksManager.createEngine();
  const updatedTpl = {
    id: 'ql:custom-gitlab',
    name: 'GitLab Self-Hosted MR',
    prefix: 'mr',
    template: 'https://git.internal.net/{group}/{project}/-/merge_requests/{mr_id}',
    description: 'Updated internal URL'
  };

  testEngine.addTemplate(updatedTpl);
  const match = testEngine.matchQuery('mr core engine 99');
  assert(match && match.isComplete);
  assert.strictEqual(match.resolvedUrl, 'https://git.internal.net/core/engine/-/merge_requests/99');
  pass('Update existing custom template by ID updates interpolation target');
}

// 4.3 Deleting custom template
{
  const testEngine = quicklinksManager.createEngine();
  const deleted = testEngine.deleteTemplate('ql:custom-gitlab');
  assert.strictEqual(deleted, true);

  const matchAfterDelete = testEngine.matchQuery('mr core engine 99');
  assert.strictEqual(matchAfterDelete, null, 'Deleted template must no longer match queries');

  const deleteNonExistent = testEngine.deleteTemplate('non-existent-id-999');
  assert.strictEqual(deleteNonExistent, false, 'Deleting non-existent template returns false');
  pass('Delete custom template removes query matching capability');
}

// 4.4 Invalid / Malformed template additions
{
  const testEngine = quicklinksManager.createEngine();
  assert.strictEqual(testEngine.addTemplate(null), null);
  assert.strictEqual(testEngine.addTemplate({}), null);
  assert.strictEqual(testEngine.addTemplate({ id: 'ql:no-prefix' }), null);
  assert.strictEqual(testEngine.addTemplate({ prefix: 'foo' }), null);
  assert.strictEqual(testEngine.addTemplate({ id: 'ql:no-tpl', prefix: 'foo' }), null);
  pass('addTemplate rejects null, empty, and partial template descriptors safely');
}

// 4.5 Template with zero placeholders (static quicklink)
{
  const testEngine = quicklinksManager.createEngine();
  testEngine.addTemplate({
    id: 'ql:status',
    name: 'Status Page',
    prefix: 'status',
    template: 'https://status.cloud.com'
  });

  const match = testEngine.matchQuery('status');
  assert(match && match.isComplete);
  assert.strictEqual(match.resolvedUrl, 'https://status.cloud.com');
  testEngine.deleteTemplate('ql:status');
  pass('Static template with zero placeholders matches and resolves cleanly');
}

// =====================================================================
// SUITE 5: PARAMETERIZED QUICKLINKS PROVIDER FORMATTING & ACTIONS
// =====================================================================
console.log('\n--- SUITE 5: Quicklinks Provider Formatting & Action Payloads ---');

// 5.1 Provider registration and counts
{
  const reg = createRegistry({ userDataPath: sandboxDir });
  const providerList = reg.list();
  const qlRegistered = providerList.find((p) => p.id === 'quicklinks-param');
  assert(qlRegistered, 'quicklinks-param provider must be registered in registry');
  assert.strictEqual(qlRegistered.name, 'Parameterized Quicklinks');

  const counts = reg.counts();
  assert(counts['quicklinks-param'] >= 5, 'quicklinks-param all() should count at least 5 default templates');
  pass('quicklinks-param provider registered and counts all default templates');
  reg.dispose();
}

// 5.2 Provider search() complete vs incomplete formatting
{
  const reg = createRegistry({ userDataPath: sandboxDir });

  // Complete query
  const searchResults = await reg.search('jira DEVOPS-777');
  const cItem = searchResults.find((i) => i.id === 'ql:match:jira');
  assert(cItem, 'Search must find complete matched quicklink item');
  assert.strictEqual(cItem.title, 'Open Jira Issue: DEVOPS-777');
  assert.strictEqual(cItem.subtitle, 'https://jira.company.com/browse/DEVOPS-777');
  assert.strictEqual(cItem.scoreBoost, 260);
  assert.strictEqual(cItem.quicklinkData.resolvedUrl, 'https://jira.company.com/browse/DEVOPS-777');

  // Verify action execution via reg.execute
  const openRes = await reg.execute(cItem.id, 'open');
  assert.strictEqual(openRes.ok, true);
  assert.strictEqual(openRes.url, 'https://jira.company.com/browse/DEVOPS-777');

  const copyRes = await reg.execute(cItem.id, 'copy');
  assert.strictEqual(copyRes.ok, true);
  assert.strictEqual(copyRes.copied, 'https://jira.company.com/browse/DEVOPS-777');

  // Incomplete query
  const incResults = await reg.search('pr facebook');
  const iItem = incResults.find((i) => i.id === 'ql:match:pr');
  assert(iItem, 'Search must find incomplete matched quicklink item');
  assert(iItem.title.includes('[Missing repo, number]'));
  assert(iItem.subtitle.includes('Requires repo, number'));

  // Non-matching query
  const noMatch = await reg.search('nonexistent-prefix-xyz-12345');
  const qlNoMatch = noMatch.filter((i) => i.id.startsWith('ql:match:'));
  assert.deepStrictEqual(qlNoMatch, []);

  pass('quicklinks-param provider search() formats complete/incomplete items and executes actions safely');
  reg.dispose();
}

// =====================================================================
// SUITE 6: MEDIA HUD PROVIDER QUERY MATCHING & RESILIENCY
// =====================================================================
console.log('\n--- SUITE 6: Media HUD Provider Query Matching & Action Payloads ---');

// 6.1 Media keyword matching when session is inactive
{
  const reg = createRegistry({ userDataPath: sandboxDir });
  const providerList = reg.list();
  const mediaRegistered = providerList.find((p) => p.id === 'media');
  assert(mediaRegistered, 'media provider must be registered in registry');
  assert.strictEqual(mediaRegistered.name, 'Now Playing');

  const mediaKeywords = ['media', 'now playing', 'music', 'song', 'track', 'play', 'pause', 'next', 'prev', 'spotify'];
  for (const kw of mediaKeywords) {
    const results = await reg.search(kw);
    const mediaItem = results.find((i) => i.provider === 'media');
    assert(mediaItem, `Search for "${kw}" must find media item`);
    assert.strictEqual(mediaItem.group, 'Now Playing');
    assert(mediaItem.mediaData, 'Item must have mediaData');
  }

  // Non-media keyword on inactive session should not return media item
  const nonMedia = await reg.search('completely-unrelated-search-term-1234');
  const mediaUnrelated = nonMedia.find((i) => i.provider === 'media');
  assert.strictEqual(mediaUnrelated, undefined);
  pass('mediaHudProvider triggers on all media keywords and stays quiet on unrelated queries');
  reg.dispose();
}

// 6.2 Media HUD action payloads execution
{
  const reg = createRegistry({ userDataPath: sandboxDir });
  const results = await reg.search('media');
  const item = results.find((i) => i.provider === 'media');
  assert(item, 'Search must return media item');

  // Inactive session item has 'refresh' action
  if (item.id === 'media:no-session') {
    const refreshRes = await reg.execute(item.id, 'refresh');
    assert(refreshRes !== undefined);
  }

  // Test transport action runners directly on mediaHud module
  const ppRes = await mediaHud.playPause();
  assert(typeof ppRes === 'object');
  assert(typeof ppRes.ok === 'boolean');

  const nextRes = await mediaHud.nextTrack();
  assert(typeof nextRes === 'object');
  assert(typeof nextRes.ok === 'boolean');

  const prevRes = await mediaHud.prevTrack();
  assert(typeof prevRes === 'object');
  assert(typeof prevRes.ok === 'boolean');

  const volRes = mediaHud.setVolume(65);
  assert.strictEqual(volRes.volume, 65);

  const adjRes = mediaHud.adjustVolume(-15);
  assert.strictEqual(adjRes.volume, 50);

  pass('mediaHud transport actions (playpause, next, prev, volume) execute with shielded error handling');
  reg.dispose();
}

// 6.3 Media session parsing edge cases
{
  // Numeric titles or numbers as properties
  const numSession = mediaHud.parseSession({ Title: 1984, Artist: 2026, volume: '75' });
  assert.strictEqual(numSession.active, true);
  assert.strictEqual(numSession.title, 1984);
  assert.strictEqual(numSession.volume, 75);

  // Malformed JSON string
  const malformed = mediaHud.parseSession('{ malformed: json -- ');
  assert.strictEqual(malformed.active, false);
  assert.strictEqual(malformed.status, 'No media playing');

  // Empty object
  const emptyObj = mediaHud.parseSession({});
  assert.strictEqual(emptyObj.active, true);
  assert.strictEqual(emptyObj.title, 'Unknown Title');
  assert.strictEqual(emptyObj.artist, 'Unknown Artist');
  assert.strictEqual(emptyObj.album, 'Unknown Album');
  assert.strictEqual(emptyObj.volume, 50);

  pass('parseSession resilient against malformed JSON, numeric fields, and empty objects');
}

// =====================================================================
// SUITE 7: PREVIEW CARD GENERATION UNDER SPARSE & EXTREME PAYLOADS
// =====================================================================
console.log('\n--- SUITE 7: Preview Card Generation Under Sparse & Extreme Payloads ---');

// 7.1 Media preview card: standard payload
{
  const card = await getPreviewForItem({
    provider: 'media',
    group: 'Now Playing',
    title: 'Midnight City — M83',
    mediaData: {
      active: true,
      title: 'Midnight City',
      artist: 'M83',
      album: 'Hurry Up, We\'re Dreaming',
      status: 'Playing',
      app: 'Spotify.exe',
      volume: 85
    }
  });

  assert.strictEqual(card.type, 'media');
  assert.strictEqual(card.title, 'Midnight City');
  assert.strictEqual(card.artist, 'M83');
  assert.strictEqual(card.album, 'Hurry Up, We\'re Dreaming');
  assert.strictEqual(card.status, 'Playing');
  assert.strictEqual(card.app, 'Spotify.exe');
  assert.strictEqual(card.volume, 85);
  pass('Media preview card renders complete session attributes');
}

// 7.2 Media preview card: sparse / empty payload
{
  const sparseCard = await getPreviewForItem({
    provider: 'media',
    group: 'Now Playing'
  });

  assert.strictEqual(sparseCard.type, 'media');
  assert.strictEqual(sparseCard.title, 'Unknown Title');
  assert.strictEqual(sparseCard.artist, 'Unknown Artist');
  assert.strictEqual(sparseCard.album, 'Unknown Album');
  assert.strictEqual(sparseCard.status, 'Playing');
  assert.strictEqual(sparseCard.app, 'Media Player');
  assert.strictEqual(sparseCard.volume, 50);
  pass('Media preview card safely defaults sparse / missing properties');
}

// 7.3 Media preview card: boundary volume levels
{
  const zeroVol = await getPreviewForItem({
    provider: 'media',
    mediaData: { volume: 0 }
  });
  assert.strictEqual(zeroVol.volume, 0);

  const hundredVol = await getPreviewForItem({
    provider: 'media',
    mediaData: { volume: 100 }
  });
  assert.strictEqual(hundredVol.volume, 100);
  pass('Media preview card preserves 0% and 100% boundary volume levels');
}

// 7.4 Quicklink preview card: complete payload
{
  const card = await getPreviewForItem({
    provider: 'quicklinks-param',
    group: 'Quicklinks',
    title: 'Open Jira: ENG-101',
    quicklinkData: {
      name: 'Jira Issue',
      template: 'https://jira.company.com/browse/{ticket}',
      resolvedUrl: 'https://jira.company.com/browse/ENG-101',
      params: [{ key: 'param_1', val: 'ENG-101' }]
    }
  });

  assert.strictEqual(card.type, 'quicklink');
  assert.strictEqual(card.title, 'Open Jira: ENG-101');
  assert.strictEqual(card.templateName, 'Jira Issue');
  assert.strictEqual(card.templatePattern, 'https://jira.company.com/browse/{ticket}');
  assert.strictEqual(card.resolvedUrl, 'https://jira.company.com/browse/ENG-101');
  assert.strictEqual(card.url, 'https://jira.company.com/browse/ENG-101');
  assert.deepStrictEqual(card.params, [{ key: 'param_1', val: 'ENG-101' }]);
  pass('Quicklink preview card renders complete parameterized quicklink model');
}

// 7.5 Quicklink preview card: sparse / empty payload
{
  const sparseCard = await getPreviewForItem({
    provider: 'quicklinks-param'
  });

  assert.strictEqual(sparseCard.type, 'quicklink');
  assert.strictEqual(sparseCard.templatePattern, '');
  assert.strictEqual(sparseCard.resolvedUrl, '');
  assert.strictEqual(sparseCard.url, '');
  assert.deepStrictEqual(sparseCard.params, []);
  pass('Quicklink preview card safely defaults sparse / missing properties');
}

// 7.6 Quicklink preview card: GitHub shortcuts provider
{
  const ghCard = await getPreviewForItem({
    provider: 'github-shortcuts',
    group: 'GitHub / GitLab',
    title: 'GitHub PR: microsoft/vscode #99',
    targetUrl: 'https://github.com/microsoft/vscode/pull/99',
    platform: 'GitHub',
    query: 'gh pr microsoft/vscode 99'
  });

  assert.strictEqual(ghCard.type, 'quicklink');
  assert.strictEqual(ghCard.title, 'GitHub PR: microsoft/vscode #99');
  assert.strictEqual(ghCard.url, 'https://github.com/microsoft/vscode/pull/99');
  assert.strictEqual(ghCard.platform, 'GitHub');
  assert.strictEqual(ghCard.query, 'gh pr microsoft/vscode 99');
  pass('GitHub / GitLab shortcut preview card maps correctly to quicklink type');
}

// 7.7 Preview card for null or undefined item
{
  assert.strictEqual(await getPreviewForItem(null), null);
  assert.strictEqual(await getPreviewForItem(undefined), null);
  pass('getPreviewForItem gracefully returns null for null/undefined items');
}

// =====================================================================
// SUMMARY & REPORT
// =====================================================================
console.log('\n================================================================');
console.log(`🎉 STRESS SUITE FINISHED: ${passCount} TESTS PASSED!`);
console.log(`Findings logged: ${findings.length}`);
if (findings.length > 0) {
  console.log('\n--- FINDINGS SUMMARY ---');
  for (const f of findings) {
    console.log(`[${f.severity.toUpperCase()}] ${f.title} (${f.category})`);
    console.log(`  Detail: ${f.detail}`);
    console.log(`  Repro:  ${f.reproduction}`);
  }
}
console.log('================================================================\n');

try {
  fs.rmSync(sandboxDir, { recursive: true, force: true });
} catch {}

if (findings.some((f) => f.severity === 'critical' || f.severity === 'high')) {
  process.exit(1);
} else {
  process.exit(0);
}
