'use strict';

const store = require('./store');

const PASSAGES = [
  {
    id: 'p-1',
    author: 'Linus Torvalds',
    text: 'Talk is cheap. Show me the code.'
  },
  {
    id: 'p-2',
    author: 'Alan Kay',
    text: 'The best way to predict the future is to invent it.'
  },
  {
    id: 'p-3',
    author: 'Donald Knuth',
    text: 'Premature optimization is the root of all evil in programming.'
  },
  {
    id: 'p-4',
    author: 'Steve Jobs',
    text: 'Stay hungry, stay foolish. Simplicity is the ultimate sophistication.'
  },
  {
    id: 'p-5',
    author: 'Edsger Dijkstra',
    text: 'Simplicity is prerequisite for reliability. If debugging is the art of removing bugs, then programming must be the art of inserting them.'
  },
  {
    id: 'p-6',
    author: 'Grace Hopper',
    text: 'The most dangerous phrase in the language is: we have always done it this way.'
  }
];

let activeSession = null;

function getRandomPassage() {
  const idx = Math.floor(Math.random() * PASSAGES.length);
  return PASSAGES[idx];
}

function startSession(passageId = null) {
  const p = passageId ? PASSAGES.find((item) => item.id === passageId) || getRandomPassage() : getRandomPassage();
  activeSession = {
    passageId: p.id,
    author: p.author,
    text: p.text,
    startedAt: Date.now(),
    typed: '',
    completed: false,
    wpm: 0,
    accuracy: 100
  };
  return activeSession;
}

function evaluateInput(typedText) {
  if (!activeSession) startSession();
  const target = activeSession.text;
  const typed = String(typedText || '');
  activeSession.typed = typed;

  let correctCount = 0;
  for (let i = 0; i < typed.length && i < target.length; i++) {
    if (typed[i] === target[i]) correctCount++;
  }

  const elapsedSeconds = Math.max(1, (Date.now() - activeSession.startedAt) / 1000);
  const minutes = elapsedSeconds / 60;
  const wordsTyped = correctCount / 5;
  const wpm = Math.round(wordsTyped / minutes);
  const accuracy = typed.length > 0 ? Math.round((correctCount / typed.length) * 100) : 100;
  const isComplete = typed === target;

  activeSession.wpm = wpm;
  activeSession.accuracy = accuracy;
  activeSession.completed = isComplete;

  if (isComplete) {
    saveScore(wpm, accuracy);
  }

  return {
    ...activeSession,
    correctCount,
    totalTargetLength: target.length,
    remainingChars: Math.max(0, target.length - typed.length)
  };
}

function saveScore(wpm, accuracy) {
  const highScores = store.read('typing_scores', []) || [];
  highScores.push({
    wpm,
    accuracy,
    date: new Date().toISOString()
  });
  highScores.sort((a, b) => b.wpm - a.wpm);
  store.write('typing_scores', highScores.slice(0, 20));
}

function getBestScore() {
  const highScores = store.read('typing_scores', []) || [];
  return highScores[0] || { wpm: 0, accuracy: 100 };
}

module.exports = {
  PASSAGES,
  startSession,
  evaluateInput,
  getBestScore
};
