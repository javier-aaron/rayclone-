'use strict';

const store = require('./store');

const DEFAULT_CONTACTS = [
  {
    id: 'c-1',
    name: 'Sarah Connor',
    email: 'sarah.connor@cyberdyne.org',
    phone: '+1 (555) 234-5678',
    company: 'Resistance Ops',
    role: 'Lead Strategist',
    notes: 'Primary point of contact for security architecture'
  },
  {
    id: 'c-2',
    name: 'Alex Chen',
    email: 'alex.chen@deepmind.google.com',
    phone: '+1 (555) 876-5432',
    company: 'Google DeepMind',
    role: 'Staff Research Engineer',
    notes: 'Agentic coding and LLM infrastructure'
  },
  {
    id: 'c-3',
    name: 'Elena Rostova',
    email: 'elena.rostova@nordictech.io',
    phone: '+46 8 123 4567',
    company: 'Nordic Systems',
    role: 'VP Engineering',
    notes: 'Stockholm office coordinator'
  },
  {
    id: 'c-4',
    name: 'Marcus Vance',
    email: 'marcus.vance@vectorcloud.net',
    phone: '+1 (555) 345-6789',
    company: 'Vector Cloud',
    role: 'Solutions Architect',
    notes: 'Kubernetes and enterprise hybrid cloud'
  }
];

let contacts = [];

function load() {
  const saved = store.read('contacts_list', null);
  if (Array.isArray(saved) && saved.length > 0) {
    contacts = saved;
  } else {
    contacts = [...DEFAULT_CONTACTS];
    store.write('contacts_list', contacts);
  }
}

function persist() {
  store.write('contacts_list', contacts);
}

function getContacts() {
  if (!contacts.length) load();
  return contacts;
}

function addContact(contact) {
  if (!contact || !contact.name) return { ok: false, error: 'Name is required' };
  const newContact = {
    id: contact.id || `c-${Date.now()}`,
    name: contact.name.trim(),
    email: (contact.email || '').trim(),
    phone: (contact.phone || '').trim(),
    company: (contact.company || '').trim(),
    role: (contact.role || '').trim(),
    notes: (contact.notes || '').trim()
  };
  contacts.push(newContact);
  persist();
  return { ok: true, contact: newContact };
}

function deleteContact(id) {
  contacts = contacts.filter((c) => c.id !== id);
  persist();
  return { ok: true };
}

function searchContacts(query) {
  const q = String(query || '').trim().toLowerCase();
  const all = getContacts();
  if (!q) return all;

  return all.filter((c) => {
    return c.name.toLowerCase().includes(q)
      || c.email.toLowerCase().includes(q)
      || c.phone.toLowerCase().includes(q)
      || c.company.toLowerCase().includes(q)
      || c.role.toLowerCase().includes(q);
  });
}

module.exports = {
  load,
  getContacts,
  addContact,
  deleteContact,
  searchContacts
};
