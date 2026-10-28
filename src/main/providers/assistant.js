'use strict';

const { clipboard, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const store = require('../store');
const translator = require('../translator');
const dictionary = require('../dictionary');
const focus = require('../focus');
const calendar = require('../calendar');
const contacts = require('../contacts');
const typingPractice = require('../typing-practice');
const weather = require('../weather');
const navigation = require('../navigation');
const { fuzzy, scoreItem, HOME } = require('./utils');

function translatorProvider() {
  return {
    id: 'translator',
    name: 'Translator',
    group: 'Translator',
    all: () => [
      {
        id: 'trans:default',
        provider: 'translator',
        group: 'Translator',
        title: 'Translate: Any Text into 50+ Languages',
        subtitle: 'Auto-detect source language & instant translation',
        icon: { kind: 'glyph', name: 'globe' },
        actions: [
          {
            id: 'open',
            title: 'Translate Clipboard Text',
            shortcut: '↵',
            run: async () => {
              const text = clipboard.readText();
              if (!text) return { ok: false, error: 'Clipboard is empty' };
              const res = await translator.translate(text, 'es');
              if (res.ok) clipboard.writeText(res.translatedText);
              return res;
            }
          }
        ]
      }
    ],
    async search(query) {
      const q = String(query || '').trim();
      if (!q) return [];
      const parsed = translator.parseTranslateQuery(q);
      if (!parsed) {
        if (/^(?:trans|translate|translator|translation|language)/i.test(q)) {
          return [
            {
              id: 'trans:default',
              provider: 'translator',
              group: 'Translator',
              title: 'Translate: Any Text into 50+ Languages',
              subtitle: 'Auto-detect source language & instant translation',
              scoreBoost: 260,
              icon: { kind: 'glyph', name: 'globe' },
              actions: [
                {
                  id: 'open',
                  title: 'Translate Clipboard Text',
                  shortcut: '↵',
                  run: async () => {
                    const text = clipboard.readText();
                    if (!text) return { ok: false, error: 'Clipboard is empty' };
                    const res = await translator.translate(text, 'es');
                    if (res.ok) clipboard.writeText(res.translatedText);
                    return res;
                  }
                }
              ]
            }
          ];
        }
        return [];
      }

      const res = await translator.translate(parsed.text, parsed.targetLang);
      if (!res.ok) return [];

      const srcName = res.sourceLang ? `${res.sourceLang.flag} ${res.sourceLang.name}` : 'Auto';
      const tgtName = res.targetLang ? `${res.targetLang.flag} ${res.targetLang.name}` : 'Spanish';

      return [
        {
          id: `trans:${res.targetLang.code}:${parsed.text}`,
          provider: 'translator',
          group: 'Translator',
          title: res.translatedText,
          subtitle: `${srcName} → ${tgtName} · ${res.sourceText}`,
          sourceText: res.sourceText,
          translatedText: res.translatedText,
          sourceLang: res.sourceLang,
          targetLang: res.targetLang,
          translatorProvider: res.provider,
          icon: { kind: 'glyph', name: 'globe' },
          scoreBoost: 260,
          actions: [
            {
              id: 'copy',
              title: 'Copy Translation',
              shortcut: '↵',
              run: () => clipboard.writeText(res.translatedText)
            },
            {
              id: 'copy-src',
              title: 'Copy Original Text',
              shortcut: 'Ctrl+C',
              run: () => clipboard.writeText(res.sourceText)
            },
            {
              id: 'swap',
              title: 'Translate Back / Swap',
              shortcut: 'Ctrl+S',
              run: async () => {
                const swapped = await translator.translate(res.translatedText, res.sourceLang.code, res.targetLang.code);
                if (swapped.ok) clipboard.writeText(swapped.translatedText);
                return swapped;
              }
            }
          ]
        }
      ];
    }
  };
}

// ============================================================ provider: dictionary


function dictionaryProvider() {
  return {
    id: 'dictionary',
    name: 'Dictionary',
    group: 'Dictionary',
    all: () => [
      {
        id: 'dict:lookup',
        provider: 'dictionary',
        group: 'Dictionary',
        title: 'Define Word: Dictionary & Thesaurus',
        subtitle: 'Search lexical definitions, pronunciations & synonyms',
        icon: { kind: 'glyph', name: 'notes' },
        actions: [
          {
            id: 'open',
            title: 'Define Clipboard Word',
            shortcut: '↵',
            run: async () => {
              const text = clipboard.readText().trim();
              if (!text) return { ok: false, error: 'Clipboard is empty' };
              const def = await dictionary.defineWord(text);
              if (def.ok && def.meanings[0]) {
                clipboard.writeText(def.meanings[0].definitions[0].definition);
              }
              return def;
            }
          }
        ]
      }
    ],
    async search(query) {
      const q = String(query || '').trim();
      if (!q) return [];
      const parsed = dictionary.parseDictionaryQuery(q);
      if (!parsed) {
        if (/^(?:dict|dictionary|thesaurus|define|definition|word|meaning)/i.test(q)) {
          return [
            {
              id: 'dict:lookup',
              provider: 'dictionary',
              group: 'Dictionary',
              title: 'Define Word: Dictionary & Thesaurus',
              subtitle: 'Search lexical definitions, pronunciations & synonyms',
              scoreBoost: 260,
              icon: { kind: 'glyph', name: 'notes' },
              actions: [
                {
                  id: 'open',
                  title: 'Define Clipboard Word',
                  shortcut: '↵',
                  run: async () => {
                    const text = clipboard.readText().trim();
                    if (!text) return { ok: false, error: 'Clipboard is empty' };
                    const def = await dictionary.defineWord(text);
                    if (def.ok && def.meanings[0]) {
                      clipboard.writeText(def.meanings[0].definitions[0].definition);
                    }
                    return def;
                  }
                }
              ]
            }
          ];
        }
        return [];
      }

      const res = await dictionary.defineWord(parsed.word);
      if (!res.ok || !res.meanings || !res.meanings.length) return [];

      const topMeaning = res.meanings[0];
      const topDef = topMeaning.definitions[0];
      const synSnippet = res.synonyms.length ? ` · Synonyms: ${res.synonyms.slice(0, 3).join(', ')}` : '';

      return [
        {
          id: `dict:${res.word}`,
          provider: 'dictionary',
          group: 'Dictionary',
          title: `${res.word} ${res.phonetic || ''}`,
          subtitle: `(${topMeaning.partOfSpeech}) ${topDef.definition}${synSnippet}`,
          word: res.word,
          phonetic: res.phonetic,
          meanings: res.meanings,
          synonyms: res.synonyms,
          antonyms: res.antonyms,
          icon: { kind: 'glyph', name: 'notes' },
          scoreBoost: 260,
          actions: [
            {
              id: 'copy-def',
              title: 'Copy Definition',
              shortcut: '↵',
              run: () => clipboard.writeText(`${res.word}: ${topDef.definition}`)
            },
            {
              id: 'copy-syn',
              title: 'Copy Synonyms',
              shortcut: 'Ctrl+S',
              run: () => clipboard.writeText(res.synonyms.join(', '))
            },
            {
              id: 'copy-word',
              title: 'Copy Word',
              shortcut: 'Ctrl+C',
              run: () => clipboard.writeText(res.word)
            }
          ]
        }
      ];
    }
  };
}

// ============================================================ provider: focus


function focusProvider() {
  return {
    id: 'focus',
    name: 'Raycast Focus',
    group: 'Raycast Focus',
    warm: focus.load,
    all: () => {
      const st = focus.getStatus();
      return [
        {
          id: 'focus:toggle',
          provider: 'focus',
          group: 'Raycast Focus',
          title: st.state === 'active' ? `Pause Focus Session (${st.remainingFormatted})` : (st.state === 'paused' ? `Resume Focus Session (${st.remainingFormatted})` : 'Start Focus Session (25 min)'),
          subtitle: `Category: ${st.category} · State: ${st.state.toUpperCase()} · Today: ${st.stats.sessions || 0} sessions`,
          state: st.state,
          remainingFormatted: st.remainingFormatted,
          category: st.category,
          progressPercent: st.progressPercent,
          stats: st.stats,
          icon: { kind: 'glyph', name: 'bolt' },
          actions: [
            {
              id: 'toggle',
              title: st.state === 'active' ? 'Pause' : (st.state === 'paused' ? 'Resume' : 'Start Focus Session'),
              shortcut: '↵',
              run: () => focus.toggle()
            },
            {
              id: 'complete',
              title: 'Complete Session',
              shortcut: 'Ctrl+Shift+C',
              run: () => focus.complete()
            },
            {
              id: 'reset',
              title: 'Reset Session',
              shortcut: 'Ctrl+R',
              run: () => focus.reset()
            }
          ]
        },
        {
          id: 'focus:start-coding',
          provider: 'focus',
          group: 'Raycast Focus',
          title: 'Start Focus: Coding (45 min)',
          subtitle: 'Launch deep work coding session',
          category: 'Coding',
          durationMinutes: 45,
          icon: { kind: 'glyph', name: 'code' },
          actions: [{ id: 'start', title: 'Start Coding Session', shortcut: '↵', run: () => focus.start(45, 'Coding') }]
        },
        {
          id: 'focus:start-writing',
          provider: 'focus',
          group: 'Raycast Focus',
          title: 'Start Focus: Writing (25 min)',
          subtitle: 'Launch dedicated writing sprint',
          category: 'Writing',
          durationMinutes: 25,
          icon: { kind: 'glyph', name: 'notes' },
          actions: [{ id: 'start', title: 'Start Writing Session', shortcut: '↵', run: () => focus.start(25, 'Writing') }]
        }
      ];
    },
    search(query) {
      const q = String(query || '').trim().toLowerCase();
      if (!/focus|pomo|pomodoro|timer|deep\s*work/i.test(q)) return [];

      const st = focus.getStatus();
      return [
        {
          id: 'focus:toggle',
          provider: 'focus',
          group: 'Raycast Focus',
          title: st.state === 'active' ? `Pause Focus Session (${st.remainingFormatted})` : (st.state === 'paused' ? `Resume Focus Session (${st.remainingFormatted})` : 'Start Focus Session (25 min)'),
          subtitle: `Category: ${st.category} · State: ${st.state.toUpperCase()} · ${st.progressPercent}% progress`,
          state: st.state,
          remainingFormatted: st.remainingFormatted,
          category: st.category,
          progressPercent: st.progressPercent,
          stats: st.stats,
          scoreBoost: 250,
          icon: { kind: 'glyph', name: 'bolt' },
          actions: [
            { id: 'toggle', title: st.state === 'active' ? 'Pause' : 'Start Focus', shortcut: '↵', run: () => focus.toggle() },
            { id: 'complete', title: 'Complete Session', shortcut: 'Ctrl+Shift+C', run: () => focus.complete() },
            { id: 'reset', title: 'Reset Session', shortcut: 'Ctrl+R', run: () => focus.reset() }
          ]
        },
        {
          id: 'focus:start-25',
          provider: 'focus',
          group: 'Raycast Focus',
          title: 'Start 25-minute Pomodoro',
          subtitle: 'Standard productivity interval',
          scoreBoost: 220,
          icon: { kind: 'glyph', name: 'bolt' },
          actions: [{ id: 'start', title: 'Start', shortcut: '↵', run: () => focus.start(25, 'Work') }]
        },
        {
          id: 'focus:start-50',
          provider: 'focus',
          group: 'Raycast Focus',
          title: 'Start 50-minute Deep Work',
          subtitle: 'Extended concentration session',
          scoreBoost: 210,
          icon: { kind: 'glyph', name: 'bolt' },
          actions: [{ id: 'start', title: 'Start', shortcut: '↵', run: () => focus.start(50, 'Work') }]
        }
      ];
    }
  };
}

// ============================================================ provider: calendar


function calendarProvider() {
  return {
    id: 'calendar',
    name: 'Calendar',
    group: 'Calendar',
    warm: calendar.load,
    all: () => {
      const evts = calendar.getEvents();
      const items = evts.map((e) => {
        const d = new Date(e.start);
        const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return {
          id: `cal:${e.id}`,
          provider: 'calendar',
          group: 'Calendar',
          title: e.title,
          subtitle: `${timeStr} · ${e.platform || 'Meeting'} (${e.location || 'Virtual'})`,
          dateFormatted: `${d.toLocaleDateString()} ${timeStr}`,
          platform: e.platform,
          meetingUrl: e.meetingUrl,
          notes: e.notes,
          icon: { kind: 'glyph', name: 'bell' },
          actions: [
            ...(e.meetingUrl ? [{ id: 'join', title: `Join ${e.platform}`, shortcut: '↵', run: () => shell.openExternal(e.meetingUrl) }] : []),
            ...(e.meetingUrl ? [{ id: 'copy-link', title: 'Copy Meeting Link', shortcut: 'Ctrl+C', run: () => clipboard.writeText(e.meetingUrl) }] : []),
            { id: 'delete', title: 'Delete Event', shortcut: 'Ctrl+D', run: () => calendar.deleteEvent(e.id) }
          ]
        };
      });

      // Check if clipboard contains meeting link
      const clipMeeting = calendar.detectClipboardMeetingUrl();
      if (clipMeeting) {
        items.unshift({
          id: 'cal:quick-join-clip',
          provider: 'calendar',
          group: 'Calendar',
          title: 'Quick Join Meeting (from Clipboard)',
          subtitle: clipMeeting,
          meetingUrl: clipMeeting,
          platform: calendar.detectMeetingPlatform(clipMeeting),
          scoreBoost: 270,
          icon: { kind: 'glyph', name: 'monitor' },
          actions: [
            { id: 'join', title: 'Join Meeting Now', shortcut: '↵', run: () => shell.openExternal(clipMeeting) },
            { id: 'copy', title: 'Copy Link', shortcut: 'Ctrl+C', run: () => clipboard.writeText(clipMeeting) }
          ]
        });
      }

      return items;
    },
    search(query) {
      const q = String(query || '').trim();
      if (!q) return [];
      const items = [];

      // Check if user is searching general calendar commands
      if (/^(?:calendar|schedule|meeting|quick\s*join)/i.test(q)) {
        items.push({
          id: 'cal:quick-join',
          provider: 'calendar',
          group: 'Calendar',
          title: 'Quick Join Next Meeting',
          subtitle: 'Join the next scheduled conference call or clipboard meeting link',
          scoreBoost: 260,
          icon: { kind: 'glyph', name: 'monitor' },
          actions: [
            { id: 'join', title: 'Join Next Meeting', shortcut: '↵', run: () => calendar.quickJoin() }
          ]
        });
        items.push({
          id: 'cal:my-schedule',
          provider: 'calendar',
          group: 'Calendar',
          title: 'My Schedule',
          subtitle: 'Check upcoming meetings and schedule',
          scoreBoost: 250,
          icon: { kind: 'glyph', name: 'bell' },
          actions: [
            { id: 'view', title: 'View Schedule', shortcut: '↵', run: () => ({ hide: false }) }
          ]
        });
      }

      // Search existing events
      const all = calendar.getEvents();
      for (const e of all) {
        if (e.title.toLowerCase().includes(q.toLowerCase()) || (e.platform && e.platform.toLowerCase().includes(q.toLowerCase()))) {
          const d = new Date(e.start);
          const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          items.push({
            id: `cal:${e.id}`,
            provider: 'calendar',
            group: 'Calendar',
            title: e.title,
            subtitle: `${timeStr} · ${e.platform || 'Meeting'} (${e.location || 'Virtual'})`,
            dateFormatted: `${d.toLocaleDateString()} ${timeStr}`,
            platform: e.platform,
            meetingUrl: e.meetingUrl,
            notes: e.notes,
            icon: { kind: 'glyph', name: 'bell' },
            scoreBoost: 190,
            actions: [
              ...(e.meetingUrl ? [{ id: 'join', title: `Join ${e.platform}`, shortcut: '↵', run: () => shell.openExternal(e.meetingUrl) }] : []),
              ...(e.meetingUrl ? [{ id: 'copy-link', title: 'Copy Link', shortcut: 'Ctrl+C', run: () => clipboard.writeText(e.meetingUrl) }] : []),
              { id: 'delete', title: 'Delete Event', shortcut: 'Ctrl+D', run: () => calendar.deleteEvent(e.id) }
            ]
          });
        }
      }

      return items;
    }
  };
}

// ============================================================ provider: mcp


function contactsProvider() {
  return {
    id: 'contacts',
    name: 'Contacts',
    group: 'Contacts',
    warm: contacts.load,
    all: () => {
      const all = contacts.getContacts();
      return all.slice(0, 8).map((c) => ({
        id: `contact:${c.id}`,
        provider: 'contacts',
        group: 'Contacts',
        title: c.name,
        subtitle: `${c.role || ''} · ${c.company || ''} · ${c.email}`,
        company: c.company,
        role: c.role,
        email: c.email,
        phone: c.phone,
        notes: c.notes,
        icon: { kind: 'glyph', name: 'app' },
        actions: [
          { id: 'copy-email', title: 'Copy Email', shortcut: '↵', run: () => clipboard.writeText(c.email) },
          { id: 'send-email', title: 'Send Email', shortcut: 'Ctrl+E', run: () => shell.openExternal(`mailto:${c.email}`) },
          { id: 'copy-phone', title: 'Copy Phone', shortcut: 'Ctrl+P', run: () => clipboard.writeText(c.phone) }
        ]
      }));
    },
    search(query) {
      const q = String(query || '').trim();
      if (!q) return [];
      const isPrefixed = q.toLowerCase().startsWith('contact');
      const clean = q.replace(/^contact(?::|\s*)/i, '').trim();

      const matches = contacts.searchContacts(clean || q);
      return matches.map((c) => ({
        id: `contact:${c.id}`,
        provider: 'contacts',
        group: 'Contacts',
        title: c.name,
        subtitle: `${c.role || ''} · ${c.company || ''} · ${c.email}`,
        company: c.company,
        role: c.role,
        email: c.email,
        phone: c.phone,
        notes: c.notes,
        icon: { kind: 'glyph', name: 'app' },
        scoreBoost: isPrefixed ? 220 : 50,
        actions: [
          { id: 'copy-email', title: 'Copy Email', shortcut: '↵', run: () => clipboard.writeText(c.email) },
          { id: 'send-email', title: 'Send Email', shortcut: 'Ctrl+E', run: () => shell.openExternal(`mailto:${c.email}`) },
          { id: 'copy-phone', title: 'Copy Phone', shortcut: 'Ctrl+P', run: () => clipboard.writeText(c.phone) }
        ]
      }));
    }
  };
}

// ============================================================ provider: windows-run


function typingPracticeProvider() {
  return {
    id: 'typing',
    name: 'Typing Practice',
    group: 'Typing Practice',
    all: () => [
      {
        id: 'typing:start',
        provider: 'typing',
        group: 'Typing Practice',
        title: 'Start Typing Practice',
        subtitle: `Train typing speed & accuracy · Best: ${typingPractice.getBestScore().wpm} WPM`,
        icon: { kind: 'glyph', name: 'code' },
        actions: [
          {
            id: 'start',
            title: 'Start Practice Session',
            shortcut: '↵',
            run: () => typingPractice.startSession()
          }
        ]
      }
    ],
    search(query) {
      const q = String(query || '').trim().toLowerCase();
      if (!/typing|wpm|speed\s*test/i.test(q)) return [];

      const session = typingPractice.startSession();
      const best = typingPractice.getBestScore();

      return [
        {
          id: 'typing:session',
          provider: 'typing',
          group: 'Typing Practice',
          title: `Typing Practice: "${session.text}"`,
          subtitle: `— ${session.author} · High Score: ${best.wpm} WPM (${best.accuracy}% accuracy)`,
          passageText: session.text,
          author: session.author,
          bestScore: best,
          icon: { kind: 'glyph', name: 'code' },
          scoreBoost: 240,
          actions: [
            {
              id: 'copy',
              title: 'Copy Quote Text',
              shortcut: '↵',
              run: () => clipboard.writeText(`"${session.text}" — ${session.author}`)
            },
            {
              id: 'next',
              title: 'Next Quote',
              shortcut: 'Ctrl+N',
              run: () => typingPractice.startSession()
            }
          ]
        }
      ];
    }
  };
}

// ============================================================ provider: weather


function weatherProvider() {
  return {
    id: 'weather',
    name: 'Weather',
    group: 'Weather',
    all: () => [
      {
        id: 'weather:open',
        provider: 'weather',
        group: 'Weather',
        title: 'Weather Forecast & Flight Tracker',
        subtitle: 'Search "weather <city>" or "flight <number>"',
        icon: { kind: 'glyph', name: 'globe' },
        actions: [
          {
            id: 'view',
            title: 'Check Local Weather',
            shortcut: '↵',
            run: async () => {
              const res = await weather.getWeather('Local');
              if (res.ok) clipboard.writeText(`${res.city}: ${res.tempC}°C (${res.tempF}°F), ${res.condition}`);
              return res;
            }
          }
        ]
      }
    ],
    async search(query) {
      const q = String(query || '').trim();
      const items = [];

      // Weather search
      const wMatch = q.match(/^(?:weather(?:\s+in|\s+for)?)\s*(.*)$/i);
      if (wMatch) {
        const city = wMatch[1].trim() || 'New York';
        const res = await weather.getWeather(city);
        if (res.ok) {
          items.push({
            id: `weather:${res.city}`,
            provider: 'weather',
            group: 'Weather',
            title: `${res.city} — ${res.tempC}°C (${res.tempF}°F)`,
            subtitle: `${res.icon || '⛅'} ${res.condition} · Humidity: ${res.humidity}% · Wind: ${res.windKm} km/h`,
            city: res.city,
            tempFormatted: `${res.tempC}°C / ${res.tempF}°F`,
            condition: res.condition,
            humidity: `${res.humidity}%`,
            wind: `${res.windKm} km/h`,
            scoreBoost: 250,
            icon: { kind: 'glyph', name: 'globe' },
            actions: [
              {
                id: 'copy',
                title: 'Copy Weather Forecast',
                shortcut: '↵',
                run: () => clipboard.writeText(`${res.city}: ${res.tempC}°C (${res.tempF}°F), ${res.condition}`)
              }
            ]
          });
        }
      }

      // Flight tracker search
      const fMatch = q.match(/^(?:flight)\s+(.+)$/i);
      if (fMatch) {
        const fl = weather.getFlight(fMatch[1].trim());
        if (fl.ok && fl.flight) {
          const f = fl.flight;
          items.push({
            id: `flight:${f.flight}`,
            provider: 'weather',
            group: 'Weather',
            title: `${f.airline} ${f.flight}: ${f.from} → ${f.to}`,
            subtitle: `Status: ${f.status} · ETA: ${f.eta} · Aircraft: ${f.aircraft}`,
            scoreBoost: 250,
            icon: { kind: 'glyph', name: 'globe' },
            actions: [
              {
                id: 'copy',
                title: 'Copy Flight Details',
                shortcut: '↵',
                run: () => clipboard.writeText(`${f.airline} ${f.flight}: ${f.from} -> ${f.to} (${f.status})`)
              }
            ]
          });
        }
      }

      return items;
    }
  };
}

// ============================================================ provider: navigation


function navigationProvider() {
  return {
    id: 'navigation',
    name: 'Navigation',
    group: 'Navigation',
    warm: navigation.fetchWindows,
    all: () => {
      const wins = navigation.getWindowsSync();
      return wins.slice(0, 10).map((w) => ({
        id: `win:${w.handle}`,
        provider: 'navigation',
        group: 'Navigation',
        title: w.title,
        subtitle: `App: ${w.processName} · PID: ${w.pid}`,
        processName: w.processName,
        pid: w.pid,
        icon: { kind: 'glyph', name: 'app' },
        actions: [
          { id: 'switch', title: `Switch to ${w.title}`, shortcut: '↵', run: () => navigation.focusWindow(w.handle) },
          { id: 'close', title: 'Close Window', shortcut: 'Ctrl+W', run: () => navigation.closeWindow(w.handle) }
        ]
      }));
    },
    search(query) {
      const q = String(query || '').trim().toLowerCase();
      if (!q) return [];
      const isSwitchQuery = q.startsWith('switch') || q.startsWith('win ') || q.startsWith('window ');
      const filter = isSwitchQuery ? q.replace(/^(switch|win|window)\s*/i, '').trim() : q;

      const wins = navigation.getWindowsSync();
      const matches = isSwitchQuery
        ? (filter ? wins.filter((w) => w.title.toLowerCase().includes(filter) || w.processName.toLowerCase().includes(filter)) : wins)
        : wins.filter((w) => w.title.toLowerCase().includes(q) || w.processName.toLowerCase().includes(q)).slice(0, 5);

      return matches.map((w) => ({
        id: `win:${w.handle}`,
        provider: 'navigation',
        group: 'Navigation',
        title: w.title,
        subtitle: `App: ${w.processName} · PID: ${w.pid}`,
        processName: w.processName,
        pid: w.pid,
        scoreBoost: isSwitchQuery ? 220 : 30,
        icon: { kind: 'glyph', name: 'app' },
        actions: [
          { id: 'switch', title: `Switch to ${w.title}`, shortcut: '↵', run: () => navigation.focusWindow(w.handle) },
          { id: 'close', title: 'Close Window', shortcut: 'Ctrl+W', run: () => navigation.closeWindow(w.handle) }
        ]
      }));
    }
  };
}

// ============================================================ provider: screen awareness


module.exports = {
  translatorProvider,
  dictionaryProvider,
  focusProvider,
  calendarProvider,
  contactsProvider,
  typingPracticeProvider,
  weatherProvider,
  navigationProvider
};
