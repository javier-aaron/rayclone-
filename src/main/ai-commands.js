'use strict';

const { clipboard } = require('electron');
const ai = require('./ai');

const PROMPT_TEMPLATES = [
  {
    id: 'ai-fix-grammar',
    title: 'Fix Grammar & Polish Writing',
    subtitle: 'Fix spelling, grammar, and improve tone of text',
    icon: '✍️',
    prompt: (text) => `Fix any spelling or grammar mistakes in the following text. Preserve the original meaning and tone, and return only the corrected text:\n\n${text}`
  },
  {
    id: 'ai-summarize-clip',
    title: 'Summarize Clipboard Content',
    subtitle: 'Generate concise bulleted summary of copied text',
    icon: '📝',
    prompt: (text) => `Summarize the following content into concise, clear bullet points:\n\n${text}`
  },
  {
    id: 'ai-explain-code',
    title: 'Explain Code',
    subtitle: 'Analyze code logic, edge cases, and time complexity',
    icon: '💡',
    prompt: (text) => `Explain what this code does, how it works, and highlight any potential bugs or performance bottlenecks:\n\n\`\`\`\n${text}\n\`\`\``
  },
  {
    id: 'ai-ts-types',
    title: 'Generate TypeScript Types',
    subtitle: 'Infer and generate clean TypeScript interfaces from JSON or JS',
    icon: '🔷',
    prompt: (text) => `Generate clean, strict TypeScript types or interfaces for the following JavaScript object or JSON data:\n\n${text}`
  },
  {
    id: 'ai-write-tests',
    title: 'Generate Unit Tests',
    subtitle: 'Create comprehensive test cases covering edge cases',
    icon: '🧪',
    prompt: (text) => `Write comprehensive unit test cases (using Node.js assert or Jest) for the following function or module:\n\n${text}`
  }
];

async function runAiCommand(templateId, inputText) {
  const template = PROMPT_TEMPLATES.find((t) => t.id === templateId);
  if (!template) return { ok: false, error: 'template not found' };

  let text = inputText;
  if (!text) {
    text = clipboard.readText();
  }
  if (!text || !text.trim()) {
    return { ok: false, error: 'No input text provided and clipboard is empty' };
  }

  const prompt = template.prompt(text);
  try {
    const response = await ai.ask(prompt);
    return { ok: true, prompt, response };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = {
  PROMPT_TEMPLATES,
  runAiCommand
};
