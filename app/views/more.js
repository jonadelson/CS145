// More: links hub + settings (theme, new-cards cap, about).
import { h, icon } from '../ui.js';
import { getSetting, setSetting } from '../store.js';
import { setTheme } from '../app.js';

export async function renderMore(main) {
  main.className = 'view-more';
  main.append(h('header', { class: 'page-head' }, h('h1', {}, 'More')));

  main.append(
    h('div', { class: 'stack' },
      h('a', { class: 'card mini-cta', href: '#/viz' }, icon('viz'), ' Interactive demos'),
      h('a', { class: 'card mini-cta', href: '#/search' }, icon('search'), ' Search'),
      h('a', { class: 'card mini-cta', href: '#/progress' }, icon('chart'), ' Progress & backups'),
      h('a', { class: 'card mini-cta', href: 'https://cs145.web.app', target: '_blank', rel: 'noopener' }, '↗ Original course site')));

  // theme
  const cur = getSetting('theme', 'auto');
  const seg = h('div', { class: 'seg' },
    ['auto', 'light', 'dark'].map((t) =>
      h('button', {
        class: 'seg-btn' + (t === cur ? ' active' : ''),
        onclick: (e) => {
          setTheme(t);
          seg.querySelectorAll('.seg-btn').forEach((b) => b.classList.remove('active'));
          e.currentTarget.classList.add('active');
        },
      }, t[0].toUpperCase() + t.slice(1))));

  // new cards per review session
  const cap = h('input', { type: 'number', min: 0, max: 50, value: getSetting('newPerSession', 10), class: 'num-input' });
  cap.addEventListener('change', () => setSetting('newPerSession', Math.max(0, Math.min(50, Number(cap.value) || 0))));

  main.append(
    h('h2', { class: 'section-head' }, 'Settings'),
    h('div', { class: 'card settings' },
      h('div', { class: 'setting-row' }, h('span', {}, 'Theme'), seg),
      h('div', { class: 'setting-row' }, h('span', {}, 'New cards per review'), cap)),
    h('p', { class: 'about muted' },
      'CS145 Study — a personal learning companion for the Modern Data Systems course. ',
      'Content embedded from ', h('a', { href: 'https://cs145.web.app', target: '_blank', rel: 'noopener' }, 'cs145.web.app'),
      '; videos stream from the course site. Progress is stored only in this browser.'));
}
