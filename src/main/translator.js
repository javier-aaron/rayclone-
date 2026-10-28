'use strict';

const https = require('node:https');
const http = require('node:http');
const ai = require('./ai');

const LANGUAGES = [
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'es', name: 'Spanish', flag: '🇪🇸' },
  { code: 'fr', name: 'French', flag: '🇫🇷' },
  { code: 'de', name: 'German', flag: '🇩🇪' },
  { code: 'it', name: 'Italian', flag: '🇮🇹' },
  { code: 'pt', name: 'Portuguese', flag: '🇵🇹' },
  { code: 'ru', name: 'Russian', flag: '🇷🇺' },
  { code: 'zh', name: 'Chinese (Simplified)', flag: '🇨🇳' },
  { code: 'ja', name: 'Japanese', flag: '🇯🇵' },
  { code: 'ko', name: 'Korean', flag: '🇰🇷' },
  { code: 'ar', name: 'Arabic', flag: '🇸🇦' },
  { code: 'hi', name: 'Hindi', flag: '🇮🇳' },
  { code: 'nl', name: 'Dutch', flag: '🇳🇱' },
  { code: 'sv', name: 'Swedish', flag: '🇸🇪' },
  { code: 'pl', name: 'Polish', flag: '🇵🇱' },
  { code: 'tr', name: 'Turkish', flag: '🇹🇷' },
  { code: 'uk', name: 'Ukrainian', flag: '🇺🇦' },
  { code: 'vi', name: 'Vietnamese', flag: '🇻🇳' },
  { code: 'el', name: 'Greek', flag: '🇬🇷' },
  { code: 'he', name: 'Hebrew', flag: '🇮🇱' }
];

const LANG_MAP = new Map();
for (const l of LANGUAGES) {
  LANG_MAP.set(l.code.toLowerCase(), l);
  LANG_MAP.set(l.name.toLowerCase(), l);
}

