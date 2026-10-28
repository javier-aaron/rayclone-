'use strict';

const store = require('./store');

let reminders = [];
let activeTimers = new Map();

function init() {
  const loaded = store.read('reminders', []);
  reminders = Array.isArray(loaded) ? loaded : [];
  schedulePendingReminders();
}

function parseReminderText(input) {
  const text = String(input || '').trim();
  let delayMs = 0;
  let message = text;

  // Match: "remind me in 20m to do something" or "in 5h fix bug" or "in 30s alert"
  const inMatch = text.match(/(?:remind\s+(?:me\s+)?in\s+|in\s+)(\d+)\s*(s|sec|m|min|minute|minutes|h|hr|hour|hours|d|day|days)\s*(?:to\s+)?(.+)/i);
  if (inMatch) {
    const amount = parseInt(inMatch[1], 10);
    const unit = inMatch[2].toLowerCase();
    message = inMatch[3].trim();

    if (unit.startsWith('s')) delayMs = amount * 1000;
    else if (unit.startsWith('m')) delayMs = amount * 60 * 1000;
    else if (unit.startsWith('h')) delayMs = amount * 60 * 60 * 1000;
    else if (unit.startsWith('d')) delayMs = amount * 24 * 60 * 60 * 1000;
  } else {
    // Default fallback: "todo: buy milk" or "remind me to call John"
    const todoMatch = text.match(/^(?:todo:\s*|remind\s+(?:me\s+)?to\s+)(.+)/i);
    if (todoMatch) {
      message = todoMatch[1].trim();
      delayMs = 0; // Immediate todo
    }
  }

  return { message, delayMs, dueTimestamp: delayMs > 0 ? Date.now() + delayMs : null };
}

function addReminder(input) {
  const parsed = parseReminderText(input);
  const id = `rem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const reminder = {
    id,
    text: parsed.message,
    dueTimestamp: parsed.dueTimestamp,
    completed: false,
    created: Date.now()
  };

  reminders.unshift(reminder);
  store.write('reminders', reminders);

  if (reminder.dueTimestamp && reminder.dueTimestamp > Date.now()) {
    scheduleTimer(reminder);
  }

  return reminder;
}

function scheduleTimer(reminder) {
  const waitMs = Math.max(0, reminder.dueTimestamp - Date.now());
  const timer = setTimeout(() => {
    triggerNotification(reminder);
    activeTimers.delete(reminder.id);
  }, waitMs);
  activeTimers.set(reminder.id, timer);
}

function schedulePendingReminders() {
  for (const r of reminders) {
    if (!r.completed && r.dueTimestamp && r.dueTimestamp > Date.now()) {
      scheduleTimer(r);
    }
  }
}

function triggerNotification(reminder) {
  try {
    const { Notification } = require('electron');
    if (Notification.isSupported()) {
      new Notification({
        title: 'Rayclone Reminder',
        body: reminder.text,
        silent: false
      }).show();
    }
  } catch {}
}

function getReminders() {
  return [...reminders];
}

function completeReminder(id) {
  const r = reminders.find((x) => x.id === id);
  if (r) {
    r.completed = true;
    if (activeTimers.has(id)) {
      clearTimeout(activeTimers.get(id));
      activeTimers.delete(id);
    }
    store.write('reminders', reminders);
    return true;
  }
  return false;
}

function deleteReminder(id) {
  const idx = reminders.findIndex((x) => x.id === id);
  if (idx !== -1) {
    if (activeTimers.has(id)) {
      clearTimeout(activeTimers.get(id));
      activeTimers.delete(id);
    }
    reminders.splice(idx, 1);
    store.write('reminders', reminders);
    return true;
  }
  return false;
}

init();

module.exports = {
  init,
  parseReminderText,
  addReminder,
  getReminders,
  completeReminder,
  deleteReminder
};
