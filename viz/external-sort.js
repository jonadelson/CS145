// External Merge Sort (BigSort) — how a database sorts a file bigger than
// RAM: pass 0 reads B pages at a time and writes sorted runs, then repeated
// (B−1)-way merge passes fold the runs into one sorted file. Presets scale
// from a toy 8-page file up to 100 GB / 1 GB with real IO numbers.
import { h } from '../app/ui.js';

const CSS = `
.es-formula{border:1px solid var(--hairline);border-radius:12px;background:var(--surface);
  padding:10px 12px;margin:10px 0;font-size:.84rem;line-height:1.55;color:var(--text)}
.es-formula code{font-weight:700}
.es-io{font-weight:700;color:var(--accent);font-variant-numeric:tabular-nums}
.es-scroll{overflow-x:auto;padding-bottom:4px}
.es-rows{display:flex;flex-direction:column;gap:12px;min-width:min-content;padding:2px}
.es-rowlab{font-size:.72rem;color:var(--muted);margin-bottom:3px;white-space:nowrap}
.es-row{display:flex;gap:8px}
.es-run{display:flex;gap:2px;padding:3px;border:1px solid var(--hairline);border-radius:6px}
.es-p{width:13px;height:20px;border-radius:3px;flex:none}
.es-p.es-ram{outline:2px solid var(--text);outline-offset:1px}
.es-p.es-gone{opacity:.15}
.es-rambox{display:flex;align-items:center;gap:5px;margin:10px 0;flex-wrap:wrap}
.es-ramlab{font-size:.75rem;font-weight:600;color:var(--muted);margin-right:2px}
.es-slot{width:30px;height:30px;border:1.5px solid var(--accent);border-radius:7px;flex:none;
  display:flex;flex-direction:column;align-items:center;justify-content:space-between;
  font-size:.68rem;font-weight:700;color:var(--text);background:var(--surface);overflow:hidden}
.es-slot span{padding-top:4px}
.es-slot .es-shade{width:100%;height:6px}
.es-slot.es-empty{border-style:dashed;border-color:var(--hairline);color:var(--muted)}
.es-slot.es-outslot{border-color:var(--muted);color:var(--muted)}
`;

const PRESETS = [
  { label: '8 pages / 3 buffers', vN: 8, vB: 3 },
  { label: '16 pages / 5 buffers', vN: 16, vB: 5 },
  { label: '64 GB / 6.4 GB', vN: 20, vB: 5, real: { N: 1000, B: 100, data: '64 GB', ram: '6.4 GB' } },
  { label: '100 GB / 1 GB', vN: 24, vB: 4, real: { N: 1563, B: 16, data: '100 GB', ram: '1 GB' } },
];

function stats(N, B) {
  const runs = Math.ceil(N / B);
  let r = runs, passes = 0;
  while (r > 1) { r = Math.ceil(r / (B - 1)); passes++; }
  return { runs, passes, total: 2 * N * (1 + passes) };
}

const shadeStyle = (v, N) =>
  `background:color-mix(in srgb, var(--accent) ${Math.round(15 + 75 * (v / Math.max(1, N - 1)))}%, var(--surface))`;

