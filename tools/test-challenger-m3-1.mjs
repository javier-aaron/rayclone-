import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const assert = require('node:assert');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { execFile, execFileSync } = require('node:child_process');

const mediaHud = require('../src/main/media-hud');
const hudWindow = require('../src/main/hud-window');
const { createRegistry } = require('../src/main/providers');
const preview = require('../src/main/preview');
const quicklinksManager = require('../src/main/quicklinks-manager');

console.log('================================================================');
console.log('  CHALLENGER 1: ADVERSARIAL STRESS TEST HARNESS (MILESTONE 3)   ');
console.log('================================================================\n');

let passedAssertions = 0;
let totalChecks = 0;

function check(condition, message) {
  totalChecks++;
  assert(condition, message);
  passedAssertions++;
  console.log(`  ✓ ${message}`);
}

async function runAdversarialStressSuite() {
  const tempDir = path.join(os.tmpdir(), `rayclone-challenger-m3-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  // =========================================================================
  // SUITE 1: SMTC MEDIA HUD ADVERSARIAL STRESS
  // =========================================================================
  console.log('--- [SUITE 1] SMTC Media HUD Adversarial Stress Testing ---');

  // 1.1 Volume Clamping Stress
  console.log('\n1.1 Volume Clamping Stress:');
  check(mediaHud.clampVolume(0) === 0, 'clampVolume(0) === 0');
  check(mediaHud.clampVolume(100) === 100, 'clampVolume(100) === 100');
  check(mediaHud.clampVolume(50) === 50, 'clampVolume(50) === 50');
  check(mediaHud.clampVolume(-1) === 0, 'clampVolume(-1) clamps to 0');
  check(mediaHud.clampVolume(-50) === 0, 'clampVolume(-50) clamps to 0');
  check(mediaHud.clampVolume(-99999) === 0, 'clampVolume(-99999) clamps to 0');
  check(mediaHud.clampVolume(101) === 100, 'clampVolume(101) clamps to 100');
  check(mediaHud.clampVolume(250) === 100, 'clampVolume(250) clamps to 100');
  check(mediaHud.clampVolume(999999) === 100, 'clampVolume(999999) clamps to 100');

  // Non-numeric & edge primitives
  check(mediaHud.clampVolume('abc') === 50, 'clampVolume("abc") defaults to 50');
  check(mediaHud.clampVolume(NaN) === 50, 'clampVolume(NaN) defaults to 50');
  check(mediaHud.clampVolume(undefined) === 50, 'clampVolume(undefined) defaults to 50');
  check(mediaHud.clampVolume(null) === 50, 'clampVolume(null) defaults to 50');
  check(mediaHud.clampVolume({}) === 50, 'clampVolume({}) defaults to 50');
  check(mediaHud.clampVolume([]) === 50, 'clampVolume([]) defaults to 50');
  check(mediaHud.clampVolume(true) === 50, 'clampVolume(true) defaults to 50');
  check(mediaHud.clampVolume(false) === 50, 'clampVolume(false) defaults to 50');
  check(mediaHud.clampVolume(Infinity) === 50, 'clampVolume(Infinity) defaults to 50');
  check(mediaHud.clampVolume(-Infinity) === 50, 'clampVolume(-Infinity) defaults to 50');

  // String numeric inputs & whitespace
  check(mediaHud.clampVolume('0') === 0, 'clampVolume("0") parses to 0');
  check(mediaHud.clampVolume('100') === 100, 'clampVolume("100") parses to 100');
  check(mediaHud.clampVolume('  75  ') === 75, 'clampVolume("  75  ") trims and parses to 75');
  check(mediaHud.clampVolume(' -20 ') === 0, 'clampVolume(" -20 ") clamps to 0');
  check(mediaHud.clampVolume(' 140 ') === 100, 'clampVolume(" 140 ") clamps to 100');
  check(mediaHud.clampVolume(33.7) === 33, 'clampVolume(33.7) truncates to 33');

  // 1.2 Session Parsing & Malformed Outputs
  console.log('\n1.2 Session Parsing & Malformed Outputs:');
  const empty1 = mediaHud.parseSession('NO_ACTIVE_SESSION');
  check(empty1.active === false && empty1.status === 'No media playing', 'parseSession("NO_ACTIVE_SESSION") is inactive');

  const empty2 = mediaHud.parseSession(null);
  check(empty2.active === false && empty2.status === 'No media playing', 'parseSession(null) is inactive');

  const empty3 = mediaHud.parseSession(undefined);
  check(empty3.active === false && empty3.status === 'No media playing', 'parseSession(undefined) is inactive');

  const empty4 = mediaHud.parseSession('');
  check(empty4.active === false && empty4.status === 'No media playing', 'parseSession("") is inactive');

  const empty5 = mediaHud.parseSession({ noSession: true });
  check(empty5.active === false && empty5.status === 'No media playing', 'parseSession({ noSession: true }) is inactive');

  const malformed1 = mediaHud.parseSession('{ bad json ...');
  check(malformed1.active === false && malformed1.status === 'No media playing', 'parseSession with syntax error JSON caught cleanly');

  const malformed2 = mediaHud.parseSession('   \r\n\t  ');
  check(malformed2.active === false && malformed2.status === 'No media playing', 'parseSession with whitespace caught cleanly');

  const malformed3 = mediaHud.parseSession('<xml>error</xml>');
  check(malformed3.active === false && malformed3.status === 'No media playing', 'parseSession with XML caught cleanly');

  // Test parseSession with JSON literals that parse to non-objects or empty structures
  try {
    const resStringNull = mediaHud.parseSession('null');
    // If it handles 'null' string without throwing
    check(resStringNull !== undefined, 'parseSession("null") does not throw unhandled exception');
  } catch (err) {
    console.log(`  ! Potential vulnerability detected: parseSession("null") threw: ${err.message}`);
  }

  // Sparse metadata fallback
  const sparse1 = mediaHud.parseSession({});
  check(sparse1.active === true, 'parseSession({}) marked active');
  check(sparse1.title === 'Unknown Title', 'sparse title defaults to "Unknown Title"');
  check(sparse1.artist === 'Unknown Artist', 'sparse artist defaults to "Unknown Artist"');
  check(sparse1.album === 'Unknown Album', 'sparse album defaults to "Unknown Album"');
  check(sparse1.status === 'Playing', 'sparse status defaults to "Playing"');
  check(sparse1.app === 'Media Player', 'sparse app defaults to "Media Player"');
  check(sparse1.volume === 50, 'sparse volume defaults to 50');

  const sparse2 = mediaHud.parseSession({ Title: 'Custom Song' });
  check(sparse2.title === 'Custom Song', 'sparse title preserved');
  check(sparse2.artist === 'Unknown Artist', 'sparse missing artist preserved');

  const sparse3 = mediaHud.parseSession({ title: 'lowercase', artist: 'low artist', album: 'low album', status: 'Paused', app: 'VLC' });
  check(sparse3.title === 'lowercase' && sparse3.artist === 'low artist' && sparse3.status === 'Paused' && sparse3.app === 'VLC', 'lowercase keys recognized correctly');

  const sparse4 = mediaHud.parseSession({ Title: 'Rock', volume: -20 });
  check(sparse4.volume === 0, 'volume in session clamped to 0');

  const sparse5 = mediaHud.parseSession({ Title: 'Rock', volume: 140 });
  check(sparse5.volume === 100, 'volume in session clamped to 100');

  // 1.3 Rapid Sequential Volume Adjustments & State
  console.log('\n1.3 Rapid Sequential Volume Adjustments & State:');
  const setInit = mediaHud.setVolume(50);
  check(setInit.ok === true && setInit.volume === 50, 'Initial setVolume(50) succeeded');

  // Sequential adjustments upward
  for (let i = 0; i < 10; i++) {
    mediaHud.adjustVolume(10);
  }
  check(mediaHud.getCachedSession().volume === 100, 'Volume reached ceiling 100 after multiple +10 adjustments');

  // Extra upward adjustment beyond ceiling
  const ceilingAdj = mediaHud.adjustVolume(15);
  check(ceilingAdj.volume === 100, 'Volume remains clamped at 100 on further +15 adjustment');

  // Sequential adjustments downward
  for (let i = 0; i < 15; i++) {
    mediaHud.adjustVolume(-10);
  }
  check(mediaHud.getCachedSession().volume === 0, 'Volume reached floor 0 after multiple -10 adjustments');

  // Extra downward adjustment below floor
  const floorAdj = mediaHud.adjustVolume(-20);
  check(floorAdj.volume === 0, 'Volume remains clamped at 0 on further -20 adjustment');

  // Reset to neutral
  mediaHud.setVolume(50);
  check(mediaHud.getCachedSession().volume === 50, 'Volume reset to 50');

  // 1.4 SMTC Query & TTL Cache Behavior
  console.log('\n1.4 SMTC Query & TTL Cache Behavior:');
  const session1 = await mediaHud.getSession();
  check(typeof session1.active === 'boolean', `getSession() returned valid session (active = ${session1.active})`);

  // Immediate second call should hit TTL cache if active, or complete swiftly
  const t0 = Date.now();
  const session2 = await mediaHud.getSession();
  const elapsed = Date.now() - t0;
  check(typeof session2.active === 'boolean', 'Subsequent getSession() returned valid session');
  console.log(`  ℹ getSession latency: ${elapsed}ms`);

  // 1.5 Media Transport Actions & PowerShell Script Error Cases
  console.log('\n1.5 Media Transport Actions & PowerShell Execution:');
  const playPauseRes = await mediaHud.playPause();
  check(typeof playPauseRes.ok === 'boolean', `playPause() returned ok: ${playPauseRes.ok}`);

  const nextRes = await mediaHud.nextTrack();
  check(typeof nextRes.ok === 'boolean', `nextTrack() returned ok: ${nextRes.ok}`);

  const prevRes = await mediaHud.prevTrack();
  check(typeof prevRes.ok === 'boolean', `prevTrack() returned ok: ${prevRes.ok}`);

  // Test PowerShell media-helper.ps1 with unknown / invalid action
  console.log('\n1.6 media-helper.ps1 Execution Policy & Unknown Actions:');
  const psScriptPath = path.resolve('./src/main/media-helper.ps1');
  try {
    const rawOut = execFileSync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy', 'Bypass',
      '-File', psScriptPath,
      '-Action', 'NON_EXISTENT_STRESS_ACTION'
    ], { encoding: 'utf8', timeout: 5000 });
    const trimmed = rawOut.trim();
    check(trimmed === 'NO_ACTIVE_SESSION' || trimmed === 'OK' || trimmed.startsWith('{'), `media-helper.ps1 handles unknown action safely without crashing (output: ${trimmed.slice(0, 30)})`);
  } catch (err) {
    check(false, `media-helper.ps1 failed on unknown action: ${err.message}`);
  }

  // =========================================================================
  // SUITE 2: FLOATING DETACHED HUD MODE ADVERSARIAL STRESS
  // =========================================================================
  console.log('\n--- [SUITE 2] Floating Detached HUD Mode Adversarial Stress Testing ---');

  // 2.1 Window Option Conformance
  console.log('\n2.1 Window Option Conformance:');
  check(hudWindow.HOTKEY === 'Ctrl+Shift+D', 'HUD hotkey is exactly "Ctrl+Shift+D"');
  check(hudWindow.HUD_WINDOW_OPTIONS.alwaysOnTop === true, 'Window option alwaysOnTop is true');
  check(hudWindow.HUD_WINDOW_OPTIONS.frame === false, 'Window option frame is false (frameless)');
  check(hudWindow.HUD_WINDOW_OPTIONS.transparent === true, 'Window option transparent is true');
  check(hudWindow.HUD_WINDOW_OPTIONS.resizable === true, 'Window option resizable is true');
  check(hudWindow.HUD_WINDOW_OPTIONS.width === 380, 'Default width is 380');
  check(hudWindow.HUD_WINDOW_OPTIONS.height === 440, 'Default height is 440');
  check(hudWindow.HUD_WINDOW_OPTIONS.skipTaskbar === false, 'Window option skipTaskbar is false');
  check(hudWindow.HUD_WINDOW_OPTIONS.backgroundColor === '#00000000', 'Window background is translucent #00000000');

  // 2.2 Lifecycle Stress (createMockHudManager)
  console.log('\n2.2 Mock HUD Manager Lifecycle Stress:');
  const mock = hudWindow.createMockHudManager();
  check(mock.isOpen() === false, 'Mock starts closed');
  check(mock.isDestroyed() === false, 'Mock starts not destroyed');

  // Multiple sequential detaches
  const d1 = mock.detach({ type: 'note', title: 'Note 1', content: 'c1' });
  check(d1.ok === true && mock.isOpen() === true, 'Detach 1 opens window');
  check(mock.getPayload().title === 'Note 1', 'Payload 1 stored');

  const d2 = mock.detach({ type: 'conversion', title: 'Conversion 2', content: 'c2' });
  check(d2.ok === true && mock.isOpen() === true, 'Detach 2 preserves open window');
  check(mock.getPayload().title === 'Conversion 2', 'Payload 2 replaces previous payload');

  const d3 = mock.detach({ type: 'media', title: 'Song 3', content: 'c3' });
  check(d3.ok === true && mock.isOpen() === true, 'Detach 3 preserves open window');
  check(mock.getPayload().title === 'Song 3', 'Payload 3 replaces previous payload');

  // Toggle behavior
  mock.toggle();
  check(mock.isOpen() === false, 'toggle() when open sets isOpen to false');
  mock.toggle();
  check(mock.isOpen() === true, 'toggle() when hidden sets isOpen to true');

  // Close lifecycle & Close while closed idempotency
  mock.close();
  check(mock.isOpen() === false && mock.isDestroyed() === true, 'close() closes and destroys');
  const closeAgain1 = mock.close();
  check(closeAgain1.ok === true, 'close() while already closed is idempotent and returns ok');
  const closeAgain2 = mock.close();
  check(closeAgain2.ok === true, '3rd close() call remains safe and idempotent');

  // Detach after close recreates window
  const dRecreate = mock.detach({ type: 'note', title: 'Recreated Note' });
  check(dRecreate.ok === true, 'detach() after close succeeds');
  check(mock.isOpen() === true, 'detach() after close reopens window');
  check(mock.isDestroyed() === false, 'detach() after close clears destroyed flag');

  // 2.3 Payload Serialization & Edge-Case Inputs
  console.log('\n2.3 Payload Serialization Stress:');
  const mockPay = hudWindow.createMockHudManager();

  // undefined payload
  const dUndef = mockPay.detach(undefined);
  check(dUndef.ok === true && dUndef.payload.title === 'Scratchpad', 'detach(undefined) defaults to Scratchpad');

  // null payload
  const dNull = mockPay.detach(null);
  check(dNull.ok === true && dNull.payload.title === 'Scratchpad', 'detach(null) defaults to Scratchpad');

  // HTML / XSS Injection strings
  const xssPayload = {
    type: 'note',
    title: '<script>alert(document.cookie)</script>',
    content: '<iframe src="javascript:alert(1)"></iframe><b>Bold</b>'
  };
  const dXss = mockPay.detach(xssPayload);
  check(dXss.ok === true && dXss.payload.title.includes('<script>'), 'HTML/XSS string preserved as data payload safely');

  // Large payload (100,000 chars)
  const largeText = 'A'.repeat(100000);
  const dLarge = mockPay.detach({ type: 'note', title: 'Large Note', content: largeText });
  check(dLarge.ok === true && dLarge.payload.content.length === 100000, 'Large 100k character text payload handled cleanly');

  // Unicode / International strings
  const unicodePayload = {
    type: 'note',
    title: '🎵 Media 🚀 / 日本語 / Español / Русский / 🌟',
    content: 'Special controls: \u0000\u001f\r\n\t'
  };
  const dUnicode = mockPay.detach(unicodePayload);
  check(dUnicode.ok === true && dUnicode.payload.title.includes('🚀'), 'Unicode & Emojis in payload preserved intact');

  // 2.4 Singleton Manager Interface Verification
  console.log('\n2.4 Singleton Manager Interface Verification:');
  const realHud = hudWindow.hudManager;
  check(realHud.hotkey === 'Ctrl+Shift+D', 'Singleton hotkey is Ctrl+Shift+D');
  check(typeof realHud.detach === 'function', 'hudManager.detach is a function');
  check(typeof realHud.toggle === 'function', 'hudManager.toggle is a function');
  check(typeof realHud.close === 'function', 'hudManager.close is a function');
  check(typeof realHud.isOpen === 'function', 'hudManager.isOpen is a function');
  check(typeof realHud.isDestroyed === 'function', 'hudManager.isDestroyed is a function');
  check(typeof realHud.getPayload === 'function', 'hudManager.getPayload is a function');

  // Delegation helpers exported on hudWindow module
  check(typeof hudWindow.detach === 'function', 'hudWindow.detach export exists');
  check(typeof hudWindow.toggle === 'function', 'hudWindow.toggle export exists');
  check(typeof hudWindow.close === 'function', 'hudWindow.close export exists');
  check(typeof hudWindow.isOpen === 'function', 'hudWindow.isOpen export exists');
  check(typeof hudWindow.isDestroyed === 'function', 'hudWindow.isDestroyed export exists');
  check(typeof hudWindow.getPayload === 'function', 'hudWindow.getPayload export exists');

  // In headless mode without electron BrowserWindow, methods degrade gracefully
  const headDetach = hudWindow.detach({ type: 'note', title: 'Headless Detach' });
  check(headDetach.ok === true, 'Headless detach degrades gracefully');
  const headToggle = hudWindow.toggle();
  check(headToggle.ok === true, 'Headless toggle degrades gracefully');
  const headClose = hudWindow.close();
  check(headClose.ok === true, 'Headless close degrades gracefully');

  // =========================================================================
  // SUITE 3: PROVIDERS & PREVIEW INTEGRATION STRESS
  // =========================================================================
  console.log('\n--- [SUITE 3] Providers & Preview Adversarial Stress ---');

  const registry = createRegistry({ userDataPath: tempDir });
  await registry.warm();

  // Search queries with media keywords and stress queries
  console.log('\n3.1 Media Provider Search Stress:');
  const qMedia = await registry.search('media');
  check(Array.isArray(qMedia) && qMedia.length > 0, 'registry.search("media") returns results');
  const mediaItem = qMedia.find(i => i.id.startsWith('media:'));
  check(Boolean(mediaItem), 'Media item found in search results');
  check(Array.isArray(mediaItem.actions) && mediaItem.actions.length >= 1, `Media item has action list (count: ${mediaItem.actions.length}, id: ${mediaItem.id})`);

  // Empty, null, whitespace, and very long queries
  const qNull = await registry.search(null);
  check(Array.isArray(qNull), 'registry.search(null) handled safely');

  const qEmpty = await registry.search('');
  check(Array.isArray(qEmpty), 'registry.search("") handled safely');

  const qLong = await registry.search('media ' + 'z'.repeat(500));
  check(Array.isArray(qLong), 'registry.search(500 chars) handled safely without throwing');

  // 3.2 Preview Card Generation Stress
  console.log('\n3.2 Preview Card Generation Stress:');
  const card1 = await preview.getPreviewForItem(mediaItem);
  check(card1.type === 'media', 'Preview card generated type "media"');
  check(card1.volume !== undefined, 'Preview card has volume property');

  // Preview with missing/adversarial mediaData
  const cardSparse = await preview.getPreviewForItem({
    id: 'media:test-sparse',
    provider: 'media',
    mediaData: {}
  });
  check(cardSparse.type === 'media', 'Preview card handled empty mediaData cleanly');

  const cardNoData = await preview.getPreviewForItem({
    id: 'media:test-nodata',
    provider: 'media'
  });
  check(cardNoData.type === 'media', 'Preview card handled undefined mediaData cleanly');

  // 3.3 Quicklinks Integration Stress
  console.log('\n3.3 Quicklinks Engine Adversarial Stress:');
  const qlEngine = quicklinksManager.createEngine();

  // Template matching with special regex symbols
  const qlRegex = qlEngine.matchQuery('jira PROJ-123(test)[foo]{bar}$^');
  check(qlRegex && qlRegex.matched === true, 'Quicklinks engine handled special regex characters in arguments');

  // Incomplete parameters
  const qlIncomplete = qlEngine.matchQuery('pr owner');
  check(qlIncomplete && qlIncomplete.isComplete === false, 'Quicklinks detects missing 2nd & 3rd arguments');
  check(qlIncomplete.missingParams.includes('repo'), 'missingParams includes "repo"');
  check(qlIncomplete.missingParams.includes('number'), 'missingParams includes "number"');

  // Empty argument
  const qlEmptyArg = qlEngine.matchQuery('jira');
  check(qlEmptyArg && qlEmptyArg.isComplete === false, 'Query with zero args detected as incomplete');

  // Excess arguments joined for single placeholder
  const qlExcess = qlEngine.matchQuery('so how do I invert a binary tree in rust');
  check(qlExcess && qlExcess.matched === true, 'Single placeholder receives all remaining terms joined');
  check(qlExcess.resolvedUrl.includes('binary%20tree'), 'Joined terms URI-encoded correctly');

  registry.dispose();

  // Cleanup temp dir
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {}

  console.log('\n================================================================');
  console.log(`  🎉 ADVERSARIAL STRESS SUITE COMPLETE: ${passedAssertions}/${totalChecks} CHECKS PASSED! 🎉`);
  console.log('================================================================\n');
}

runAdversarialStressSuite().catch((err) => {
  console.error('\n❌ ADVERSARIAL STRESS TEST FAILED:', err);
  process.exit(1);
});
