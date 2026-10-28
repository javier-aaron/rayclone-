'use strict';

const store = require('./store');

const DEFAULT_CATEGORIES = [
  { id: 'work', name: 'Work', emoji: '💼' },
  { id: 'coding', name: 'Coding', emoji: '💻' },
  { id: 'writing', name: 'Writing', emoji: '✍️' },
  { id: 'study', name: 'Study', emoji: '📚' },
  { id: 'design', name: 'Design', emoji: '🎨' },
  { id: 'reading', name: 'Reading', emoji: '📖' }
];

let session = {
  state: 'idle', // 'idle' | 'active' | 'paused' | 'completed'
  category: 'Work',
  durationSeconds: 25 * 60,
  remainingSeconds: 25 * 60,
  startedAt: null,
  pausedAt: null
};

let ticker = null;

function load() {
  const saved = store.read('focus_session', null);
  if (saved && saved.state) {
    session = saved;
    // If was active, calculate elapsed
    if (session.state === 'active' && session.startedAt) {
      const elapsed = Math.floor((Date.now() - session.startedAt) / 1000);
      session.remainingSeconds = Math.max(0, session.durationSeconds - elapsed);
      if (session.remainingSeconds === 0) {
        session.state = 'completed';
      } else {
        startTicker();
      }
    }
  }
}

function persist() {
  store.write('focus_session', session);
}

function startTicker() {
  if (ticker) clearInterval(ticker);
  ticker = setInterval(() => {
    if (session.state === 'active') {
      if (session.remainingSeconds > 0) {
        session.remainingSeconds--;
        if (session.remainingSeconds === 0) {
          complete();
        }
      }
    }
  }, 1000);
}

function start(durationMinutes = 25, category = 'Work') {
  session = {
    state: 'active',
    category,
    durationSeconds: Math.round(durationMinutes * 60),
    remainingSeconds: Math.round(durationMinutes * 60),
    startedAt: Date.now(),
    pausedAt: null
  };
  startTicker();
  persist();
  return getStatus();
}

function pause() {
  if (session.state === 'active') {
    session.state = 'paused';
    session.pausedAt = Date.now();
    persist();
  }
  return getStatus();
}

function resume() {
  if (session.state === 'paused') {
    session.state = 'active';
    session.startedAt = Date.now() - (session.durationSeconds - session.remainingSeconds) * 1000;
    session.pausedAt = null;
    startTicker();
    persist();
  }
  return getStatus();
}

function toggle() {
  if (session.state === 'idle' || session.state === 'completed') {
    return start(25, session.category || 'Work');
  }
  if (session.state === 'active') {
    return pause();
  }
  if (session.state === 'paused') {
    return resume();
  }
  return getStatus();
}

function complete() {
  session.state = 'completed';
  session.remainingSeconds = 0;
  if (ticker) clearInterval(ticker);
  recordCompletedStats(session.durationSeconds, session.category);
  persist();
  return getStatus();
}

function reset() {
  if (ticker) clearInterval(ticker);
  session = {
    state: 'idle',
    category: session.category || 'Work',
    durationSeconds: 25 * 60,
    remainingSeconds: 25 * 60,
    startedAt: null,
    pausedAt: null
  };
  persist();
  return getStatus();
}

function recordCompletedStats(seconds, category) {
  const today = new Date().toISOString().slice(0, 10);
  const stats = store.read('focus_stats', {}) || {};
  if (!stats[today]) {
    stats[today] = { sessions: 0, totalSeconds: 0, categories: {} };
  }
  stats[today].sessions += 1;
  stats[today].totalSeconds += seconds;
  stats[today].categories[category] = (stats[today].categories[category] || 0) + 1;
  store.write('focus_stats', stats);
}

function getStats() {
  const today = new Date().toISOString().slice(0, 10);
  const stats = store.read('focus_stats', {}) || {};
  return stats[today] || { sessions: 0, totalSeconds: 0, categories: {} };
}

function formatTime(totalSec) {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function getStatus() {
  const progress = session.durationSeconds > 0
    ? Math.round(((session.durationSeconds - session.remainingSeconds) / session.durationSeconds) * 100)
    : 0;

  return {
    state: session.state,
    category: session.category,
    durationMinutes: Math.round(session.durationSeconds / 60),
    remainingSeconds: session.remainingSeconds,
    remainingFormatted: formatTime(session.remainingSeconds),
    progressPercent: Math.min(100, Math.max(0, progress)),
    stats: getStats()
  };
}

module.exports = {
  DEFAULT_CATEGORIES,
  load,
  start,
  pause,
  resume,
  toggle,
  complete,
  reset,
  getStatus,
  getStats
};