function buildSteps(p) {
  const N = p.vN, B = p.vB, fan = B - 1;
  const vst = stats(N, B), rst = p.real ? stats(p.real.N, p.real.B) : vst;
  let seed = 1234;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x80000000;
  const vals = [...Array(N).keys()];
  for (let i = N - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [vals[i], vals[j]] = [vals[j], vals[i]]; }

  const rows = [{ label: `Disk — unsorted input (${p.real ? 'each block ≈ ' + Math.round(p.real.N / N) + ' pages' : 'N = ' + N + ' pages'})`, groups: [vals.map((v) => ({ v, s: '' }))] }];
  const steps = [];
  let vio = 0, ram = null;
  const snap = (note) => steps.push(JSON.parse(JSON.stringify({ rows, ram, vio, note })));

  snap(`Each block is a page, shaded by its sort key (light = small; sorted data reads as a smooth gradient). Only B pages fit in RAM at once — the file never does. Press Step or Play.`);

  const runRow = { label: 'Disk — sorted runs after pass 0' };
  runRow.groups = [];
  rows.push(runRow);
  let runs = [];
  for (let i = 0; i < N; i += B) {
    const chunk = vals.slice(i, i + B);
    const src = rows[0].groups[0];
    chunk.forEach((_, j) => (src[i + j].s = 'ram'));
    ram = { slots: chunk.slice(), out: false };
    vio += chunk.length;
    snap(`Pass 0 — read the next RAM-sized chunk (${chunk.length} page${chunk.length > 1 ? 's' : ''}) into memory. Every page read costs an IO.`);
    const sorted = [...chunk].sort((a, b) => a - b);
    chunk.forEach((_, j) => (src[i + j].s = 'gone'));
    ram = { slots: sorted.slice(), out: false };
    runRow.groups.push(sorted.map((v) => ({ v, s: '' })));
    runs.push(sorted);
    vio += sorted.length;
    snap(`Quicksort the chunk in RAM (pure CPU work — zero IO), then write it back to disk as sorted run ${runs.length}. Writes cost IOs too.`);
  }
  ram = null;
  snap(`Pass 0 done: ⌈N/B⌉ = ${rst.runs} sorted runs${p.real ? ` (drawn as ${runs.length})` : ''}, each ≤ B pages. Every page was read once + written once → 2N IOs so far. Now merge.`);

  let pass = 1, srcIdx = 1;
  while (runs.length > 1) {
    const last = Math.ceil(runs.length / fan) === 1;
    const outRow = { label: last ? `Disk — ONE sorted file (after merge pass ${pass})` : `Disk — longer runs after merge pass ${pass}`, groups: [] };
    rows.push(outRow);
    const next = [];
    for (let g = 0; g < runs.length; g += fan) {
      const grp = runs.slice(g, g + fan);
      const idx = grp.map(() => 0);
      const heads = () => ({ slots: Array.from({ length: fan }, (_, j) => (j < grp.length && idx[j] < grp[j].length ? grp[j][idx[j]] : null)), out: true });
      outRow.groups.push([]);
      const og = outRow.groups[outRow.groups.length - 1];
      ram = heads();
      snap(`Merge pass ${pass} — start a ${grp.length}-way merge: each run's current head page gets one of the B−1 input buffers; the last buffer collects output. That's why the fan-in is B−1, not B.`);
      const total = grp.reduce((a, r) => a + r.length, 0);
      for (let done = 0; done < total; done++) {
        let mi = -1;
        for (let j = 0; j < grp.length; j++) if (idx[j] < grp[j].length && (mi < 0 || grp[j][idx[j]] < grp[mi][idx[mi]])) mi = j;
        const v = grp[mi][idx[mi]];
        rows[srcIdx].groups[g + mi][idx[mi]].s = 'gone';
        idx[mi]++;
        og.push({ v, s: '' });
        ram = heads();
        vio += 2;
        snap(`Buffer ${mi + 1} holds the smallest head → it moves to the output run. Per merge pass every page is read once + written once (+2 IOs per page).`);
      }
      next.push(og.map((c) => c.v));
    }
    ram = null;
    runs = next;
    snap(runs.length > 1
      ? `Merge pass ${pass} done — but ${runs.length} runs remain. The fan-in is only B−1 = ${fan}, so another full read+write pass over all N pages is needed.`
      : `Sorted! Pass 0 + ${rst.passes} merge pass${rst.passes > 1 ? 'es' : ''} → total 2N × (1 + ${rst.passes}) = ${rst.total.toLocaleString('en-US')} IOs.${rst.passes === 1 ? ' One merge pass is the classic 4N best case.' : ''}`);
    srcIdx = rows.length - 1;
    pass++;
  }
  return steps;
}

