// Flashcards: deck list, deck browser, and the SRS review session.
import { h, badge, toast } from '../ui.js';
import { allModules, getDeck, MODULE_CODES } from '../data.js';
import { grade, isDue, isNew, previewIntervals } from '../srs.js';
import { srsAll, bumpActivity, getSetting, setSetting } from '../store.js';

export async function renderCards(main) {
  main.className = 'view-cards';
  main.append(h('header', { class: 'page-head' }, h('h1', {}, 'Flashcards')));

  let dueTotal = 0, newTotal = 0;
  const rows = [];
  for (const mod of await allModules()) {
    const deck = await getDeck(mod.dir);
    if (!deck || !deck.cards.length) continue;
    const due = deck.cards.filter((c) => isDue(c.id)).length;
    const fresh = deck.cards.filter((c) => isNew(c.id)).length;
    dueTotal += due; newTotal += fresh;
    rows.push(
      h('div', { class: 'card deck-card', style: `--accent:${mod.area.accent}` },
        h('a', { class: 'deck-main', href: `#/deck/${mod.dir}` },
          badge(MODULE_CODES[mod.dir] || '', mod.area.accent),
          h('div', { class: 'deck-txt' },
            h('div', { class: 'deck-title' }, deck.title),
            h('div', { class: 'deck-sub' }, `${deck.cards.length} cards · ${due} due · ${fresh} new`))),
        (due || fresh)
          ? h('a', { class: 'btn btn-sm btn-accent', href: `#/review/${mod.dir}` }, due ? `Review ${due}` : 'Learn')
          : h('span', { class: 'deck-done' }, '✓')));
  }

  main.append(
    h('a', { class: 'card cta-card', href: '#/review' },
      h('div', { class: 'cta-label' }, 'Spaced repetition'),
      h('div', { class: 'cta-title' }, dueTotal ? `${dueTotal} cards due` : newTotal ? `${newTotal} new cards to learn` : 'All caught up 🎉'),
      h('div', { class: 'cta-sub' }, 'Review across all decks')),
    h('h2', { class: 'section-head' }, 'Decks'),
    h('div', { class: 'stack' }, rows));
}

export async function renderDeck(main, moduleDir) {
  main.className = 'view-deck';
  const deck = await getDeck(moduleDir);
  if (!deck) {
    main.append(h('div', { class: 'empty-state' }, h('h2', {}, 'Deck not found')));
    return;
  }
  main.append(
    h('header', { class: 'page-head' },
      h('h1', {}, deck.title),
      h('a', { class: 'btn btn-sm btn-accent', href: `#/review/${moduleDir}` }, 'Study')));
  const list = h('div', { class: 'stack' });
  for (const c of deck.cards) {
    const st = srsAll()[c.id];
    list.append(
      h('details', { class: 'card browse-card' },
        h('summary', {},
          h('span', { class: 'browse-front', html: c.front }),
          h('span', { class: `srs-chip ${st ? (isDue(c.id) ? 'due' : 'ok') : 'new'}` }, st ? (isDue(c.id) ? 'due' : `${Math.round(st.ivl)}d`) : 'new')),
        h('div', { class: 'browse-back', html: c.back }),
        c.page ? h('a', { class: 'browse-link', href: `#/page/${c.page}` }, 'Source page →') : null));
  }
  main.append(list);
}

// ------------------------------------------------------------ review session
const NEW_PER_SESSION = 10;

export async function renderReview(main, moduleDir) {
  main.className = 'view-review';
  const mods = (await allModules()).filter((m) => !moduleDir || m.dir === moduleDir);

  // build queue: all due cards + up to N new
  const queue = [];
  const fresh = [];
  for (const mod of mods) {
    const deck = await getDeck(mod.dir);
    if (!deck) continue;
    for (const c of deck.cards) {
      const card = { ...c, deck: deck.title, accent: mod.area.accent };
      if (isDue(c.id)) queue.push(card);
      else if (isNew(c.id)) fresh.push(card);
    }
  }
  shuffle(queue);
  shuffle(fresh);
  const newCap = Number(getSetting('newPerSession', NEW_PER_SESSION));
  queue.push(...fresh.slice(0, newCap));

  if (!queue.length) {
    main.append(
      h('div', { class: 'empty-state' },
        h('h2', {}, 'Nothing to review'),
        h('p', {}, 'No cards are due right now. Come back later, or browse the decks.'),
        h('a', { class: 'btn', href: '#/cards' }, 'Decks')));
    return;
  }

  let done = 0;
  const total = queue.length;

  const head = h('header', { class: 'quiz-head' },
    h('a', { class: 'icon-btn quiz-close', href: '#/cards', 'aria-label': 'Exit review' }, '✕'),
    h('div', { class: 'quiz-progress' }, h('div', { class: 'quiz-progress-fill' })),
    h('span', { class: 'quiz-count' }));
  const body = h('div', { class: 'review-body' });
  main.append(head, body);
  const fill = head.querySelector('.quiz-progress-fill');
  const count = head.querySelector('.quiz-count');

  function show() {
    if (!queue.length) return finish();
    const c = queue[0];
    fill.style.width = `${(done / total) * 100}%`;
    count.textContent = `${done}/${total}`;
    body.innerHTML = '';

    const cardEl = h('div', { class: 'flash', style: `--accent:${c.accent}` },
      h('div', { class: 'flash-deck' }, c.deck, isNew(c.id) ? h('span', { class: 'srs-chip new' }, 'new') : null),
      h('div', { class: 'flash-front', html: c.front }),
      h('div', { class: 'flash-back hidden', html: c.back }),
      c.page ? h('a', { class: 'flash-src hidden', href: `#/page/${c.page}` }, 'Source page →') : null);

    const reveal = h('button', { class: 'btn btn-accent btn-wide', onclick: () => {
      cardEl.querySelector('.flash-back').classList.remove('hidden');
      const src = cardEl.querySelector('.flash-src');
      if (src) src.classList.remove('hidden');
      reveal.replaceWith(gradeRow(c));
    } }, 'Show answer');

    body.append(cardEl, reveal);
  }

  function gradeRow(c) {
    const iv = previewIntervals(c.id);
    const mk = (label, g, sub, cls) =>
      h('button', { class: `grade-btn ${cls}`, onclick: () => {
        const rec = grade(c.id, g);
        bumpActivity('cards');
        queue.shift();
        if (g === 0) {
          // requeue later in this session
          const pos = Math.min(queue.length, 5 + Math.floor(Math.random() * 3));
          queue.splice(pos, 0, c);
        } else {
          done++;
        }
        show();
      } }, h('span', {}, label), h('small', {}, sub));
    return h('div', { class: 'grade-row' },
      mk('Again', 0, iv.again, 'g-again'),
      mk('Hard', 1, iv.hard, 'g-hard'),
      mk('Good', 2, iv.good, 'g-good'),
      mk('Easy', 3, iv.easy, 'g-easy'));
  }

  function finish() {
    fill.style.width = '100%';
    body.innerHTML = '';
    body.append(
      h('div', { class: 'quiz-result' },
        h('div', { class: 'result-score' }, `${done}`),
        h('div', { class: 'result-msg' }, done === 1 ? 'card reviewed. See you tomorrow.' : 'cards reviewed. See you tomorrow.'),
        h('div', { class: 'result-actions' },
          h('a', { class: 'btn btn-accent', href: '#/' }, 'Home'),
          h('a', { class: 'btn', href: '#/cards' }, 'Decks'))));
  }

  show();
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