// Built-in offline dictionary & phrasebook for common phrases
const OFFLINE_DICTIONARY = {
  'hello': { es: 'hola', fr: 'bonjour', de: 'hallo', it: 'ciao', pt: 'olá', ru: 'привет', zh: '你好', ja: 'こんにちは', ko: '안녕하세요', ar: 'مرحبا', hi: 'नमस्ते' },
  'good morning': { es: 'buenos días', fr: 'bonjour', de: 'guten morgen', it: 'buongiorno', pt: 'bom dia', ru: 'доброе утро', zh: '早上好', ja: 'おはようございます', ko: '좋은 아침', ar: 'صباح الخير', hi: 'सुप्रभात' },
  'good evening': { es: 'buenas tardes', fr: 'bonsoir', de: 'guten abend', it: 'buonasera', pt: 'boa noite', ru: 'добрый вечер', zh: '晚上好', ja: 'こんばんは', ko: '좋은 저녁', ar: 'مساء الخير', hi: 'शुभ संध्या' },
  'thank you': { es: 'gracias', fr: 'merci', de: 'danke', it: 'grazie', pt: 'obrigado', ru: 'спасибо', zh: '谢谢', ja: 'ありがとう', ko: '감사합니다', ar: 'شكرا لك', hi: 'धन्यवाद' },
  'thank you very much': { es: 'muchas gracias', fr: 'merci beaucoup', de: 'vielen dank', it: 'molte grazie', pt: 'muito obrigado', ru: 'большое спасибо', zh: '非常感谢', ja: 'どうもありがとうございます', ko: '대단히 감사합니다', ar: 'شكرا جزيلا', hi: 'बहुत बहुत धन्यवाद' },
  'you are welcome': { es: 'de nada', fr: 'de rien', de: 'gern geschehen', it: 'prego', pt: 'de nada', ru: 'пожалуйста', zh: '不客气', ja: 'どういたしまして', ko: '천만에요', ar: 'عفوا', hi: 'आपका स्वागत है' },
  'how are you': { es: '¿cómo estás?', fr: 'comment allez-vous?', de: 'wie geht es dir?', it: 'come stai?', pt: 'como vai você?', ru: 'как дела?', zh: '你好吗？', ja: 'お元気ですか？', ko: '어떻게 지내세요?', ar: 'كيف حالك؟', hi: 'आप कैसे हैं?' },
  'yes': { es: 'sí', fr: 'oui', de: 'ja', it: 'sì', pt: 'sim', ru: 'да', zh: '是', ja: 'はい', ko: '네', ar: 'نعم', hi: 'हाँ' },
  'no': { es: 'no', fr: 'non', de: 'nein', it: 'no', pt: 'não', ru: 'нет', zh: '不', ja: 'いいえ', ko: '아니요', ar: 'لا', hi: 'नहीं' },
  'please': { es: 'por favor', fr: 's\'il vous plaît', de: 'bitte', it: 'per favore', pt: 'por favor', ru: 'пожалуйста', zh: '请', ja: 'お願いします', ko: '부탁합니다', ar: 'من فضلك', hi: 'कृपया' },
  'goodbye': { es: 'adiós', fr: 'au revoir', de: 'auf wiedersehen', it: 'arrivederci', pt: 'adeus', ru: 'до свидания', zh: '再见', ja: 'さようなら', ko: '안녕히 가세요', ar: 'مع السلامة', hi: 'अलविदा' },
  'sorry': { es: 'lo siento', fr: 'désolé', de: 'entschuldigung', it: 'scusa', pt: 'desculpe', ru: 'извините', zh: '对不起', ja: 'ごめんなさい', ko: '미안합니다', ar: 'آسف', hi: 'माफ़ कीजिए' },
  'what is your name': { es: '¿cómo te llamas?', fr: 'comment vous appelez-vous?', de: 'wie heißt du?', it: 'come ti chiami?', pt: 'qual é o seu nome?', ru: 'как вас зовут?', zh: '你叫什么名字？', ja: 'お名前は何ですか？', ko: '이름이 무엇입니까?', ar: 'ما اسمك؟', hi: 'आपका नाम क्या है?' },
  'my name is': { es: 'mi nombre es', fr: 'je m\'appelle', de: 'mein name ist', it: 'mi chiamo', pt: 'meu nome é', ru: 'меня зовут', zh: '我的名字是', ja: '私の名前は', ko: '제 이름은', ar: 'اسمي', hi: 'मेरा नाम है' },
  'i love you': { es: 'te quiero', fr: 'je t\'aime', de: 'ich liebe dich', it: 'ti amo', pt: 'eu te amo', ru: 'я тебя люблю', zh: '我爱你', ja: '愛しています', ko: '사랑해요', ar: 'أحبك', hi: 'मैं तुमसे प्यार करता हूँ' },
  'help': { es: 'ayuda', fr: 'aide', de: 'hilfe', it: 'aiuto', pt: 'ajuda', ru: 'помощь', zh: '帮助', ja: '助けて', ko: '도움', ar: 'مساعدة', hi: 'मदद' },
  'welcome': { es: 'bienvenido', fr: 'bienvenue', de: 'willkommen', it: 'benvenuto', pt: 'bem-vindo', ru: 'добро пожаловать', zh: '欢迎', ja: 'ようこそ', ko: '환영합니다', ar: 'أهلا بك', hi: 'स्वागत है' }
};

function detectLanguage(text) {
  if (!text) return 'en';
  const str = String(text);

  // Check CJK
  if (/[\u3040-\u30ff]/.test(str)) return 'ja'; // Hiragana / Katakana
  if (/[\uac00-\ud7af]/.test(str)) return 'ko'; // Hangul
  if (/[\u4e00-\u9fa5]/.test(str)) return 'zh'; // Hanzi
  if (/[\u0600-\u06ff]/.test(str)) return 'ar'; // Arabic
  if (/[\u0400-\u04ff]/.test(str)) return 'ru'; // Cyrillic
  if (/[\u0900-\u097f]/.test(str)) return 'hi'; // Devanagari / Hindi
  if (/[\u0370-\u03ff]/.test(str)) return 'el'; // Greek

  // Spanish clues
  if (/[¡¿áéíóúñ]/i.test(str)) return 'es';
  // French clues
  if (/[àâçèêëîïôûù]/i.test(str)) return 'fr';
  // German clues
  if (/[äöüß]/i.test(str)) return 'de';
  // Portuguese clues
  if (/[ãõáéíóúâêôç]/i.test(str)) return 'pt';

  return 'en';
}

function resolveLang(identifier) {
  if (!identifier) return null;
  const clean = String(identifier).trim().toLowerCase();
  return LANG_MAP.get(clean) || null;
}