export function mount(root) {
  if (!document.getElementById('es-style')) document.head.append(h('style', { id: 'es-style' }, CSS));

  let pi = 0, steps = buildSteps(PRESETS[0]), si = 0, timer = null;

  const tabs = h('div', { class: 'seg viz-tabs', style: 'flex-wrap:wrap' });
  PRESETS.forEach((p, i) => tabs.append(h('button', {
    class: 'seg-btn' + (i === 0 ? ' active' : ''),
    onclick: (e) => {
      stop(); pi = i; steps = buildSteps(PRESETS[i]); si = 0;
      tabs.querySelectorAll('.seg-btn').forEach((b) => b.classList.remove('active'));
      e.currentTarget.classList.add('active');
      render();
    },
  }, p.label)));

  const formula = h('div', { class: 'es-formula' });
  const note = h('div', { class: 'stepper-note' });
  const ramBox = h('div', { class: 'es-rambox' });
  const rowsBox = h('div', { class: 'es-scroll' });
  const stepB = h('button', { class: 'btn btn-accent', onclick: () => { stop(); advance(); render(); } }, 'Step');
  const playB = h('button', { class: 'btn', onclick: togglePlay }, 'Play');
  const resetB = h('button', { class: 'btn', onclick: () => { stop(); si = 0; render(); } }, 'Reset');

  root.append(
    h('p', { class: 'viz-intro' },
      'Sorting needs to see all the data, but the table is bigger than RAM. External merge sort: quicksort RAM-sized chunks into sorted runs, then merge runs with B−1 input buffers — reading and writing every page once per pass.'),
    tabs,
    h('div', { class: 'viz-controls' }, stepB, playB, resetB),
    note, formula, ramBox, rowsBox);

  function advance() {
    si = Math.min(steps.length - 1, si + 1);
    if (si >= steps.length - 1) stop();
  }
  function togglePlay() {
    if (timer) { stop(); render(); return; }
    if (si >= steps.length - 1) si = 0;
    timer = setInterval(() => {
      if (!root.isConnected) { stop(); return; }
      advance(); render();
    }, 420);
    render();
  }
  function stop() { if (timer) { clearInterval(timer); timer = null; playB.textContent = 'Play'; } }

  function render() {
    const p = PRESETS[pi], s = steps[si];
    const vst = stats(p.vN, p.vB), rst = p.real ? stats(p.real.N, p.real.B) : vst;
    const N = p.real ? p.real.N : p.vN, B = p.real ? p.real.B : p.vB;
    const sc = p.real ? p.real.N / p.vN : 1;
    const io = Math.round(s.vio * sc);
    note.textContent = s.note;

    formula.innerHTML = '';
    if (p.real) formula.append(h('div', {},
      `${p.real.data} of data ÷ 64 MB pages → N = ${N.toLocaleString('en-US')} pages · ${p.real.ram} of RAM → B = ${B} buffer pages. The picture is scaled down: 1 block ≈ ${Math.round(sc)} real pages.`));
    formula.append(
      h('div', { html: `Runs: ⌈N/B⌉ = <code>${rst.runs}</code> · fan-in: B−1 = <code>${B - 1}</code> · merge passes: ⌈log<sub>B−1</sub>⌈N/B⌉⌉ = <code>${rst.passes}</code>` }),
      h('div', { html: `Total cost: 2N × (1 + ${rst.passes}) = <code>${rst.total.toLocaleString('en-US')}</code> IOs &nbsp;·&nbsp; IOs so far: <span class="es-io">${p.real ? '≈ ' : ''}${io.toLocaleString('en-US')}</span>` }));

    ramBox.innerHTML = '';
    ramBox.append(h('span', { class: 'es-ramlab' }, `RAM — B = ${p.vB} buffers:`));
    const slots = s.ram ? s.ram.slots.slice() : [];
    while (slots.length < (s.ram && s.ram.out ? p.vB - 1 : p.vB)) slots.push(null);
    for (const v of slots) {
      ramBox.append(v == null
        ? h('div', { class: 'es-slot es-empty' }, h('span', {}, '·'))
        : h('div', { class: 'es-slot' }, h('span', {}, String(v)), h('div', { class: 'es-shade', style: shadeStyle(v, p.vN) })));
    }
    if (s.ram && s.ram.out) ramBox.append(h('div', { class: 'es-slot es-outslot' }, h('span', {}, 'out')));

    rowsBox.innerHTML = '';
    const wrap = h('div', { class: 'es-rows' });
    for (const r of s.rows) {
      const rowEl = h('div', { class: 'es-row' });
      for (const g of r.groups) {
        if (!g.length) continue;
        rowEl.append(h('div', { class: 'es-run' },
          g.map((c) => h('span', { class: 'es-p' + (c.s ? ' es-' + c.s : ''), style: shadeStyle(c.v, p.vN) }))));
      }
      wrap.append(h('div', {}, h('div', { class: 'es-rowlab' }, r.label), rowEl));
    }
    rowsBox.append(wrap);

    stepB.disabled = si >= steps.length - 1;
    playB.disabled = false;
    playB.textContent = timer ? 'Pause' : 'Play';
  }

  render();
}
