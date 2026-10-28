'use strict';

const settings = require('./settings');

async function askAi(prompt, systemInstruction = '') {
  const conf = settings.getSettings();
  const provider = conf.aiProvider || 'ollama';
  const model = conf.aiModel || 'llama3.2';
  const endpoint = conf.aiEndpoint || 'http://localhost:11434';
  const apiKey = conf.aiApiKey || '';

  const messages = [];
  if (systemInstruction) {
    messages.push({ role: 'system', content: systemInstruction });
  }
  messages.push({ role: 'user', content: prompt });

  try {
    if (provider === 'ollama') {
      const url = `${endpoint.replace(/\/+$/, '')}/api/chat`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          stream: false
        }),
        signal: AbortSignal.timeout(20000)
      });
      if (!res.ok) {
        return { ok: false, error: `Ollama returned HTTP ${res.status}: ${res.statusText}` };
      }
      const data = await res.json();
      return { ok: true, answer: data.message?.content || data.response || 'No response' };
    }

    // OpenAI / OpenRouter / Compatible
    const url = endpoint.includes('/chat/completions') ? endpoint : `${endpoint.replace(/\/+$/, '')}/v1/chat/completions`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.7
      }),
      signal: AbortSignal.timeout(25000)
    });
    if (!res.ok) {
      return { ok: false, error: `AI service returned HTTP ${res.status}: ${res.statusText}` };
    }
    const data = await res.json();
    const answer = data.choices?.[0]?.message?.content || 'No response';
    return { ok: true, answer };
  } catch (err) {
    return {
      ok: false,
      error: `Could not reach AI provider (${provider} at ${endpoint}). Ensure the server is running or configure API key in Settings.`
    };
  }
}

module.exports = {
  askAi
};
