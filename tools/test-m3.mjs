// tools/test-m3.mjs
// Dedicated M3 Unit & Edge-Case Verification Suite

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const assert = require('node:assert');
const path = require('node:path');

const mediaHud = require('../src/main/media-hud');
const hudWindow = require('../src/main/hud-window');
const quicklinksManager = require('../src/main/quicklinks-manager');
const { createRegistry } = require('../src/main/providers');
const preview = require('../src/main/preview');
const store = require('../src/main/store');

console.log('=== Running Dedicated M3 Verification Suite ===\n');

async function runM3Tests() {
  // 1. SMTC Media HUD Tests
  console.log('1. Testing src/main/media-hud.js...');
  assert.strictEqual(mediaHud.clampVolume(0), 0);
  assert.strictEqual(mediaHud.clampVolume(100), 100);
  assert.strictEqual(mediaHud.clampVolume(-20), 0);
  assert.strictEqual(mediaHud.clampVolume(140), 100);
  assert.strictEqual(mediaHud.clampVolume('invalid'), 50);
  assert.strictEqual(mediaHud.clampVolume(75), 75);
  console.log('  ✓ clampVolume passed all edge cases');

  const s1 = mediaHud.parseSession('NO_ACTIVE_SESSION');
  assert.strictEqual(s1.active, false);
  assert.strictEqual(s1.status, 'No media playing');

  const s2 = mediaHud.parseSession(null);
  assert.strictEqual(s2.active, false);

  const sNullStr = mediaHud.parseSession('null');
  assert.strictEqual(sNullStr.active, false);
  assert.strictEqual(sNullStr.status, 'No media playing');

  const sEmptyObj = mediaHud.parseSession('{}');
  assert.strictEqual(sEmptyObj.active, true);
  assert.strictEqual(sEmptyObj.title, 'Unknown Title');

  const sNumber = mediaHud.parseSession(42);
  assert.strictEqual(sNumber.active, false);

  const s3 = mediaHud.parseSession({
    Title: 'Starboy',
    Artist: 'The Weeknd',
    AlbumTitle: 'Starboy',
    PlaybackStatus: 'Playing',
    SourceAppUserModelId: 'Spotify.exe',
    volume: 80
  });
  assert.strictEqual(s3.active, true);
  assert.strictEqual(s3.title, 'Starboy');
  assert.strictEqual(s3.artist, 'The Weeknd');
  assert.strictEqual(s3.album, 'Starboy');
  assert.strictEqual(s3.status, 'Playing');
  assert.strictEqual(s3.app, 'Spotify.exe');
  assert.strictEqual(s3.volume, 80);

  const s4 = mediaHud.parseSession({ Title: 'Podcast #1' });
  assert.strictEqual(s4.active, true);
  assert.strictEqual(s4.artist, 'Unknown Artist');
  assert.strictEqual(s4.album, 'Unknown Album');
  assert.strictEqual(s4.volume, 50);
  console.log('  ✓ parseSession passed all edge cases (including "null" string)');

  const liveSession = await mediaHud.getSession();
  assert(liveSession && typeof liveSession.active === 'boolean');
  console.log('  ✓ getSession executed cleanly (active = ' + liveSession.active + ')');

  // Benchmark asserting repeated mediaHud.getSession() resolves in < 20ms when cached
  const t0 = performance.now();
  const cachedSess = await mediaHud.getSession();
  const t1 = performance.now();
  const durationMs = t1 - t0;
  assert(durationMs < 20, `Repeated getSession() should resolve in < 20ms when cached (took ${durationMs.toFixed(2)}ms)`);
  assert(cachedSess && typeof cachedSess.active === 'boolean');
  console.log(`  ✓ getSession() cache benchmark passed: ${durationMs.toFixed(2)}ms (< 20ms threshold)`);

  // Transport action execution assertions
  const actionRes = await mediaHud.runAction('playpause');
  assert.strictEqual(actionRes.ok, true);
  assert(actionRes.output.includes('OK'), 'media-helper.ps1 should output OK on playpause');
  console.log('  ✓ runAction("playpause") returned OK with exit code 0');

  const playPauseRes = await mediaHud.playPause();
  assert.strictEqual(playPauseRes.ok, true);
  console.log('  ✓ playPause() passed');

  const nextRes = await mediaHud.nextTrack();
  assert.strictEqual(nextRes.ok, true);
  console.log('  ✓ nextTrack() passed');

  const prevRes = await mediaHud.prevTrack();
  assert.strictEqual(prevRes.ok, true);
  console.log('  ✓ prevTrack() passed');

  const volRes = mediaHud.setVolume(60);
  assert.strictEqual(volRes.volume, 60);
  const adjRes = mediaHud.adjustVolume(10);
  assert.strictEqual(adjRes.volume, 70);
  console.log('  ✓ setVolume & adjustVolume passed');

  // 2. HUD Window Tests
  console.log('\n2. Testing src/main/hud-window.js...');
  const mockHud = hudWindow.createMockHudManager();
  assert.strictEqual(mockHud.hotkey, 'Ctrl+Shift+D');
  assert.strictEqual(mockHud.windowOptions.frame, false);
  assert.strictEqual(mockHud.windowOptions.transparent, true);
  assert.strictEqual(mockHud.windowOptions.alwaysOnTop, true);
  assert.strictEqual(mockHud.windowOptions.resizable, true);

  const detachNote = mockHud.detach({ type: 'note', title: 'Test Note', content: 'hello' });
  assert.strictEqual(detachNote.ok, true);
  assert.strictEqual(mockHud.isOpen(), true);
  assert.strictEqual(mockHud.getPayload().title, 'Test Note');

  mockHud.toggle();
  assert.strictEqual(mockHud.isOpen(), false);
  mockHud.toggle();
  assert.strictEqual(mockHud.isOpen(), true);

  mockHud.close();
  assert.strictEqual(mockHud.isOpen(), false);
  assert.strictEqual(mockHud.isDestroyed(), true);
  console.log('  ✓ createMockHudManager passed all lifecycle tests');

  // Singleton manager interface tests
  const realHud = hudWindow.hudManager;
  assert(realHud && realHud.hotkey === 'Ctrl+Shift+D');
  assert(typeof realHud.detach === 'function');
  assert(typeof realHud.toggle === 'function');
  assert(typeof realHud.close === 'function');
  console.log('  ✓ hudManager singleton interface verified');

  // 3. Parameterized Quicklinks Tests
  console.log('\n3. Testing src/main/quicklinks-manager.js...');
  const engine = quicklinksManager.createEngine();
  const jiraMatch = engine.matchQuery('jira PROJ-999');
  assert(jiraMatch && jiraMatch.matched === true);
  assert.strictEqual(jiraMatch.resolvedUrl, 'https://jira.company.com/browse/PROJ-999');
  assert.strictEqual(jiraMatch.isComplete, true);

  const prMatch = engine.matchQuery('pr owner repo 42');
  assert(prMatch && prMatch.matched === true);
  assert.strictEqual(prMatch.resolvedUrl, 'https://github.com/owner/repo/pull/42');
  assert.strictEqual(prMatch.isComplete, true);

  const soSpecial = engine.matchQuery('so C++ & Rust');
  assert(soSpecial && soSpecial.resolvedUrl.includes('C%2B%2B') && soSpecial.resolvedUrl.includes('%26'));

  const jiraMissing = engine.matchQuery('jira');
  assert(jiraMissing && jiraMissing.isComplete === false);
  assert(jiraMissing.missingParams.includes('ticket'));

  assert.strictEqual(engine.matchQuery('unregistered-prefix xyz'), null);

  engine.addTemplate({ id: 'ql:test', prefix: 'testlink', template: 'https://test.com/{foo}' });
  const testMatch = engine.matchQuery('testlink bar');
  assert(testMatch && testMatch.resolvedUrl === 'https://test.com/bar');
  engine.deleteTemplate('ql:test');
  assert.strictEqual(engine.matchQuery('testlink bar'), null);
  console.log('  ✓ quicklinks-manager passed all matching and interpolation tests');

  // 4. Registry and Preview Integration Tests
  console.log('\n4. Testing Providers & Preview Integration...');
  const testDir = path.resolve('./.cache/test-verify-m3-' + Date.now());
  const reg = createRegistry({ userDataPath: testDir });

  // Test Quicklinks in Search
  const qlSearchResults = await reg.search('jira PROJ-888');
  const qlItem = qlSearchResults.find((i) => i.id.startsWith('ql:match:jira'));
  assert(qlItem, 'Search should find parameterized quicklink for jira');
  assert(qlItem.subtitle.includes('PROJ-888'));

  const qlPreview = await preview.getPreviewForItem(qlItem);
  assert.strictEqual(qlPreview.type, 'quicklink');
  assert.strictEqual(qlPreview.resolvedUrl, 'https://jira.company.com/browse/PROJ-888');
  console.log('  ✓ Quicklink search item & preview card verified');

  // Test Media HUD in Search
  const mediaSearchResults = await reg.search('media');
  assert(Array.isArray(mediaSearchResults) && mediaSearchResults.length > 0);
  const mediaItem = mediaSearchResults.find((i) => i.id.startsWith('media:'));
  assert(mediaItem, 'Search should find media item');
  const mediaPreview = await preview.getPreviewForItem(mediaItem);
  assert.strictEqual(mediaPreview.type, 'media');
  assert(typeof mediaPreview.volume === 'number');
  console.log('  ✓ Media search item & preview card verified');

  reg.dispose();
  console.log('\n🎉 ALL DEDICATED M3 UNIT & INTEGRATION TESTS PASSED! 🎉\n');
}

runM3Tests().catch((err) => {
  console.error('\n❌ M3 Test failure:', err);
  process.exit(1);
});
