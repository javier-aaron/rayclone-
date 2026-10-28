'use strict';

const crypto = require('node:crypto');
const store = require('./store');

const DEFAULT_NOTES = [
  {
    id: 'note-welcome',
    title: 'Welcome to Rayclone Notes',
    content: 'A fast scratchpad for ideas, meeting notes, code snippets, and quick to-dos.\n\n- Press Enter to copy note\n- Press Ctrl+K for actions\n- Type "note: <text>" to quickly create a new note',
    updatedAt: Date.now()
  }
];

let notes = [];

function load() {
  const saved = store.read('notes', null);
  if (Array.isArray(saved) && saved.length) {
    notes = saved;
  } else {
    notes = [...DEFAULT_NOTES];
    store.write('notes', notes);
  }
}

function persist() {
  store.write('notes', notes);
}

function getNotes() {
  if (!notes.length) load();
  return [...notes].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

function createNote(title, content = '') {
  if (!notes.length) load();
  const id = `note-${crypto.randomUUID().slice(0, 8)}`;
  const note = {
    id,
    title: String(title || 'Untitled Note').trim(),
    content: String(content || '').trim(),
    updatedAt: Date.now()
  };
  notes.unshift(note);
  persist();
  return note;
}

function deleteNote(id) {
  if (!notes.length) load();
  notes = notes.filter((n) => n.id !== id);
  persist();
}

function searchNotes(query) {
  const all = getNotes();
  const q = String(query || '').trim().toLowerCase();
  if (!q) return all;

  return all.filter((n) => (
    n.title.toLowerCase().includes(q) ||
    n.content.toLowerCase().includes(q)
  ));
}

module.exports = {
  load,
  getNotes,
  createNote,
  deleteNote,
  searchNotes
};
