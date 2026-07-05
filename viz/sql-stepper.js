// SQL Query Stepper — step a query clause-by-clause over the course's Spotify
// tables, showing the working set after each stage (FROM → WHERE → GROUP BY →
// HAVING → SELECT → ORDER BY).
import { h } from '../app/ui.js';

const USERS = [
  { user_id: 1, name: 'Mickey' }, { user_id: 2, name: 'Minnie' },
  { user_id: 3, name: 'Daffy' }, { user_id: 4, name: 'Pluto' },
];
const LISTENS = [
  { listen_id: 1, user_id: 1, song_id: 101, rating: 4.5 },
  { listen_id: 2, user_id: 1, song_id: 102, rating: 4.2 },
  { listen_id: 3, user_id: 1, song_id: 103, rating: 3.9 },
  { listen_id: 4, user_id: 2, song_id: 101, rating: 4.7 },
  { listen_id: 5, user_id: 2, song_id: 104, rating: 4.6 },
  { listen_id: 6, user_id: 2, song_id: 102, rating: 3.9 },
  { listen_id: 7, user_id: 3, song_id: 105, rating: 2.9 },
  { listen_id: 8, user_id: 3, song_id: 101, rating: 4.9 },
  { listen_id: 9, user_id: 3, song_id: 103, rating: null },
];
const USER_COLOR = { 1: 'blue', 2: 'orange', 3: 'purple', 4: 'green' };

