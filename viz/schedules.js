// Transaction Schedules — interleave two transactions one action at a time,
// watch conflicts appear, build the conflict (precedence) graph, and run the
// cycle test for conflict-serializability (Module 4 · Correctness).
import { h } from '../app/ui.js';

// A = play_count(song 42), starts at 100. B = play_count(song 7), starts at 200.
// T1: Mickey plays song 42 then song 7. T2: Minnie plays song 42.
const TXNS = {
  1: [{ op: 'R', obj: 'A' }, { op: 'W', obj: 'A' }, { op: 'R', obj: 'B' }, { op: 'W', obj: 'B' }],
  2: [{ op: 'R', obj: 'A' }, { op: 'W', obj: 'A' }],
};
const TOTAL = TXNS[1].length + TXNS[2].length;
const INIT = { A: 100, B: 200 };

const PRESETS = [
  { name: 'Serial', seq: [1, 1, 1, 1, 2, 2], note: 'Preset: serial. All of T1, then all of T2 — one contiguous block each. Correct by definition, but zero overlap.' },
  { name: 'Serializable', seq: [1, 1, 2, 2, 1, 1], note: 'Preset: T2 slips in after T1 finishes with A. Interleaved, yet every conflict points T1→T2 — same result as serial T1→T2.' },
  { name: 'Lost update', seq: [1, 2, 1, 2, 1, 1], note: 'Preset: both transactions read A=100 before either writes. Minnie’s W2(A) overwrites Mickey’s — a lost update.' },
];

const STYLE = `
.sch-progs{border:1px solid var(--hairline);border-radius:12px;padding:10px 12px;margin:10px 0;background:var(--surface)}
.sch-prog{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:3px 0}
.sch-prog b{min-width:26px;color:var(--text)}
.sch-mini{font:600 12px/1 ui-monospace,monospace;padding:5px 6px;border-radius:6px;border:1px solid var(--hairline);color:var(--muted)}
.sch-mini.done{opacity:.38;text-decoration:line-through}
.sch-mini.next{border-color:var(--accent);color:var(--text);box-shadow:0 0 0 1px var(--accent)}
.sch-scroll{overflow-x:auto;margin:10px 0}
.sch-grid{display:grid;grid-auto-columns:52px;gap:4px;min-width:min-content;padding-bottom:2px}
.sch-lane{font-size:12px;font-weight:700;color:var(--muted);align-self:center;grid-column:1;width:26px}
.sch-step{font-size:10px;color:var(--muted);text-align:center}
.sch-chip{height:34px;border-radius:8px;display:flex;align-items:center;justify-content:center;font:700 12px ui-monospace,monospace;color:#fff}
.sch-chip.r{background:#2563EB}.sch-chip.w{background:#C2410C}
.sch-chip.last{outline:2px solid var(--text);outline-offset:1px}
.sch-cell{min-height:34px;border-radius:8px;border:1px dashed var(--hairline)}
.sch-confs{font:12px/1.6 ui-monospace,monospace;color:var(--muted);border-left:3px solid var(--hairline);padding:2px 0 2px 10px;margin:10px 0}
.sch-confs b{color:var(--text);font-weight:700}
.sch-graph{display:flex;justify-content:center;margin:6px 0}
.sch-gnode{fill:var(--surface);stroke:var(--muted);stroke-width:2}
.sch-gtxt{fill:var(--text);font:700 14px system-ui}.sch-glab{fill:var(--muted);font:11px system-ui}
.sch-verdict{border-radius:10px;padding:9px 12px;font-size:13.5px;color:var(--text);margin:8px 0;border-left:4px solid var(--muted);background:color-mix(in srgb,var(--muted) 8%,transparent)}
.sch-verdict.ok{border-left-color:#10B981;background:color-mix(in srgb,#10B981 12%,transparent)}
.sch-verdict.bad{border-left-color:#DC2626;background:color-mix(in srgb,#DC2626 12%,transparent)}
.sch-h{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);margin:14px 0 4px}`;

const lbl = (o) => `${o.op}${o.t}(${o.obj})`;

function opsFromSeq(seq) {
  const p = { 1: 0, 2: 0 };
  return seq.map((t) => ({ t, ...TXNS[t][p[t]++] }));
}

// Conflict: same object, different transactions, at least one write.
function findConflicts(ops) {
  const out = [];
  for (let i = 0; i < ops.length; i++)
    for (let j = i + 1; j < ops.length; j++) {
      const a = ops[i], b = ops[j];
      if (a.t !== b.t && a.obj === b.obj && (a.op === 'W' || b.op === 'W')) out.push({ a, b });
    }
  return out;
}

