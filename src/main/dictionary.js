'use strict';

const https = require('node:https');

// Built-in offline dictionary database for instant local lookups
const OFFLINE_WORDS = {
  'serendipity': {
    phonetic: '/ˌsɛr.ənˈdɪp.ɪ.ti/',
    meanings: [{
      partOfSpeech: 'noun',
      definitions: [{
        definition: 'The occurrence and development of events by chance in a happy or beneficial way.',
        example: 'A fortunate stroke of serendipity led to the discovery of penicillin.',
        synonyms: ['chance', 'happy accident', 'fluke', 'providence', 'good fortune'],
        antonyms: ['misfortune', 'bad luck']
      }]
    }]
  },
  'ephemeral': {
    phonetic: '/ɪˈfɛm.ər.əl/',
    meanings: [{
      partOfSpeech: 'adjective',
      definitions: [{
        definition: 'Lasting for a very short time; transitory; fleeting.',
        example: 'Fashions are ephemeral, but true style is timeless.',
        synonyms: ['transitory', 'fleeting', 'short-lived', 'momentary', 'evanescent'],
        antonyms: ['permanent', 'eternal', 'everlasting', 'enduring']
      }]
    }]
  },
  'pragmatic': {
    phonetic: '/præɡˈmæt.ɪk/',
    meanings: [{
      partOfSpeech: 'adjective',
      definitions: [{
        definition: 'Dealing with things sensibly and realistically in a way that is based on practical rather than theoretical considerations.',
        example: 'A pragmatic approach to software architecture focuses on delivering value quickly.',
        synonyms: ['practical', 'sensible', 'realistic', 'utilitarian', 'matter-of-fact'],
        antonyms: ['idealistic', 'impractical', 'theoretical']
      }]
    }]
  },
  'resilient': {
    phonetic: '/rɪˈzɪl.jənt/',
    meanings: [{
      partOfSpeech: 'adjective',
      definitions: [{
        definition: 'Able to withstand or recover quickly from difficult conditions.',
        example: 'The distributed cluster is resilient against network partitions and node crashes.',
        synonyms: ['robust', 'tough', 'durable', 'tenacious', 'adaptable'],
        antonyms: ['fragile', 'vulnerable', 'weak']
      }]
    }]
  },
  'ubiquitous': {
    phonetic: '/juːˈbɪk.wɪ.təs/',
    meanings: [{
      partOfSpeech: 'adjective',
      definitions: [{
        definition: 'Present, appearing, or found everywhere.',
        example: 'Smartphones have become ubiquitous across the globe.',
        synonyms: ['omnipresent', 'pervasive', 'universal', 'worldwide'],
        antonyms: ['rare', 'scarce', 'isolated']
      }]
    }]
  },
  'eloquent': {
    phonetic: '/ˈɛl.ə.kwənt/',
    meanings: [{
      partOfSpeech: 'adjective',
      definitions: [{
        definition: 'Fluent or persuasive in speaking or writing.',
        example: 'She gave an eloquent speech advocating for open source software.',
        synonyms: ['articulate', 'expressive', 'fluent', 'persuasive', 'silver-tongued'],
        antonyms: ['inarticulate', 'hesitant']
      }]
    }]
  },
  'zenith': {
    phonetic: '/ˈzɛn.ɪθ/',
    meanings: [{
      partOfSpeech: 'noun',
      definitions: [{
        definition: 'The time at which something is most powerful or successful; the highest point.',
        example: 'The Roman empire was at the zenith of its power in the second century.',
        synonyms: ['peak', 'pinnacle', 'apex', 'culmination', 'summit'],
        antonyms: ['nadir', 'bottom', 'lowest point']
      }]
    }]
  },
  'meticulous': {
    phonetic: '/məˈtɪk.jə.ləs/',
    meanings: [{
      partOfSpeech: 'adjective',
      definitions: [{
        definition: 'Showing great attention to detail; very careful and precise.',
        example: 'He had always been so meticulous about his work and code hygiene.',
        synonyms: ['careful', 'diligent', 'thorough', 'scrupulous', 'painstaking'],
        antonyms: ['careless', 'sloppy', 'slapdash']
      }]
    }]
  },
  'panacea': {
    phonetic: '/ˌpæn.əˈsiː.ə/',
    meanings: [{
      partOfSpeech: 'noun',
      definitions: [{
        definition: 'A solution or remedy for all difficulties or diseases.',
        example: 'Microservices are not a panacea for all engineering challenges.',
        synonyms: ['universal cure', 'cure-all', 'magic bullet', 'elixir'],
        antonyms: []
      }]
    }]
  },
  'innovative': {
    phonetic: '/ˈɪn.ə.veɪ.tɪv/',
    meanings: [{
      partOfSpeech: 'adjective',
      definitions: [{
        definition: 'Featuring new methods; advanced and original.',
        example: 'Rayclone introduces an innovative workflow for power users.',
        synonyms: ['inventive', 'groundbreaking', 'cutting-edge', 'creative', 'novel'],
        antonyms: ['traditional', 'conventional', 'outdated']
      }]
    }]
  }
};