const QUERIES = [
  {
    name: 'Filter + project',
    sql: ['SELECT user_id, song_id, rating', 'FROM Listens', 'WHERE rating > 4.0'],
    steps: [
      { clause: 'FROM Listens', note: 'Load the whole table: 9 rows.', run: () => LISTENS.slice() },
      { clause: 'WHERE rating > 4.0', note: 'Each row is tested alone. NULL > 4.0 is UNKNOWN — dropped too.', run: (rows) => rows.filter((r) => r.rating != null && r.rating > 4.0) },
      { clause: 'SELECT user_id, song_id, rating', note: 'Keep only the named columns.', run: (rows) => rows.map(({ user_id, song_id, rating }) => ({ user_id, song_id, rating })) },
    ],
  },
  {
    name: 'GROUP BY + HAVING',
    sql: ['SELECT user_id, AVG(rating) AS avg_r,', '       COUNT(*) AS n', 'FROM Listens', 'GROUP BY user_id', 'HAVING COUNT(*) >= 3'],
    steps: [
      { clause: 'FROM Listens', note: 'Load all 9 rows.', run: () => LISTENS.slice() },
      {
        clause: 'GROUP BY user_id', note: 'Rows collapse into one group per user.',
        run: (rows) => {
          const g = {};
          for (const r of rows) (g[r.user_id] ||= []).push(r);
          return Object.entries(g).map(([uid, rs]) => ({ user_id: +uid, _group: rs, n: rs.length }));
        },
      },
      { clause: 'HAVING COUNT(*) >= 3', note: 'HAVING filters whole groups (WHERE filters rows).', run: (rows) => rows.filter((r) => r.n >= 3) },
      {
        clause: 'SELECT user_id, AVG(rating), COUNT(*)', note: 'AVG skips NULLs: Daffy averages (2.9+4.9)/2, not /3.',
        run: (rows) => rows.map((r) => {
          const ratings = r._group.map((x) => x.rating).filter((x) => x != null);
          return { user_id: r.user_id, avg_r: (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(2), n: r.n };
        }),
      },
    ],
  },
  {
    name: 'JOIN',
    sql: ['SELECT name, rating', 'FROM Users u', 'JOIN Listens l', '  ON u.user_id = l.user_id', 'WHERE rating >= 4.5'],
    steps: [
      {
        clause: 'FROM Users JOIN Listens ON …', note: 'Match rows on user_id. Pluto has no listens → dropped by the inner join.',
        run: () => LISTENS.map((l) => ({ name: USERS.find((u) => u.user_id === l.user_id).name, user_id: l.user_id, rating: l.rating })),
      },
      { clause: 'WHERE rating >= 4.5', note: 'Filter the joined rows.', run: (rows) => rows.filter((r) => r.rating != null && r.rating >= 4.5) },
      { clause: 'SELECT name, rating', note: 'Project the two output columns.', run: (rows) => rows.map(({ name, rating }) => ({ name, rating })) },
    ],
  },
];

export function mount(root) {
  let qi = 0, si = -1;

  const tabs = h('div', { class: 'seg viz-tabs' });
  const sqlBox = h('pre', { class: 'stepper-sql' });
  const note = h('div', { class: 'stepper-note' });
  const table = h('div', { class: 'stepper-table' });
  const controls = h('div', { class: 'viz-controls' });

  const prevB = h('button', { class: 'btn', onclick: () => step(-1) }, '← Back');
  const nextB = h('button', { class: 'btn btn-accent', onclick: () => step(1) }, 'Run first clause');
  controls.append(prevB, nextB);

  QUERIES.forEach((q, i) => {
    tabs.append(h('button', {
      class: 'seg-btn' + (i === 0 ? ' active' : ''),
      onclick: (e) => {
        qi = i; si = -1;
        tabs.querySelectorAll('.seg-btn').forEach((b) => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        render();
      },
    }, q.name));
  });

  root.append(
    h('p', { class: 'viz-intro' }, 'You write SELECT first, but the database runs FROM first. Step through each clause and watch the working set shrink, group, and project.'),
    tabs, sqlBox, controls, note, table);

  function step(d) {
    const q = QUERIES[qi];
    si = Math.max(-1, Math.min(q.steps.length - 1, si + d));
    render();
  }

  function render() {
    const q = QUERIES[qi];
    // SQL with the active clause highlighted
    sqlBox.innerHTML = '';
    const active = si >= 0 ? q.steps[si].clause : null;
    for (const line of q.sql) {
      const el = h('div', { class: 'sql-line' }, line);
      if (active && clauseMatchesLine(active, line)) el.classList.add('active');
      sqlBox.append(el);
    }
    // rows after step si
    let rows = null;
    if (si >= 0) {
      rows = q.steps[0].run();
      for (let k = 1; k <= si; k++) rows = q.steps[k].run(rows);
    }
    note.textContent = si < 0
      ? 'Press “Run first clause”. Execution order ≠ writing order.'
      : `${si + 1}. ${q.steps[si].clause} — ${q.steps[si].note}`;
    renderTable(rows);

    prevB.disabled = si < 0;
    nextB.disabled = si >= q.steps.length - 1;
    nextB.textContent = si < 0 ? 'Run first clause' : si >= q.steps.length - 1 ? 'Done' : 'Next clause →';
  }

  function renderTable(rows) {
    table.innerHTML = '';
    if (!rows) {
      table.append(h('div', { class: 'stepper-empty' }, 'No clause has run yet.'));
      return;
    }
    if (!rows.length) {
      table.append(h('div', { class: 'stepper-empty' }, '0 rows'));
      return;
    }
    const cols = Object.keys(rows[0]).filter((c) => c !== '_group');
    const t = h('table', { class: 'mini-table' },
      h('thead', {}, h('tr', {}, h('th', { class: 'color-bar' }), cols.map((c) => h('th', {}, c)))),
      h('tbody', {},
        rows.map((r) => h('tr', {},
          h('td', { class: `color-bar ${USER_COLOR[r.user_id] || ''}` }),
          cols.map((c) => h('td', {}, r[c] == null ? h('span', { class: 'null-value' }, 'NULL') : String(r[c])))))));
    table.append(t, h('div', { class: 'stepper-count' }, `${rows.length} row${rows.length === 1 ? '' : 's'}`));
  }

  function clauseMatchesLine(clause, line) {
    const key = clause.split(' ')[0];  // FROM / WHERE / GROUP / HAVING / SELECT
    return line.trim().toUpperCase().startsWith(key.toUpperCase()) ||
      (key === 'FROM' && /JOIN|ON/.test(line));
  }

  render();
}