// Lost update on X: both txns read X before either writes X, then both write.
function lostUpdateObjs(ops) {
  const found = [];
  for (const X of ['A', 'B']) {
    const idx = (t, o) => ops.findIndex((x) => x.t === t && x.op === o && x.obj === X);
    const [r1, w1, r2, w2] = [idx(1, 'R'), idx(1, 'W'), idx(2, 'R'), idx(2, 'W')];
    if (r1 >= 0 && r2 >= 0 && w1 >= 0 && w2 >= 0 && r1 < w2 && r2 < w1) found.push(X);
  }
  return found;
}

function simulate(ops) { // every txn does read-then-increment on each object
  const store = { ...INIT }, local = { 1: {}, 2: {} };
  for (const o of ops) {
    if (o.op === 'R') local[o.t][o.obj] = store[o.obj];
    else store[o.obj] = local[o.t][o.obj] + 1;
  }
  return store;
}

export function mount(root) {
  if (!document.getElementById('sch-style')) document.head.append(h('style', { id: 'sch-style' }, STYLE));
  let seq = [], note = 'Tap a “next op” button to schedule T1 and T2’s actions in any interleaving you like — or load a preset.';

  const progs = h('div', { class: 'sch-progs' });
  const noteEl = h('div', { class: 'stepper-note' });
  const timeline = h('div', { class: 'sch-scroll' });
  const confBox = h('div');
  const graphBox = h('div', { class: 'sch-graph' });
  const verdict = h('div', { class: 'sch-verdict' });
  const b1 = h('button', { class: 'btn btn-accent', onclick: () => add(1) });
  const b2 = h('button', { class: 'btn btn-accent', onclick: () => add(2) });
  const resetB = h('button', { class: 'btn', onclick: () => { seq = []; note = 'Reset. Build a fresh interleaving.'; render(); } }, 'Reset');

  root.append(
    h('p', { class: 'viz-intro' },
      'Mickey (T1) and Minnie (T2) both play song 42 — its play count A starts at 100 (Mickey also plays song 7, count B=200). Interleave their reads and writes, then let the conflict graph decide: is this schedule equivalent to some serial order?'),
    progs,
    h('div', { class: 'viz-controls' }, b1, b2, resetB),
    h('div', { class: 'viz-controls' },
      PRESETS.map((p) => h('button', { class: 'btn btn-sm', onclick: () => { seq = p.seq.slice(); note = p.note; render(); } }, p.name))),
    noteEl,
    h('div', { class: 'sch-h' }, 'Schedule (time →)'), timeline,
    h('div', { class: 'sch-h' }, 'Conflicts (same row · two txns · ≥1 write)'), confBox,
    h('div', { class: 'sch-h' }, 'Conflict graph — the cycle test'), graphBox, verdict);

  function add(t) {
    const k = seq.filter((x) => x === t).length;
    if (k >= TXNS[t].length) return;
    seq.push(t);
    const ops = opsFromSeq(seq), last = ops[ops.length - 1];
    const news = findConflicts(ops).filter((c) => c.b === last);
    if (news.length) {
      note = `Added ${lbl(last)} — new conflict${news.length > 1 ? 's' : ''}: ` +
        news.map((c) => `${lbl(c.a)} before ${lbl(c.b)} (${c.a.op}–${c.b.op} on ${c.a.obj}) ⇒ edge T${c.a.t}→T${c.b.t}`).join('; ') + '.';
      if (hasCycle(ops)) note += ' The graph now has a cycle — no serial order can honor both directions.';
    } else {
      const other = ops.slice(0, -1).some((o) => o.t !== last.t && o.obj === last.obj);
      note = `Added ${lbl(last)} — no new conflict: ` + (other
        ? 'read–read is the one pair that commutes, so no edge.'
        : `the other transaction never touches row ${last.obj}.`);
    }
    render();
  }

  const edgesOf = (ops) => {
    const e = { '12': 0, '21': 0 };
    for (const c of findConflicts(ops)) e[`${c.a.t}${c.b.t}`]++;
    return e;
  };
  const hasCycle = (ops) => { const e = edgesOf(ops); return e['12'] > 0 && e['21'] > 0; };

  function render() {
    const ops = opsFromSeq(seq);
    noteEl.textContent = note;

    progs.innerHTML = '';
    for (const t of [1, 2]) {
      const used = seq.filter((x) => x === t).length;
      progs.append(h('div', { class: 'sch-prog' }, h('b', {}, `T${t}:`),
        TXNS[t].map((o, i) => h('span', { class: 'sch-mini' + (i < used ? ' done' : i === used ? ' next' : '') }, `${o.op}(${o.obj})`))));
    }
    for (const [b, t] of [[b1, 1], [b2, 2]]) {
      const nxt = TXNS[t][seq.filter((x) => x === t).length];
      b.textContent = nxt ? `T${t} next: ${nxt.op}(${nxt.obj})` : `T${t} done ✓`;
      b.disabled = !nxt;
    }

    // timeline: one column per step, lanes T1 / T2
    const grid = h('div', { class: 'sch-grid' });
    grid.append(h('div', { class: 'sch-step', style: 'grid-row:1;grid-column:1' }, ''));
    for (let s = 0; s < TOTAL; s++) grid.append(h('div', { class: 'sch-step', style: `grid-row:1;grid-column:${s + 2}` }, String(s + 1)));
    for (const t of [1, 2]) {
      grid.append(h('div', { class: 'sch-lane', style: `grid-row:${t + 1};grid-column:1` }, `T${t}`));
      for (let s = 0; s < TOTAL; s++) {
        const o = ops[s];
        grid.append(o && o.t === t
          ? h('div', { class: `sch-chip ${o.op === 'R' ? 'r' : 'w'}${s === seq.length - 1 ? ' last' : ''}`, style: `grid-row:${t + 1};grid-column:${s + 2}` }, lbl(o))
          : h('div', { class: 'sch-cell', style: `grid-row:${t + 1};grid-column:${s + 2}` }));
      }
    }
    timeline.innerHTML = ''; timeline.append(grid);

    const confs = findConflicts(ops);
    confBox.innerHTML = '';
    confBox.append(h('div', { class: 'sch-confs' }, confs.length
      ? confs.map((c) => h('div', {}, h('b', {}, `${lbl(c.a)} → ${lbl(c.b)}`), `  ${c.a.op}–${c.b.op} on ${c.a.obj}  ⇒  T${c.a.t} must precede T${c.b.t}`))
      : 'None yet. R–R pairs and actions on different rows never conflict.'));

    renderGraph(ops, confs);
  }

  function renderGraph(ops, confs) {
    const e = edgesOf(ops), cyc = e['12'] > 0 && e['21'] > 0;
    const col = cyc ? '#DC2626' : 'var(--accent)';
    const arrow = (x, y, dx, dy) => {
      const n = Math.hypot(dx, dy) || 1, ux = dx / n, uy = dy / n;
      return `<polygon points="${x},${y} ${x - 9 * ux + 4.5 * uy},${y - 9 * uy - 4.5 * ux} ${x - 9 * ux - 4.5 * uy},${y - 9 * uy + 4.5 * ux}" fill="${col}"/>`;
    };
    let s = '';
    if (e['12']) s += `<path d="M 88 46 Q 130 20 168 44" fill="none" stroke="${col}" stroke-width="2.5"/>${arrow(170, 45, 38, 24)}<text x="130" y="14" text-anchor="middle" class="sch-glab">${e['12']} conflict${e['12'] > 1 ? 's' : ''}</text>`;
    if (e['21']) s += `<path d="M 172 74 Q 130 100 92 76" fill="none" stroke="${col}" stroke-width="2.5"/>${arrow(90, 75, -38, -24)}<text x="130" y="113" text-anchor="middle" class="sch-glab">${e['21']} conflict${e['21'] > 1 ? 's' : ''}</text>`;
    if (!e['12'] && !e['21']) s += `<text x="130" y="14" text-anchor="middle" class="sch-glab">no edges yet</text>`;
    s += `<circle cx="62" cy="60" r="24" class="sch-gnode"/><text x="62" y="65" text-anchor="middle" class="sch-gtxt">T1</text>` +
      `<circle cx="198" cy="60" r="24" class="sch-gnode"/><text x="198" y="65" text-anchor="middle" class="sch-gtxt">T2</text>`;
    graphBox.innerHTML = `<svg viewBox="0 0 260 120" width="260" style="max-width:100%">${s}</svg>`;

    const done = seq.length === TOTAL;
    verdict.className = 'sch-verdict' + (cyc ? ' bad' : done ? ' ok' : '');
    if (cyc) {
      const lost = lostUpdateObjs(ops).map((X) => ` Classic lost update on ${X}: both read the old value, so one increment vanishes.`).join('');
      const fin = done ? ` Final A=${simulate(ops).A} — a serial run always gives 102.` : '';
      verdict.textContent = `✗ Cycle T1⇄T2 — NOT conflict-serializable. The two edges demand opposite serial orders, so none exists.${lost}${fin}`;
    } else if (done) {
      const order = e['21'] ? 'T2 → T1' : e['12'] ? 'T1 → T2' : 'either order';
      const st = simulate(ops);
      verdict.textContent = `✓ Acyclic — conflict-serializable, equivalent to serial ${order}. Final A=${st.A}, B=${st.B}, exactly what a serial run gives.`;
    } else {
      verdict.textContent = seq.length
        ? 'Graph is acyclic so far — the schedule is still conflict-serializable. Keep scheduling.'
        : 'Schedule some actions: every conflict becomes a directed edge here. Acyclic ⇒ safe; cycle ⇒ unsafe.';
    }
  }

  render();
}
