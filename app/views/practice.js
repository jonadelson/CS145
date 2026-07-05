// Practice: quiz hub, module quiz sessions, problem-set sessions.
import { h, badge, bar } from '../ui.js';
import { allModules, getQuizBank, getPsets, MODULE_CODES } from '../data.js';
import { quizState, recordQuizAttempt } from '../store.js';

const PSET_TITLES = { m1: 'PSET 1 · SQL', m2: 'PSET 2 · Systems', m3: 'PSET 3 · Storage & Indexing', m4: 'PSET 4 · Transactions' };

export async function renderPractice(main) {
  main.className = 'view-practice';
  main.append(h('header', { class: 'page-head' }, h('h1', {}, 'Practice')));

  main.append(h('h2', { class: 'section-head' }, 'Module quizzes'));
  const list = h('div', { class: 'stack' });
  for (const mod of await allModules()) {
    const bank = await getQuizBank(mod.dir);
    if (!bank || !bank.questions.length) continue;
    const st = quizState(mod.dir);
    const best = st.attempts.reduce((b, a) => Math.max(b, a.correct / a.total), 0);
    const missed = missedIds(mod.dir, bank).length;
    list.append(
      h('a', { class: 'card quiz-card', href: `#/quiz/${mod.dir}`, style: `--accent:${mod.area.accent}` },
        h('div', { class: 'quiz-card-top' },
          badge(MODULE_CODES[mod.dir] || '', mod.area.accent),
          h('span', { class: 'quiz-card-title' }, bank.title),
          h('span', { class: 'quiz-card-n' }, `${bank.questions.length} q`)),
        st.attempts.length
          ? h('div', { class: 'quiz-card-meta' },
              bar(best, mod.area.accent),
              h('span', {}, `best ${Math.round(best * 100)}% · ${st.attempts.length} run${st.attempts.length > 1 ? 's' : ''}${missed ? ` · ${missed} missed` : ''}`))
          : h('div', { class: 'quiz-card-meta muted' }, 'Not attempted yet')));
  }
  main.append(list);

  const psets = await getPsets();
  main.append(h('h2', { class: 'section-head' }, 'Problem sets', h('span', { class: 'head-hint' }, 'real course PSETs')));
  const pl = h('div', { class: 'stack' });
  for (const [pid, qs] of Object.entries(psets)) {
    const st = quizState(`pset-${pid}`);
    const best = st.attempts.reduce((b, a) => Math.max(b, a.correct / a.total), 0);
    pl.append(
      h('a', { class: 'card quiz-card', href: `#/pset/${pid}` },
        h('div', { class: 'quiz-card-top' },
          h('span', { class: 'quiz-card-title' }, PSET_TITLES[pid] || pid),
          h('span', { class: 'quiz-card-n' }, `${qs.length} q`)),
        st.attempts.length
          ? h('div', { class: 'quiz-card-meta' }, bar(best), h('span', {}, `best ${Math.round(best * 100)}%`))
          : h('div', { class: 'quiz-card-meta muted' }, 'Not attempted yet')));
  }
  main.append(pl);
}

function missedIds(bankId, bank) {
  const perQ = quizState(bankId).perQ;
  return bank.questions.filter((q) => perQ[q.id] && perQ[q.id].w > perQ[q.id].r).map((q) => q.id);
}

// --------------------------------------------------------------- quiz session
export async function renderQuiz(main, moduleDir, { missedOnly = false } = {}) {
  const bank = await getQuizBank(moduleDir);
  if (!bank) {
    main.append(h('div', { class: 'empty-state' }, h('h2', {}, 'No quiz for this module yet')));
    return;
  }
  let qs = bank.questions.slice();
  if (missedOnly) {
    const ids = new Set(missedIds(moduleDir, bank));
    qs = qs.filter((q) => ids.has(q.id));
  } else {
    // weight unseen + previously-missed questions first, take 10
    const perQ = quizState(moduleDir).perQ;
    const rank = (q) => {
      const s = perQ[q.id];
      if (!s) return 0 + Math.random();               // unseen first
      if (s.w > s.r) return 1 + Math.random();        // struggling next
      return 2 + Math.random();                       // mastered last
    };
    qs.sort((a, b) => rank(a) - rank(b));
    qs = qs.slice(0, 10);
    shuffle(qs);
  }
  runSession(main, { id: moduleDir, title: bank.title, questions: qs, retryHref: `#/quiz/${moduleDir}` });
}

