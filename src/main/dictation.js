'use strict';

const { spawn } = require('node:child_process');
const store = require('./store');
const notesManager = require('./notes');
const ai = require('./ai');

let electron = null;
try { electron = require('electron'); } catch {}
const clipboard = electron && electron.clipboard;

function triggerWindowsVoiceTyping() {
  // Win+H launches Windows Speech / Voice Typing
  const ps = `
    $wshell = New-Object -ComObject WScript.Shell
    $wshell.SendKeys('#h')
  `;
  spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  }).unref();
}

function getTranscriptions() {
  return store.read('dictation_history', [
    {
      id: 'trans-1',
      text: 'Rayclone feature complete with Raycast Windows parity and native performance',
      timestamp: new Date(Date.now() - 3600000).toISOString(),
      source: 'Voice Typing'
    },
    {
      id: 'trans-2',
      text: 'Schedule architecture review meeting with deep learning research team for Friday',
      timestamp: new Date(Date.now() - 7200000).toISOString(),
      source: 'Voice Typing'
    }
  ]) || [];
}

function addTranscription(text, source = 'Voice Typing') {
  const clean = String(text || '').trim();
  if (!clean) return null;
  const history = getTranscriptions();
  const entry = {
    id: `trans-${Date.now()}`,
    text: clean,
    timestamp: new Date().toISOString(),
    source
  };
  history.unshift(entry);
  store.write('dictation_history', history.slice(0, 50));
  return entry;
}

function getLastTranscription() {
  const all = getTranscriptions();
  return all[0] || null;
}

function copyLastTranscription() {
  const last = getLastTranscription();
  if (!last) return { ok: false, error: 'No voice transcriptions found' };
  if (clipboard && typeof clipboard.writeText === 'function') {
    clipboard.writeText(last.text);
  }
  return { ok: true, text: last.text };
}

function dictateText() {
  triggerWindowsVoiceTyping();
  return {
    ok: true,
    action: 'Windows Voice Typing (Win+H) launched',
    instructions: 'Speak clearly into your microphone to transcribe text anywhere.'
  };
}

async function dictateToAi(promptText = null) {
  const text = promptText || (getLastTranscription() && getLastTranscription().text);
  if (!text) {
    triggerWindowsVoiceTyping();
    return { ok: true, message: 'Listening for prompt via Windows Voice Typing...' };
  }
  return ai.askAi(text, 'You are an intelligent assistant responding to voice dictated queries.');
}

function dictateToNote(noteText = null) {
  const text = noteText || (getLastTranscription() && getLastTranscription().text);
  if (!text) {
    triggerWindowsVoiceTyping();
    return { ok: true, message: 'Listening for note via Windows Voice Typing...' };
  }
  const note = notesManager.createNote(`Voice Note — ${new Date().toLocaleDateString()}`, text);
  return { ok: true, note };
}

module.exports = {
  triggerWindowsVoiceTyping,
  getTranscriptions,
  addTranscription,
  getLastTranscription,
  copyLastTranscription,
  dictateText,
  dictateToAi,
  dictateToNote
};