function fetchOnlineDefinition(word) {
  return new Promise((resolve, reject) => {
    const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`;
    const req = https.get(url, { timeout: 3000 }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (Array.isArray(parsed) && parsed.length > 0) {
            resolve({ ok: true, entry: parsed[0] });
          } else {
            resolve({ ok: false, error: 'Word not found' });
          }
        } catch (e) {
          resolve({ ok: false, error: e.message });
        }
      });
    });
    req.on('error', (err) => resolve({ ok: false, error: err.message }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'Request timeout' }); });
  });
}

async function defineWord(word) {
  const cleanWord = String(word || '').trim().toLowerCase().replace(/[^a-z\-]/g, '');
  if (!cleanWord) return { ok: false, error: 'No word provided' };

  // 1. Check local offline database first
  if (OFFLINE_WORDS[cleanWord]) {
    const offline = OFFLINE_WORDS[cleanWord];
    const syns = [];
    const ants = [];
    for (const m of offline.meanings) {
      for (const d of m.definitions) {
        if (d.synonyms) syns.push(...d.synonyms);
        if (d.antonyms) ants.push(...d.antonyms);
      }
    }
    return {
      ok: true,
      word: cleanWord,
      phonetic: offline.phonetic || '',
      meanings: offline.meanings,
      synonyms: [...new Set(syns)],
      antonyms: [...new Set(ants)],
      source: 'offline'
    };
  }

  // 2. Fetch from Free Dictionary API
  try {
    const online = await fetchOnlineDefinition(cleanWord);
    if (online.ok && online.entry) {
      const e = online.entry;
      const syns = [];
      const ants = [];
      const meanings = (e.meanings || []).map((m) => {
        const defs = (m.definitions || []).map((d) => {
          if (d.synonyms) syns.push(...d.synonyms);
          if (d.antonyms) ants.push(...d.antonyms);
          return {
            definition: d.definition,
            example: d.example || null,
            synonyms: d.synonyms || [],
            antonyms: d.antonyms || []
          };
        });
        return {
          partOfSpeech: m.partOfSpeech,
          definitions: defs
        };
      });

      return {
        ok: true,
        word: e.word || cleanWord,
        phonetic: e.phonetic || (e.phonetics && e.phonetics[0] && e.phonetics[0].text) || '',
        meanings,
        synonyms: [...new Set(syns)].slice(0, 10),
        antonyms: [...new Set(ants)].slice(0, 8),
        source: 'online'
      };
    }
  } catch {}

  // 3. Fallback generic response
  return {
    ok: false,
    word: cleanWord,
    error: `Definition for "${cleanWord}" not found`
  };
}

function parseDictionaryQuery(query) {
  const q = String(query || '').trim();
  if (!q) return null;

  // Pattern: "define <word>", "dict <word>", "thesaurus <word>", "synonyms <word>"
  const m = q.match(/^(?:define|dict|dictionary|thesaurus|synonyms|meaning\s+of)\s+([a-zA-Z\-]+)$/i);
  if (m) {
    return { word: m[1].toLowerCase() };
  }
  return null;
}

module.exports = {
  defineWord,
  parseDictionaryQuery,
  OFFLINE_WORDS
};
