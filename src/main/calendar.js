const electron = require('electron');
const store = require('./store');

const clipboard = electron && electron.clipboard;
const shell = electron && electron.shell;

const MEETING_REGEX = /(https?:\/\/(?:[a-zA-Z0-9-]+\.)?(?:zoom\.us\/j\/\S+|meet\.google\.com\/[a-zA-Z0-9\-]+|teams\.microsoft\.com\/l\/meetup-join\/\S+|webex\.com\/\S+|meet\.jit\.si\/\S+))/i;

function getSampleEvents() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();

  return [
    {
      id: 'evt-standup',
      title: 'Daily Team Sync & Standup',
      start: new Date(y, m, d, 10, 0).toISOString(),
      end: new Date(y, m, d, 10, 30).toISOString(),
      meetingUrl: 'https://meet.google.com/abc-defg-hij',
      platform: 'Google Meet',
      location: 'Virtual',
      notes: 'Review daily blockers and launch roadmap'
    },
    {
      id: 'evt-review',
      title: 'Architecture & Engineering Review',
      start: new Date(y, m, d, 14, 0).toISOString(),
      end: new Date(y, m, d, 15, 0).toISOString(),
      meetingUrl: 'https://zoom.us/j/9876543210',
      platform: 'Zoom',
      location: 'Virtual',
      notes: 'Rayclone v2 feature parity walk-through'
    },
    {
      id: 'evt-1on1',
      title: '1:1 Sync with Lead Architect',
      start: new Date(y, m, d, 16, 30).toISOString(),
      end: new Date(y, m, d, 17, 0).toISOString(),
      meetingUrl: 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_rayclone',
      platform: 'Microsoft Teams',
      location: 'Virtual',
      notes: 'Performance optimizations and packaging'
    }
  ];
}

let events = [];

function load() {
  const saved = store.read('calendar_events', null);
  if (Array.isArray(saved) && saved.length > 0) {
    events = saved;
  } else {
    events = getSampleEvents();
    store.write('calendar_events', events);
  }
}

function persist() {
  store.write('calendar_events', events);
}

function getEvents() {
  if (!events.length) load();
  return events;
}

function addEvent(title, meetingUrl = null, start = null, end = null) {
  const newId = `evt-${Date.now()}`;
  const detectedPlatform = detectMeetingPlatform(meetingUrl);
  const evt = {
    id: newId,
    title: title.trim(),
    start: start || new Date(Date.now() + 3600000).toISOString(),
    end: end || new Date(Date.now() + 5400000).toISOString(),
    meetingUrl: meetingUrl || null,
    platform: detectedPlatform || 'Virtual',
    location: 'Virtual',
    notes: ''
  };
  events.push(evt);
  persist();
  return evt;
}

function deleteEvent(id) {
  events = events.filter((e) => e.id !== id);
  persist();
}

function detectMeetingPlatform(url) {
  if (!url) return null;
  const s = String(url).toLowerCase();
  if (s.includes('zoom.us')) return 'Zoom';
  if (s.includes('meet.google.com')) return 'Google Meet';
  if (s.includes('teams.microsoft.com')) return 'Microsoft Teams';
  if (s.includes('webex.com')) return 'Webex';
  if (s.includes('meet.jit.si')) return 'Jitsi Meet';
  return 'Meeting';
}

function detectClipboardMeetingUrl() {
  try {
    if (!clipboard || typeof clipboard.readText !== 'function') return null;
    const text = clipboard.readText();
    if (!text) return null;
    const match = text.match(MEETING_REGEX);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function getUpcomingMeeting() {
  const all = getEvents();
  const now = Date.now();
  // Find event happening now or closest in future with a meetingUrl
  const withUrl = all.filter((e) => e.meetingUrl);
  withUrl.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  return withUrl[0] || null;
}

function quickJoin(meetingUrl) {
  const target = meetingUrl || detectClipboardMeetingUrl() || (getUpcomingMeeting() && getUpcomingMeeting().meetingUrl);
  if (target) {
    if (shell && typeof shell.openExternal === 'function') {
      shell.openExternal(target);
    }
    return { ok: true, url: target };
  }
  return { ok: false, error: 'No meeting link detected' };
}

module.exports = {
  load,
  getEvents,
  addEvent,
  deleteEvent,
  detectMeetingPlatform,
  detectClipboardMeetingUrl,
  getUpcomingMeeting,
  quickJoin
};
