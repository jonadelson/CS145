// App bootstrap + hash router + shell chrome.
import { h, icon } from './ui.js';
import { getSetting, setSetting } from './store.js';
import { renderHome } from './views/home.js';
import { renderLearn } from './views/learn.js';
import { renderReader } from './views/reader.js';
import { renderPractice, renderQuiz, renderPset } from './views/practice.js';
import { renderCards, renderDeck, renderReview } from './views/cards.js';
import { renderSearch } from './views/search.js';
import { renderProgress } from './views/progress.js';
import { renderVizHub, renderViz } from './views/viz.js';
import { renderMore } from './views/more.js';

const main = document.getElementById('view');

const routes = [
  [/^$/, () => renderHome(main)],
  [/^learn$/, () => renderLearn(main)],
  [/^page\/(.+)$/, (m) => renderReader(main, m[1])],
  [/^practice$/, () => renderPractice(main)],
  [/^quiz\/([^/]+)(?:\/(missed))?$/, (m) => renderQuiz(main, m[1], { missedOnly: !!m[2] })],
  [/^pset\/([^/]+)$/, (m) => renderPset(main, m[1])],
  [/^cards$/, () => renderCards(main)],
  [/^deck\/([^/]+)$/, (m) => renderDeck(main, m[1])],
  [/^review(?:\/([^/]+))?$/, (m) => renderReview(main, m[1] || null)],
  [/^search(?:\/(.*))?$/, (m) => renderSearch(main, m[1] ? decodeURIComponent(m[1]) : '')],
  [/^progress$/, () => renderProgress(main)],
  [/^viz$/, () => renderVizHub(main)],
  [/^viz\/([^/]+)$/, (m) => renderViz(main, m[1])],
  [/^more$/, () => renderMore(main)],
];

// Which bottom-nav tab each route belongs to.
function activeTab(hash) {
  if (hash === '' || hash === '/') return 'home';
  if (/^(learn|page|search)/.test(hash)) return 'learn';
  if (/^(practice|quiz|pset)/.test(hash)) return 'practice';
  if (/^(cards|deck|review)/.test(hash)) return 'review';
  return 'more';
}

async function route() {
  const raw = location.hash.replace(/^#\/?/, '');
  main.innerHTML = '';
  main.className = '';
  window.scrollTo(0, 0);
  for (const [re, fn] of routes) {
    const m = raw.match(re);
    if (m) {
      document.querySelectorAll('.tabbar a').forEach((a) => {
        a.classList.toggle('active', a.dataset.tab === activeTab(raw));
      });
      try {
        await fn(m);
      } catch (err) {
        console.error(err);
        main.append(
          h('div', { class: 'empty-state' },
            h('h2', {}, 'Something went wrong'),
            h('p', {}, String(err.message || err)),
            h('a', { class: 'btn', href: '#/' }, 'Back home')));
      }
      return;
    }
  }
  location.hash = '#/';
}

function buildShell() {
  const tabs = [
    ['home', '#/', 'Home', 'home'],
    ['learn', '#/learn', 'Learn', 'learn'],
    ['practice', '#/practice', 'Practice', 'practice'],
    ['review', '#/review', 'Review', 'review'],
    ['more', '#/more', 'More', 'more'],
  ];
  const bar = h('nav', { class: 'tabbar' },
    tabs.map(([tab, href, label, ic]) =>
      h('a', { href, dataset: { tab } }, icon(ic), h('span', {}, label))));
  document.body.append(bar);
}

function applyTheme() {
  const t = getSetting('theme', 'auto');
  document.documentElement.dataset.theme = t;
}
export function setTheme(t) {
  setSetting('theme', t);
  applyTheme();
}

applyTheme();
buildShell();
window.addEventListener('hashchange', route);
route();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