function fetchGoogleTranslate(text, sl, tl) {
  return new Promise((resolve, reject) => {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(tl)}&dt=t&q=${encodeURIComponent(text)}`;
    const req = https.get(url, { timeout: 3500 }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (Array.isArray(parsed) && Array.isArray(parsed[0])) {
            const translated = parsed[0].map((part) => part[0]).join('');
            const detectedSl = parsed[2] || sl;
            resolve({ ok: true, translated, detectedSl });
          } else {
            resolve({ ok: false, error: 'Unexpected response' });
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

async function translate(text, targetLang = 'es', sourceLang = 'auto') {
  const cleanText = String(text || '').trim();
  if (!cleanText) return { ok: false, error: 'Empty text' };

  const target = resolveLang(targetLang) || { code: 'es', name: 'Spanish', flag: '🇪🇸' };
  let source = sourceLang === 'auto' ? null : resolveLang(sourceLang);
  if (!source) {
    const detectedCode = detectLanguage(cleanText);
    source = resolveLang(detectedCode) || { code: 'en', name: 'English', flag: '🇬🇧' };
  }

  // Same language check
  if (source.code === target.code) {
    const fallbackTarget = source.code === 'en' ? 'es' : 'en';
    return translate(cleanText, fallbackTarget, source.code);
  }

  // 1. Try offline dictionary first for exact matches
  const normKey = cleanText.toLowerCase().replace(/[.?!,]+$/, '');
  if (OFFLINE_DICTIONARY[normKey] && OFFLINE_DICTIONARY[normKey][target.code]) {
    return {
      ok: true,
      sourceText: cleanText,
      translatedText: OFFLINE_DICTIONARY[normKey][target.code],
      sourceLang: source,
      targetLang: target,
      provider: 'offline'
    };
  }

  // 2. Try fast Google web translator endpoint
  try {
    const gRes = await fetchGoogleTranslate(cleanText, source.code, target.code);
    if (gRes.ok && gRes.translated) {
      const realSource = resolveLang(gRes.detectedSl) || source;
      return {
        ok: true,
        sourceText: cleanText,
        translatedText: gRes.translated,
        sourceLang: realSource,
        targetLang: target,
        provider: 'cloud'
      };
    }
  } catch {}

  // 3. Fallback to configured LLM (Ollama / OpenAI)
  try {
    const prompt = `Translate the following text from ${source.name} to ${target.name}. Output only the translation without quotes or commentary:\n\n${cleanText}`;
    const aiRes = await ai.askAi(prompt, 'You are a professional, accurate language translator. Return ONLY the direct translation.');
    if (aiRes.ok && aiRes.answer) {
      return {
        ok: true,
        sourceText: cleanText,
        translatedText: aiRes.answer.trim(),
        sourceLang: source,
        targetLang: target,
        provider: 'ai'
      };
    }
  } catch {}

  // 4. Fallback if offline and not in mini-dict
  return {
    ok: true,
    sourceText: cleanText,
    translatedText: `[${target.name}] ${cleanText}`,
    sourceLang: source,
    targetLang: target,
    provider: 'fallback'
  };
}

function parseTranslateQuery(query) {
  const q = String(query || '').trim();
  if (!q) return null;

  // Patterns:
  // 1. "translate <text> to/in/into <lang>"
  // 2. "tr <text> to/in/into <lang>"
  let m = q.match(/^(?:translate|tr)\s+(.+?)\s+(?:to|in|into)\s+([a-zA-Z\(\) ]+)$/i);
  if (m) {
    const text = m[1].trim();
    const lang = m[2].trim();
    const resolved = resolveLang(lang);
    if (resolved) {
      return { text, targetLang: resolved.code };
    }
  }

  // 3. "translate <lang>: <text>" or "translate <lang> <text>"
  m = q.match(/^(?:translate|tr)\s+([a-zA-Z]+)(?::|\s+)\s*(.+)$/i);
  if (m) {
    const potentialLang = resolveLang(m[1]);
    if (potentialLang) {
      return { text: m[2].trim(), targetLang: potentialLang.code };
    }
  }

  // 4. "translate: <text>" or "tr: <text>"
  m = q.match(/^(?:translate|tr):\s*(.+)$/i);
  if (m) {
    return { text: m[1].trim(), targetLang: 'es' };
  }

  // 5. "translate <text>"
  m = q.match(/^(?:translate|tr)\s+(.+)$/i);
  if (m) {
    return { text: m[1].trim(), targetLang: 'es' };
  }

  return null;
}

module.exports = {
  LANGUAGES,
  detectLanguage,
  resolveLang,
  translate,
  parseTranslateQuery
};
