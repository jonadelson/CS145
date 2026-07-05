// Full-text search over the embedded course content.
import { h, esc, badge } from '../ui.js';
import { getSearchIndex } from '../data.js';

export async function renderSearch(main, initial = '') {
  main.className = 'view-search';
  const input = h('input', {
    class: 'search-input', type: 'search', placeholder: 'Search the whole course…',
    value: initial, autocomplete: 'off', autocapitalize: 'off',
  });
  const results = h('div', { class: 'search-results' });
  main.append(
    h('header', { class: 'page-head' }, h('h1', {}, 'Search')),
    input, results);

  const index = await getSearchIndex();

  let t;
  input.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => run(input.value), 120);
  });
  input.focus();
  if (initial) run(initial);

  function run(qraw) {
    const q = qraw.trim().toLowerCase();
    results.innerHTML = '';
    if (q.length < 2) return;
    const terms = q.split(/\s+/).filter(Boolean);
    const scored = [];
    for (const doc of index) {
      let score = 0;
      const title = doc.title.toLowerCase();
      const heads = doc.headings.join(' ').toLowerCase();
      const text = doc.text.toLowerCase();
      for (const term of terms) {
        if (title.includes(term)) score += 6;
        if (heads.includes(term)) score += 3;
        const n = countOcc(text, term);
        if (n) score += Math.min(3, 1 + Math.log2(n));
        else if (!title.includes(term) && !heads.includes(term)) { score = 0; break; } // AND semantics
      }
      if (score > 0) scored.push({ doc, score });
    }
    scored.sort((a, b) => b.score - a.score);
    if (!scored.length) {
      results.append(h('p', { class: 'muted' }, 'No matches.'));
      return;
    }
    for (const { doc } of scored.slice(0, 25)) {
      results.append(
        h('a', { class: 'card search-hit', href: `#/page/${doc.id}` },
          h('div', { class: 'hit-title' }, doc.title),
          h('div', { class: 'hit-mod' }, doc.module),
          h('div', { class: 'hit-snippet', html: snippet(doc.text, terms) })));
    }
  }
}

function countOcc(text, term) {
  let n = 0, i = 0;
  for (;;) {
    i = text.indexOf(term, i);
    if (i < 0) return n;
    n++; i += term.length;
  }
}

function snippet(text, terms) {
  const lower = text.toLowerCase();
  let pos = -1;
  for (const t of terms) { pos = lower.indexOf(t); if (pos >= 0) break; }
  if (pos < 0) pos = 0;
  const start = Math.max(0, pos - 60);
  let s = (start > 0 ? '…' : '') + text.slice(start, start + 220) + '…';
  s = esc(s);
  for (const t of terms) {
    s = s.replace(new RegExp(`(${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), '<mark>$1</mark>');
  }
  return s;
}
