// Home: continue reading, due reviews, streak, area progress.
import { h, ring, icon, badge } from '../ui.js';
import { getManifest, pageById, flatPages, allModules, getDeck, MODULE_CODES } from '../data.js';
import { readPages, getLastPage, streak, allQuiz } from '../store.js';
import { isDue, isNew } from '../srs.js';

export async function renderHome(main) {
  main.className = 'view-home';
  const man = await getManifest();
  const flat = (await flatPages()).filter((p) => !p.missing && p.kind !== 'quiz');
  const read = readPages();

  // hero
  const nRead = flat.filter((p) => read[p.id]).length;
  const st = streak();
  main.append(
    h('header', { class: 'home-hero' },
      h('div', { class: 'eyebrow' }, 'CS145 · Modern Data Systems'),
      h('h1', {}, 'Study'),
      h('div', { class: 'hero-stats' },
        h('span', {}, h('strong', {}, String(nRead)), ` / ${flat.length} pages`),
        h('span', {}, h('strong', {}, String(st)), st === 1 ? ' day streak' : ' day streak'))));

  // continue reading
  const last = getLastPage();
  let target = null;
  if (last) {
    const cur = await pageById(last);
    if (cur) {
      // next unread page from the last visited one
      const i = flat.findIndex((p) => p.id === last);
      target = !read[last] ? cur : flat.slice(i + 1).find((p) => !read[p.id]) || cur;
    }
  }
  if (!target) target = flat.find((p) => !read[p.id]) || flat[0];
  if (target) {
    main.append(
      h('a', { class: 'card cta-card', href: `#/page/${target.id}` },
        h('div', { class: 'cta-label' }, last && !read[last] ? 'Continue reading' : 'Up next'),
        h('div', { class: 'cta-title' },
          badge(MODULE_CODES[target.mod.dir] || '', target.area.accent),
          ' ', target.title),
        h('div', { class: 'cta-sub' }, `${target.mod.title} · ${target.sec.title}`)));
  }

  // due reviews
  const mods = await allModules();
  let due = 0, fresh = 0;
  for (const mod of mods) {
    const deck = await getDeck(mod.dir);
    if (!deck) continue;
    for (const c of deck.cards) {
      if (isDue(c.id)) due++;
      else if (isNew(c.id)) fresh++;
    }
  }
  main.append(
    h('div', { class: 'row-2' },
      h('a', { class: 'card stat-card', href: '#/review' },
        h('div', { class: 'stat-big' }, String(due)),
        h('div', { class: 'stat-label' }, 'cards due'),
        h('div', { class: 'stat-hint' }, due ? 'Review now →' : fresh ? `${fresh} new waiting` : 'All caught up')),
      h('a', { class: 'card stat-card', href: '#/practice' },
        h('div', { class: 'stat-big' }, String(quizzesTaken())),
        h('div', { class: 'stat-label' }, 'quiz runs'),
        h('div', { class: 'stat-hint' }, 'Practice →'))));

  // areas
  const grid = h('div', { class: 'area-grid' });
  for (const area of man.areas) {
    const pages = flat.filter((p) => p.area.id === area.id);
    const done = pages.filter((p) => read[p.id]).length;
    grid.append(
      h('a', { class: 'card area-card', href: `#/learn`, style: `--accent:${area.accent}` },
        ring(pages.length ? done / pages.length : 0, 40, 4, area.accent),
        h('div', { class: 'area-card-txt' },
          h('div', { class: 'area-card-title' }, area.title),
          h('div', { class: 'area-card-sub' }, `${done}/${pages.length} pages`))));
  }
  main.append(h('h2', { class: 'section-head' }, 'Course areas'), grid);

  main.append(
    h('div', { class: 'row-2' },
      h('a', { class: 'card mini-cta', href: '#/viz' }, icon('viz'), ' Interactive demos'),
      h('a', { class: 'card mini-cta', href: '#/search' }, icon('search'), ' Search the course')));
}

function quizzesTaken() {
  let n = 0;
  for (const q of Object.values(allQuiz())) n += q.attempts.length;
  return n;
}
