import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const assert = require('node:assert');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

const { createRegistry } = require('../src/main/providers');
const { getPreviewForItem } = require('../src/main/preview');
const audioManager = require('../src/main/audio-manager');
const servicesManager = require('../src/main/services-manager');
const envManager = require('../src/main/env-manager');
const wingetManager = require('../src/main/winget-manager');
const hostsEditor = require('../src/main/hosts-editor');

console.log('=== Running M2 Dedicated End-to-End Verification ===\n');

async function runM2Tests() {
  const testDir = path.join(os.tmpdir(), `rayclone-m2-test-${Date.now()}`);
  fs.mkdirSync(testDir, { recursive: true });

  const registry = createRegistry({ userDataPath: testDir });
  await registry.warm();

  const providerList = registry.list();
  const providerIds = providerList.map(p => p.id);
  console.log('1. Checking M2 Provider Registrations in createRegistry()...');
  assert(providerIds.includes('audio'), 'audio provider should be registered');
  assert(providerIds.includes('services'), 'services provider should be registered');
  assert(providerIds.includes('env'), 'env provider should be registered');
  assert(providerIds.includes('winget'), 'winget provider should be registered');
  assert(providerIds.includes('hosts'), 'hosts provider should be registered');
  console.log('  ✓ All 5 M2 providers successfully registered in registry');

  // 2. Audio Switcher Verification
  console.log('\n2. Testing Audio Switcher Provider & Preview...');
  const audioResults = await registry.search('audio');
  assert(audioResults.length > 0, 'Audio search should return devices');
  const audioItem = audioResults.find(i => i.provider === 'audio');
  assert(audioItem, 'Audio item should exist in search results');
  console.log('  ✓ Audio search found item:', audioItem.title);

  const audioPrev = await getPreviewForItem(audioItem);
  assert(audioPrev && audioPrev.type === 'audio', 'Preview should have type: audio');
  assert(audioPrev.name && audioPrev.kind && audioPrev.id, 'Audio preview should have name, kind, id');
  console.log('  ✓ Audio preview verified:', audioPrev.name, `(${audioPrev.kind})`, 'Default:', audioPrev.isDefault);

  const audioExec = await registry.execute(audioItem.id, 'set-default');
  assert(audioExec && audioExec.ok === true, 'Audio set-default action should succeed');
  console.log('  ✓ Audio set-default action executed successfully');

  // 3. Windows Services Verification
  console.log('\n3. Testing Windows Services Provider & Preview...');
  const serviceResults = await registry.search('services:');
  assert(serviceResults.length > 0, 'Service prefix search should return services');
  const svcItem = serviceResults.find(i => i.provider === 'services');
  assert(svcItem, 'Service item should exist in search results');
  console.log('  ✓ Services search found item:', svcItem.title);

  const svcPrev = await getPreviewForItem(svcItem);
  assert(svcPrev && svcPrev.type === 'service', 'Preview should have type: service');
  assert(svcPrev.name && svcPrev.status && svcPrev.startType, 'Service preview should have name, status, startType');
  console.log('  ✓ Service preview verified:', svcPrev.displayName, `[${svcPrev.status}]`, `[${svcPrev.startType}]`);

  const svcActionId = svcItem.actions[0].id;
  const svcExec = await registry.execute(svcItem.id, svcActionId);
  assert(svcExec && svcExec.ok === true, 'Service lifecycle action should execute successfully');
  console.log('  ✓ Service action', svcActionId, 'executed successfully');

  // 4. Environment Variables Verification
  console.log('\n4. Testing Environment Variables Provider & Preview...');
  const envResults = await registry.search('env:PATH');
  assert(envResults.length > 0, 'env:PATH search should return PATH variable');
  const envItem = envResults.find(i => (i.varName || '').toUpperCase() === 'PATH');
  assert(envItem, 'PATH environment variable item should exist');
  console.log('  ✓ Env search found item:', envItem.title);

  const envPrev = await getPreviewForItem(envItem);
  assert(envPrev && envPrev.type === 'env', 'Preview should have type: env');
  assert(Array.isArray(envPrev.paths) && envPrev.paths.length > 0, 'PATH preview should have parsed path entries');
  console.log('  ✓ Env preview verified with', envPrev.paths.length, 'path segments');
  const validSegment = envPrev.paths.find(p => p.exists);
  assert(validSegment, 'At least one valid path segment should exist in PATH');
  console.log('    ✓ Valid segment found:', validSegment.path);

  const envExec = await registry.execute(envItem.id, 'copy-val');
  assert(envExec && envExec.ok === true, 'Env copy action should succeed');
  console.log('  ✓ Env copy action executed successfully');

  // 5. Winget Software Updates Verification
  console.log('\n5. Testing Winget Software Updates Provider & Preview...');
  const wingetResults = await registry.search('winget');
  assert(wingetResults.length > 0, 'Winget search should return available packages');
  const wingetItem = wingetResults.find(i => i.provider === 'winget');
  assert(wingetItem, 'Winget package item should exist');
  console.log('  ✓ Winget search found item:', wingetItem.title);

  const wingetPrev = await getPreviewForItem(wingetItem);
  assert(wingetPrev && wingetPrev.type === 'winget', 'Preview should have type: winget');
  assert(wingetPrev.name && wingetPrev.availableVersion, 'Winget preview should contain package details');
  console.log('  ✓ Winget preview verified:', wingetPrev.name, wingetPrev.currentVersion, '->', wingetPrev.availableVersion);

  const copyCmdExec = await registry.execute(wingetItem.id, 'copy-cmd');
  assert(copyCmdExec && copyCmdExec.ok === true, 'Winget copy-cmd action should succeed');
  console.log('  ✓ Winget copy-cmd action executed successfully');

  // 6. Hosts File Editor Verification
  console.log('\n6. Testing Hosts File Editor Provider & Preview...');
  const hostsResults = await registry.search('hosts:');
  assert(hostsResults.length > 0, 'Hosts search should return hosts rules');
  const hostItem = hostsResults.find(i => i.provider === 'hosts');
  assert(hostItem, 'Hosts rule item should exist');
  console.log('  ✓ Hosts search found rule:', hostItem.title);

  const hostPrev = await getPreviewForItem(hostItem);
  assert(hostPrev && hostPrev.type === 'hosts', 'Preview should have type: hosts');
  assert(hostPrev.domain && hostPrev.ip, 'Hosts preview should contain domain and ip');
  console.log('  ✓ Hosts preview verified:', hostPrev.domain, '->', hostPrev.ip, `[Enabled: ${hostPrev.enabled}]`);

  const dnsExec = await registry.execute(hostItem.id, 'flush-dns');
  assert(dnsExec && dnsExec.ok === true, 'Hosts flush-dns action should succeed');
  console.log('  ✓ Hosts flush-dns action executed successfully');

  registry.dispose();
  try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {}

  console.log('\n================================================================');
  console.log('🎉 100% M2 END-TO-END VERIFICATION PASSED: ALL CHECKS CLEAN! 🎉');
  console.log('================================================================\n');
}

runM2Tests().catch(err => {
  console.error('\n❌ M2 Verification failed:', err);
  process.exit(1);
});