export async function renderPset(main, pid) {
  const psets = await getPsets();
  const qs = (psets[pid] || []).filter((q) => q.correct != null);
  if (!qs.length) {
    main.append(h('div', { class: 'empty-state' }, h('h2', {}, 'Problem set not found')));
    return;
  }
  runSession(main, { id: `pset-${pid}`, title: PSET_TITLES[pid] || pid, questions: qs, retryHref: `#/pset/${pid}`, ordered: true });
}

function runSession(main, { id, title, questions, retryHref, ordered = false }) {
  main.className = 'view-quiz';
  let i = 0;
  let correct = 0;
  const perQuestion = {};
  const results = [];

  const head = h('header', { class: 'quiz-head' },
    h('a', { class: 'icon-btn quiz-close', href: '#/practice', 'aria-label': 'Exit quiz' }, '✕'),
    h('div', { class: 'quiz-progress' }, h('div', { class: 'quiz-progress-fill' })),
    h('span', { class: 'quiz-count' }));
  const body = h('div', { class: 'quiz-body' });
  main.append(head, body);

  const fill = head.querySelector('.quiz-progress-fill');
  const count = head.querySelector('.quiz-count');

  function showQuestion() {
    const q = questions[i];
    fill.style.width = `${(i / questions.length) * 100}%`;
    count.textContent = `${i + 1}/${questions.length}`;
    body.innerHTML = '';

    const opts = q.options.map((_, oi) => oi);
    if (!ordered) shuffle(opts);

    const optEls = opts.map((oi) =>
      h('button', { class: 'opt', dataset: { oi }, onclick: () => pick(oi) },
        h('span', { class: 'opt-text', html: q.options[oi] })));

    body.append(
      q.category ? h('div', { class: 'quiz-cat' }, q.category, q.difficulty ? h('span', { class: `diff diff-${q.difficulty}` }, q.difficulty) : null) : null,
      h('div', { class: 'quiz-q', html: q.question }),
      h('div', { class: 'opts' }, optEls));

    let answered = false;
    function pick(oi) {
      if (answered) return;
      answered = true;
      const right = oi === q.correct;
      if (right) correct++;
      perQuestion[q.id] = right;
      results.push({ q, right });
      for (const el of optEls) {
        const eoi = Number(el.dataset.oi);
        el.disabled = true;
        if (eoi === q.correct) el.classList.add('correct');
        else if (eoi === oi) el.classList.add('wrong');
        else el.classList.add('dim');
      }
      const fb = h('div', { class: `feedback ${right ? 'ok' : 'no'}` },
        h('div', { class: 'feedback-head' }, right ? 'Correct' : 'Not quite'),
        q.explanation ? h('div', { class: 'feedback-body', html: q.explanation }) : null,
        q.page ? h('a', { class: 'feedback-link', href: `#/page/${q.page}` }, 'Reread this page →') : null,
        h('button', { class: 'btn btn-accent next-q', onclick: next }, i + 1 < questions.length ? 'Next question' : 'See results'));
      body.append(fb);
      fb.querySelector('.next-q').focus();
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    }
  }

  function next() {
    i++;
    if (i < questions.length) { window.scrollTo(0, 0); showQuestion(); }
    else finish();
  }

  function finish() {
    fill.style.width = '100%';
    count.textContent = '';
    recordQuizAttempt(id, correct, questions.length, perQuestion);
    body.innerHTML = '';
    const pct = correct / questions.length;
    const wrong = results.filter((r) => !r.right);
    body.append(
      h('div', { class: 'quiz-result' },
        h('div', { class: 'result-score' }, `${correct}/${questions.length}`),
        h('div', { class: 'result-msg' },
          pct === 1 ? 'Perfect. Onward.' : pct >= 0.8 ? 'Strong — almost there.' : pct >= 0.5 ? 'Good start. Review the misses below.' : 'Tough one. Reread the pages and retry.'),
        h('div', { class: 'result-actions' },
          h('a', { class: 'btn btn-accent', href: retryHref, onclick: () => setTimeout(() => location.reload(), 0) }, 'Try again'),
          h('a', { class: 'btn', href: '#/practice' }, 'All quizzes'))),
      wrong.length
        ? h('div', { class: 'result-misses' },
            h('h3', {}, 'Review your misses'),
            wrong.map(({ q }) =>
              h('div', { class: 'miss card' },
                h('div', { class: 'miss-q', html: q.question }),
                h('div', { class: 'miss-a', html: `<strong>Answer:</strong> ${q.options[q.correct]}` }),
                q.explanation ? h('div', { class: 'miss-e', html: q.explanation }) : null,
                q.page ? h('a', { href: `#/page/${q.page}` }, 'Open the page →') : null)))
        : null);
  }

  showQuestion();
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
