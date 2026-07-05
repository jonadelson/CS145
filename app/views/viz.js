// Interactive demos: gallery + widget host. Widgets are lazy-loaded ES modules
// in ../viz/<id>.js exporting { mount(el) } and are fully self-contained.
import { h, icon } from '../ui.js';

export const WIDGETS = [
  { id: 'memory-hierarchy', title: 'Memory Hierarchy Explorer', blurb: 'Feel the latency cliffs: cache → RAM → SSD → HDD → network.', accent: '#334155', tag: 'M0 · M2', ready: false },
  { id: 'sql-stepper', title: 'SQL Query Stepper', blurb: 'Watch FROM → WHERE → GROUP BY → HAVING → SELECT run on the Spotify tables.', accent: '#3b82f6', tag: 'M1', ready: true },
  { id: 'joins-race', title: 'Join Algorithms Race', blurb: 'Nested-loop vs hash join, IO by IO.', accent: '#10b981', tag: 'M3', ready: false },
  { id: 'external-sort', title: 'External Merge Sort', blurb: 'Sort 100 GB with 1 GB of RAM: runs, merges, and IO cost.', accent: '#10b981', tag: 'M3', ready: false },
  { id: 'btree', title: 'B-Tree Playground', blurb: 'Insert keys, watch nodes split, trace a search from root to leaf.', accent: '#10b981', tag: 'M3B', ready: true },
  { id: 'lsm', title: 'LSM Tree / SSTables', blurb: 'Memtable flushes, compaction, and a read path with bloom filters.', accent: '#10b981', tag: 'M3B', ready: false },
  { id: 'schedules', title: 'Transaction Schedules', blurb: 'Interleave two transactions and test for conflicts & serializability.', accent: '#8b5cf6', tag: 'M4', ready: false },
  { id: 'hashring', title: 'Consistent Hashing Ring', blurb: 'Add and remove nodes; see how few keys move, and play with quorums.', accent: '#ec4899', tag: 'M5', ready: false },
];

export async function renderVizHub(main) {
  main.className = 'view-viz';
  main.append(h('header', { class: 'page-head' }, h('h1', {}, 'Interactive demos')));
  const grid = h('div', { class: 'stack' });
  for (const w of WIDGETS) {
    grid.append(
      h(w.ready ? 'a' : 'div', {
        class: 'card viz-card' + (w.ready ? '' : ' viz-soon'),
        href: w.ready ? `#/viz/${w.id}` : null,
        style: `--accent:${w.accent}`,
      },
        h('div', { class: 'viz-card-head' },
          h('span', { class: 'viz-tag' }, w.tag),
          h('span', { class: 'viz-title' }, w.title),
          w.ready ? null : h('span', { class: 'viz-soon-chip' }, 'soon')),
        h('div', { class: 'viz-blurb' }, w.blurb)));
  }
  main.append(grid);
}

export async function renderViz(main, id) {
  main.className = 'view-viz-widget';
  const meta = WIDGETS.find((w) => w.id === id && w.ready);
  if (!meta) {
    main.append(h('div', { class: 'empty-state' }, h('h2', {}, 'Demo not found'), h('a', { class: 'btn', href: '#/viz' }, 'All demos')));
    return;
  }
  main.style.setProperty('--accent', meta.accent);
  main.append(
    h('header', { class: 'reader-head' },
      h('a', { class: 'icon-btn', href: '#/viz', 'aria-label': 'All demos' }, icon('back')),
      h('div', { class: 'reader-head-txt' },
        h('div', { class: 'reader-crumb' }, meta.tag),
        h('div', { class: 'reader-sec' }, meta.title))));
  const host = h('div', { class: 'viz-host' });
  main.append(host);
  try {
    const mod = await import(`../../viz/${id}.js`);
    await mod.mount(host);
  } catch (err) {
    console.error(err);
    host.append(h('div', { class: 'empty-state' }, h('p', {}, 'This demo failed to load.'), h('p', { class: 'muted' }, String(err.message || err))));
  }
}
