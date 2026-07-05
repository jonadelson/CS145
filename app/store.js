// Persistent app state (localStorage). One JSON blob, versioned key.
const KEY = 'cs145study.v1';

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

const state = Object.assign({
  readPages: {},     // pageId -> ts
  lastPage: null,    // pageId
  quiz: {},          // bankId -> {attempts:[{ts,correct,total}], perQ:{qid:{r,w}}}
  srs: {},           // cardId -> {ease,ivl,due,reps,lapses,intro}
  activity: {},      // 'YYYY-MM-DD' -> {read:n, quiz:n, cards:n}
  settings: {},      // {theme}
}, load());

function save() {
  // Synchronous: the state is small and a debounce can silently lose the
  // write when the user navigates away immediately after an action.
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
}

export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function bumpActivity(kind, n = 1) {
  const t = today();
  const a = state.activity[t] || (state.activity[t] = { read: 0, quiz: 0, cards: 0 });
  a[kind] = (a[kind] || 0) + n;
  save();
}

export function streak() {
  let n = 0;
  const d = new Date();
  for (;;) {
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const a = state.activity[k];
    if (a && (a.read || a.quiz || a.cards)) { n++; d.setDate(d.getDate() - 1); continue; }
    // today with no activity yet doesn't break the streak
    if (n === 0 && k === today()) { d.setDate(d.getDate() - 1); continue; }
    break;
  }
  return n;
}

export function markRead(pageId, on = true) {
  if (on && !state.readPages[pageId]) {
    state.readPages[pageId] = Date.now();
    bumpActivity('read');
  } else if (!on) {
    delete state.readPages[pageId];
  }
  save();
}
export const isRead = (pageId) => !!state.readPages[pageId];
export function setLastPage(pageId) { state.lastPage = pageId; save(); }
export const getLastPage = () => state.lastPage;
export const readCount = () => Object.keys(state.readPages).length;
export const readPages = () => state.readPages;

export function quizState(bankId) {
  return state.quiz[bankId] || (state.quiz[bankId] = { attempts: [], perQ: {} });
}
export function recordQuizAttempt(bankId, correct, total, perQuestion) {
  const q = quizState(bankId);
  q.attempts.push({ ts: Date.now(), correct, total });
  for (const [qid, right] of Object.entries(perQuestion)) {
    const s = q.perQ[qid] || (q.perQ[qid] = { r: 0, w: 0 });
    right ? s.r++ : s.w++;
  }
  bumpActivity('quiz');
  save();
}
export const allQuiz = () => state.quiz;

export function srsGet(cardId) { return state.srs[cardId]; }
export function srsSet(cardId, rec) { state.srs[cardId] = rec; save(); }
export const srsAll = () => state.srs;

export function setSetting(k, v) { state.settings[k] = v; save(); }
export function getSetting(k, dflt) { return state.settings[k] ?? dflt; }

export function exportState() { return JSON.stringify(state, null, 1); }
export function importState(json) {
  const obj = JSON.parse(json); // throws if invalid
  for (const k of ['readPages', 'lastPage', 'quiz', 'srs', 'activity', 'settings']) {
    if (k in obj) state[k] = obj[k];
  }
  save();
}
export function resetState() {
  for (const k of Object.keys(state)) delete state[k];
  Object.assign(state, { readPages: {}, lastPage: null, quiz: {}, srs: {}, activity: {}, settings: {} });
  save();
}
