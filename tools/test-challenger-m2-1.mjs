import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const assert = require('node:assert');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

const audioManager = require('../src/main/audio-manager');
const servicesManager = require('../src/main/services-manager');
const { createRegistry } = require('../src/main/providers');
const { getPreviewForItem } = require('../src/main/preview');

console.log('================================================================');
console.log('  CHALLENGER 1: ADVERSARIAL STRESS TEST HARNESS (MILESTONE 2)   ');
console.log('================================================================\n');

let passedAssertions = 0;
function check(condition, message) {
  assert(condition, message);
  passedAssertions++;
  console.log(`  ✓ ${message}`);
}

async function runAdversarialSuite() {
  const tempDir = path.join(os.tmpdir(), `rayclone-challenger-m2-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  const registry = createRegistry({ userDataPath: tempDir });
  await registry.warm();

  // =========================================================================
  // SUITE 1: AUDIO SWITCHER ADVERSARIAL STRESS
  // =========================================================================
  console.log('\n--- [SUITE 1] Audio Switcher Stress Testing ---');

  // 1.1 Malformed JSON & Corrupt Inputs to parseEndpoints
  console.log('\n1.1 Testing parseEndpoints with adversarial / corrupt inputs:');
  const resNull = audioManager.parseEndpoints(null);
  check(Array.isArray(resNull.playback) && resNull.playback.length === 0, 'parseEndpoints(null) returns empty playback');
  check(Array.isArray(resNull.recording) && resNull.recording.length === 0, 'parseEndpoints(null) returns empty recording');

  const resUndefined = audioManager.parseEndpoints(undefined);
  check(resUndefined.playback.length === 0 && resUndefined.recording.length === 0, 'parseEndpoints(undefined) returns empty arrays');

  const resEmptyStr = audioManager.parseEndpoints('');
  check(resEmptyStr.playback.length === 0 && resEmptyStr.recording.length === 0, 'parseEndpoints("") returns empty arrays');

  const resWhitespace = audioManager.parseEndpoints('   \r\n\t  ');
  check(resWhitespace.playback.length === 0 && resWhitespace.recording.length === 0, 'parseEndpoints whitespace returns empty arrays');

  const resBadJson = audioManager.parseEndpoints('{ "Playback": [invalid_json ...');
  check(resBadJson.playback.length === 0 && resBadJson.recording.length === 0, 'parseEndpoints malformed JSON caught cleanly');

  const resScalar = audioManager.parseEndpoints(98765);
  check(resScalar.playback.length === 0 && resScalar.recording.length === 0, 'parseEndpoints numeric primitive handled safely');

  const resEmptyObj = audioManager.parseEndpoints({});
  check(resEmptyObj.playback.length === 0 && resEmptyObj.recording.length === 0, 'parseEndpoints({}) returns empty arrays');

  // Corrupt array elements in Playback / Recording
  const corruptOutput = {
    Playback: [
      null,
      undefined,
      '',
      'no-pipe-delimiter',
      '{dev-1}|Realtek Audio|1|render',
      '{dev-2}|Defective Monitor|0|playback',
      'id_without_name|'
    ],
    Recording: [
      '{mic-1}|Blue Yeti USB Mic|1|capture',
      12345, // invalid type
      '{mic-2}|Webcam Mic|0|recording'
    ]
  };
  const parsedCorrupt = audioManager.parseEndpoints(corruptOutput);
  check(parsedCorrupt.playback.length === 3, 'Filtered out nulls, non-pipe strings, leaving 3 valid playback items');
  check(parsedCorrupt.playback[0].name === 'Realtek Audio' && parsedCorrupt.playback[0].isDefault === true, 'Playback item 0 parsed accurately');
  check(parsedCorrupt.playback[0].type === 'Playback', 'Normalized render to Playback');
  check(parsedCorrupt.recording.length === 2, 'Filtered invalid numbers, leaving 2 valid recording items');
  check(parsedCorrupt.recording[0].type === 'Recording', 'Normalized capture to Recording');

  // 1.2 Non-Existent Device IDs & Input Boundaries
  console.log('\n1.2 Testing setDefaultDevice with non-existent IDs and edge cases:');
  const badIdRes = await audioManager.setDefaultDevice('non-existent-device-guid-00000000');
  check(badIdRes.ok === false, 'setDefaultDevice on non-existent ID returns ok: false');
  check(badIdRes.error.includes('not found'), 'Returns descriptive error: "Audio device not found"');

  const nullIdRes = await audioManager.setDefaultDevice(null);
  check(nullIdRes.ok === false, 'setDefaultDevice(null) returns ok: false without exception');

  const emptyIdRes = await audioManager.setDefaultDevice('');
  check(emptyIdRes.ok === false, 'setDefaultDevice("") returns ok: false without exception');

  // 1.3 Isolated Default Device Switching and In-Memory Updates
  console.log('\n1.3 Testing default device toggle isolation (Playback vs Recording):');
  const customDevList = [
    { id: 'spk-1', name: 'Speakers A', isDefault: true, type: 'Playback' },
    { id: 'spk-2', name: 'Speakers B', isDefault: false, type: 'Playback' },
    { id: 'mic-1', name: 'Microphone A', isDefault: true, type: 'Recording' },
    { id: 'mic-2', name: 'Microphone B', isDefault: false, type: 'Recording' }
  ];

  // Switch playback to spk-2
  const switchRes = await audioManager.setDefaultDevice('spk-2', customDevList);
  check(switchRes.ok === true && switchRes.deviceId === 'spk-2', 'setDefaultDevice with custom devList succeeds');
  const spk1 = customDevList.find(d => d.id === 'spk-1');
  const spk2 = customDevList.find(d => d.id === 'spk-2');
  const mic1 = customDevList.find(d => d.id === 'mic-1');
  const mic2 = customDevList.find(d => d.id === 'mic-2');

  check(spk2.isDefault === true, 'Target playback device is now default');
  check(spk1.isDefault === false, 'Previous playback device is no longer default');
  check(mic1.isDefault === true, 'Recording device default status is NOT altered by playback switch');
  check(mic2.isDefault === false, 'Recording device default status remained untouched');

  // 1.4 Headless Fallback Invariance
  console.log('\n1.4 Testing Headless Fallback structure and resilience:');
  check(Array.isArray(audioManager.HEADLESS_FALLBACK.playback) && audioManager.HEADLESS_FALLBACK.playback.length >= 2, 'HEADLESS_FALLBACK has >= 2 playback devices');
  check(Array.isArray(audioManager.HEADLESS_FALLBACK.recording) && audioManager.HEADLESS_FALLBACK.recording.length >= 1, 'HEADLESS_FALLBACK has >= 1 recording device');
  check(audioManager.HEADLESS_FALLBACK.playback.some(d => d.isDefault === true), 'HEADLESS_FALLBACK has default playback device');
  check(audioManager.HEADLESS_FALLBACK.recording.some(d => d.isDefault === true), 'HEADLESS_FALLBACK has default recording device');

  // 1.5 Provider Search & Preview Adversarial Queries
  console.log('\n1.5 Testing Audio Switcher Provider with search queries:');
  const qAudioPlain = (await registry.search('audio')).filter(i => i.provider === 'audio');
  check(qAudioPlain.length > 0, 'search("audio") returns audio provider items');

  const qAudioNonExistent = (await registry.search('audio xyz_nonexistent_audio_device_12345')).filter(i => i.provider === 'audio');
  check(Array.isArray(qAudioNonExistent) && qAudioNonExistent.length === 0, 'search for non-existent device returns 0 audio provider matches');

  // Empirical edge case probe: prefix with colon "audio:" vs plain "audio"
  const qAudioColon = (await registry.search('audio:')).filter(i => i.provider === 'audio');
  console.log(`  ℹ Empirical Observation: search("audio:") returned ${qAudioColon.length} audio provider items (prefix regex lacking ":?" in providers.js:3403/3408)`);

  // Test executing non-existent item in registry
  const execBadItem = await registry.execute('audio:definitely_missing_item_guid', 'set-default');
  check(execBadItem === null || execBadItem.ok === false, 'registry.execute on non-existent audio item fails safely');

  // =========================================================================
  // SUITE 2: WINDOWS SERVICES MANAGER ADVERSARIAL STRESS
  // =========================================================================
  console.log('\n--- [SUITE 2] Windows Services Manager Stress Testing ---');

  // 2.1 parseServices normalization stress
  console.log('\n2.1 Testing parseServices with boundary states & malformed objects:');
  check(servicesManager.parseServices(null).length === 0, 'parseServices(null) returns empty array');
  check(servicesManager.parseServices(undefined).length === 0, 'parseServices(undefined) returns empty array');
  check(servicesManager.parseServices([]).length === 0, 'parseServices([]) returns empty array');

  const rawTestServices = [
    { Name: 'TestRunningNum', DisplayName: 'Test Running Num', Status: 4, StartType: 2 },
    { Name: 'TestStoppedNum', DisplayName: 'Test Stopped Num', Status: 1, StartType: 3 },
    { Name: 'TestPausedNum', DisplayName: 'Test Paused Num', Status: 7, StartType: 4 },
    { name: 'testlower', displayName: 'Test Lower', status: 'running', startType: 'automatic' },
    { name: 'teststopstr', displayName: 'Test Stop Str', status: 'stopped', startType: 'manual' },
    { name: 'testdisabledstr', displayName: 'Test Disabled Str', status: 'paused', startType: 'disabled' },
    { Name: 'UnknownState', DisplayName: 'Unknown State', Status: 99, StartType: 99 },
    {} // empty object boundary
  ];
  const parsedSvcs = servicesManager.parseServices(rawTestServices);
  check(parsedSvcs.length === 8, 'Parsed all 8 input variants without error');
  check(parsedSvcs[0].status === 'Running' && parsedSvcs[0].startType === 'Automatic', 'Status 4 -> Running, StartType 2 -> Automatic');
  check(parsedSvcs[1].status === 'Stopped' && parsedSvcs[1].startType === 'Manual', 'Status 1 -> Stopped, StartType 3 -> Manual');
  check(parsedSvcs[2].status === 'Paused' && parsedSvcs[2].startType === 'Disabled', 'Status 7 -> Paused, StartType 4 -> Disabled');
  check(parsedSvcs[3].status === 'Running' && parsedSvcs[3].startType === 'Automatic', 'Case-insensitive string status/startType preserved');
  check(parsedSvcs[6].status === 'Stopped' && parsedSvcs[6].startType === 'Manual', 'Unknown status/startType safely defaults to Stopped / Manual');
  check(parsedSvcs[7].name === '' && parsedSvcs[7].status === 'Stopped', 'Empty object handled without crashing');

  // 2.2 filterServices Stress: Special characters, SQL/command injection, Regex chars
  console.log('\n2.2 Testing filterServices against hostile / adversarial queries:');
  const sampleFilterPool = [
    { name: 'wuauserv', displayName: 'Windows Update', status: 'Running', startType: 'Manual' },
    { name: 'Spooler', displayName: 'Print Spooler', status: 'Running', startType: 'Automatic' },
    { name: 'Themes', displayName: 'Themes', status: 'Running', startType: 'Automatic' },
    { name: 'Special!@#', displayName: 'Special $#@!%^&*() Service', status: 'Stopped', startType: 'Disabled' }
  ];

  check(servicesManager.filterServices(sampleFilterPool, '').length === 4, 'Empty query returns all services');
  check(servicesManager.filterServices(sampleFilterPool, null).length === 4, 'null query returns all services');
  check(servicesManager.filterServices(null, 'test').length === 0, 'null services pool returns empty array');

  // Regex metacharacters that would crash RegExp: ( [ * + ? ^ $ \
  const regexQuery1 = servicesManager.filterServices(sampleFilterPool, '([.*+?^${}()|\\]\\\\)');
  check(Array.isArray(regexQuery1), 'Regex metacharacters do NOT throw SyntaxError');

  const regexQuery2 = servicesManager.filterServices(sampleFilterPool, '$#@!');
  check(regexQuery2.length === 1 && regexQuery2[0].name === 'Special!@#', 'Special characters query matched target service cleanly');

  // SQL / command injection patterns
  const injection1 = servicesManager.filterServices(sampleFilterPool, "'; DROP TABLE services; --");
  check(injection1.length === 0, 'SQL injection string parsed safely with 0 matches');

  const injection2 = servicesManager.filterServices(sampleFilterPool, '& dir C:\\ &');
  check(injection2.length === 0, 'Command injection string parsed safely with 0 matches');

  // Non-existent service query
  const nonExistent = servicesManager.filterServices(sampleFilterPool, 'totally_bogus_service_name_xyz');
  check(nonExistent.length === 0, 'Non-existent service query returns 0 matches');

  // Case-insensitivity
  const caseTest1 = servicesManager.filterServices(sampleFilterPool, 'WuAuSeRv');
  check(caseTest1.length === 1 && caseTest1[0].name === 'wuauserv', 'Case-insensitive search matched wuauserv');

  const caseTest2 = servicesManager.filterServices(sampleFilterPool, 'pRiNt SpOoLeR');
  check(caseTest2.length === 1 && caseTest2[0].name === 'Spooler', 'Case-insensitive search matched displayName');

  // 2.3 controlService Lifecycle & Redundancy Stress
  console.log('\n2.3 Testing controlService lifecycle actions and idempotency:');
  const mockSvcList = [
    { name: 'ActiveService', displayName: 'Active Service', status: 'Running', startType: 'Automatic' },
    { name: 'HaltedService', displayName: 'Halted Service', status: 'Stopped', startType: 'Manual' }
  ];

  // Non-existent service control
  const bogusSvcRes = await servicesManager.controlService('NonExistentSvc999', 'Start', mockSvcList);
  check(bogusSvcRes.ok === false, 'controlService on non-existent service returns ok: false');
  check(bogusSvcRes.error.includes('not found'), 'Returns error: "Service not found"');

  const nullSvcRes = await servicesManager.controlService(null, 'Start', mockSvcList);
  check(nullSvcRes.ok === false, 'controlService(null) returns ok: false');

  // Idempotency: Starting an already running service
  const startRunningRes = await servicesManager.controlService('ActiveService', 'Start', mockSvcList);
  check(startRunningRes.ok === true, 'Starting already running service succeeds cleanly');
  check(mockSvcList.find(s => s.name === 'ActiveService').status === 'Running', 'Status remains Running');

  // Idempotency: Stopping an already stopped service
  const stopStoppedRes = await servicesManager.controlService('HaltedService', 'Stop', mockSvcList);
  check(stopStoppedRes.ok === true, 'Stopping already stopped service succeeds cleanly');
  check(mockSvcList.find(s => s.name === 'HaltedService').status === 'Stopped', 'Status remains Stopped');

  // Transition: Stop a running service
  const stopRunningRes = await servicesManager.controlService('ActiveService', 'Stop', mockSvcList);
  check(stopRunningRes.ok === true, 'Stopping running service succeeds');
  check(mockSvcList.find(s => s.name === 'ActiveService').status === 'Stopped', 'Status transitioned to Stopped');

  // Transition: Start a stopped service
  const startStoppedRes = await servicesManager.controlService('ActiveService', 'Start', mockSvcList);
  check(startStoppedRes.ok === true, 'Starting stopped service succeeds');
  check(mockSvcList.find(s => s.name === 'ActiveService').status === 'Running', 'Status transitioned to Running');

  // Transition: Restart a service
  const restartRes = await servicesManager.controlService('ActiveService', 'Restart', mockSvcList);
  check(restartRes.ok === true, 'Restarting service succeeds');
  check(mockSvcList.find(s => s.name === 'ActiveService').status === 'Running', 'Status is Running after restart');

  // 2.4 Provider Registry Integration Stress
  console.log('\n2.4 Testing Windows Services Provider in registry:');
  const qSvcPrefix = (await registry.search('services:')).filter(i => i.provider === 'services');
  check(qSvcPrefix.length > 0, 'search("services:") returns service items');

  const qSvcShort = (await registry.search('svc:')).filter(i => i.provider === 'services');
  check(qSvcShort.length > 0, 'search("svc:") prefix alias returns service items');

  const qSvcSpaces = (await registry.search('services:     ')).filter(i => i.provider === 'services');
  check(qSvcSpaces.length > 0, 'search("services:    ") with trailing spaces returns items');

  const qSvcNonExistent = (await registry.search('services:non_existent_super_rare_svc_name')).filter(i => i.provider === 'services');
  check(qSvcNonExistent.length === 0, 'search for non-existent service returns 0 service provider matches');

  // Verify Action contracts based on Running vs Stopped
  const runningItem = qSvcPrefix.find(i => i.status === 'Running');
  if (runningItem) {
    const actionIds = runningItem.actions.map(a => a.id);
    check(actionIds.includes('restart') && actionIds.includes('stop'), 'Running service provides restart and stop actions');
    check(!actionIds.includes('start'), 'Running service does NOT offer redundant start action');
  }

  const stoppedItem = qSvcPrefix.find(i => i.status === 'Stopped');
  if (stoppedItem) {
    const actionIds = stoppedItem.actions.map(a => a.id);
    check(actionIds.includes('start'), 'Stopped service provides start action');
    check(!actionIds.includes('stop'), 'Stopped service does NOT offer redundant stop action');
  }

  // Cleanup
  registry.dispose();
  try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}

  console.log('\n================================================================');
  console.log(`🎉 ALL ADVERSARIAL STRESS TESTS PASSED (${passedAssertions} ASSERTIONS VERIFIED)! 🎉`);
  console.log('================================================================\n');
}

runAdversarialSuite().catch((err) => {
  console.error('\n❌ Adversarial stress test failed:', err);
  process.exit(1);
});
