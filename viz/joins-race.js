// Join Algorithms Race — Block Nested Loop Join vs Hash Partition Join racing
// the same Songs ⋈ Listens join, one page IO per tick, using the course cost
// model: pages P(R), P(S), buffer of B RAM pages, C_r = C_w = 1 (+ OUT for all).
import { h } from '../app/ui.js';

const CSS = `
.jr-cfg{display:flex;flex-wrap:wrap;gap:.6rem;align-items:center;margin:.6rem 0}
.jr-cfg label{display:flex;align-items:center;gap:.35rem;font-size:.8rem;font-weight:600;color:var(--muted)}
.jr-cfg .num-input{width:64px}
.jr-lane{border:1px solid var(--hairline);border-radius:12px;background:var(--surface);padding:.6rem .75rem;margin:.6rem 0}
.jr-lane.win{border-color:color-mix(in srgb,var(--ok) 60%,var(--hairline));box-shadow:0 0 0 1px color-mix(in srgb,var(--ok) 35%,transparent)}
.jr-lane-head{display:flex;justify-content:space-between;align-items:baseline;gap:.5rem}
.jr-lane-title{font-weight:650;color:var(--ink);font-size:.92rem}
.jr-io{font-family:var(--mono);font-size:.78rem;color:var(--muted);white-space:nowrap}
.jr-rowlab{font-size:.66rem;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin:.45rem 0 .2rem}
.jr-row{display:flex;flex-wrap:wrap;gap:3px}
.jr-cell{width:14px;height:14px;border-radius:3px;border:1px solid var(--hairline);background:color-mix(in srgb,var(--text) 6%,var(--surface))}
.jr-cell.ram{background:color-mix(in srgb,var(--accent) 32%,var(--surface));border-color:var(--accent)}
.jr-cell.seen{background:color-mix(in srgb,var(--accent) 14%,var(--surface))}
.jr-cell.filled{background:color-mix(in srgb,var(--warn) 30%,var(--surface));border-color:color-mix(in srgb,var(--warn) 60%,var(--hairline))}
.jr-cell.done{background:color-mix(in srgb,var(--ok) 24%,var(--surface));border-color:color-mix(in srgb,var(--ok) 45%,var(--hairline))}
.jr-cell.hot{box-shadow:0 0 0 2px var(--accent)}
.jr-lanenote{font-size:.78rem;color:var(--muted);margin-top:.5rem;min-height:1.15em}
.jr-summary{margin-top:.7rem;padding:.7rem .85rem}
.jr-sum-title{font-weight:700;color:var(--ink);margin-bottom:.4rem;font-size:.95rem}
.jr-frow{display:flex;flex-wrap:wrap;gap:.25rem .6rem;align-items:baseline;padding:.35rem 0;border-bottom:1px dashed var(--hairline)}
.jr-frow.win .jr-ftotal{color:var(--ok)}
.jr-fname{font-weight:650;font-size:.82rem;color:var(--ink);min-width:6.5em}
.jr-f{font-family:var(--mono);font-size:.76rem;color:var(--text)}
.jr-ftotal{font-family:var(--mono);font-size:.82rem;font-weight:700;color:var(--ink);margin-left:auto}
.jr-fine{font-size:.78rem;margin-top:.5rem}`;

const PRESETS = [
  { name: 'Songs fits in RAM', pr: 8, ps: 16, b: 8 },
  { name: 'Crossover', pr: 8, ps: 16, b: 2 },
  { name: 'Tiny buffer', pr: 12, ps: 20, b: 2 },
];

function bnljSteps(pr, ps, b) {
  const steps = [], nb = Math.ceil(pr / b);
  for (let blk = 0; blk < nb; blk++) {
    const lo = blk * b, hi = Math.min(pr, lo + b);
    for (let i = lo; i < hi; i++) steps.push({ k: 'r', i, blk, nb, first: i === lo });
    for (let j = 0; j < ps; j++) steps.push({ k: 's', j, blk, nb });
  }
  return steps; // length = P(R) + ⌈P(R)/B⌉ × P(S)
}

function hpjSteps(pr, ps) {
  const steps = []; let p = 0;
  for (let i = 0; i < pr; i++) steps.push({ k: 'r', side: 'R', i }, { k: 'w', p: p++ });
  for (let j = 0; j < ps; j++) steps.push({ k: 'r', side: 'S', i: j }, { k: 'w', p: p++ });
  for (let q = 0; q < pr + ps; q++) steps.push({ k: 'p', p: q });
  return steps; // length = 3 × (P(R) + P(S))
}

export function mount(root) {
  if (!document.getElementById('jr-style')) document.head.append(h('style', { id: 'jr-style' }, CSS));

  let pr = 8, ps = 16, b = 8;
  let t = 0, timer = null, stepsB = [], stepsH = [], laneB, laneH;

  const mkNum = (min, max) => {
    const el = h('input', { class: 'num-input', type: 'number', min, max, inputmode: 'numeric' });
    el.addEventListener('change', () => { seg.querySelectorAll('.seg-btn').forEach((x) => x.classList.remove('active')); reset(); });
    return el;
  };
  const inPr = mkNum(2, 16), inPs = mkNum(4, 30), inB = mkNum(1, 12);

  const seg = h('div', { class: 'seg' });
  PRESETS.forEach((p, i) => seg.append(h('button', {
    class: 'seg-btn' + (i === 0 ? ' active' : ''),
    onclick: (e) => {
      seg.querySelectorAll('.seg-btn').forEach((x) => x.classList.remove('active'));
      e.currentTarget.classList.add('active');
      inPr.value = p.pr; inPs.value = p.ps; inB.value = p.b; reset();
    },
  }, p.name)));

  const note = h('div', { class: 'stepper-note' });
  const laneBox = h('div');
  const summary = h('div', { class: 'card jr-summary', style: 'display:none' });
  const playB = h('button', { class: 'btn btn-accent', onclick: togglePlay }, 'Play');
  const stepB = h('button', { class: 'btn', onclick: () => { pause(); tick(); } }, 'Step 1 IO');
  const resetB = h('button', { class: 'btn', onclick: reset }, 'Reset');

  root.append(
    h('p', { class: 'viz-intro' }, 'The same Songs ⋈ Listens join can cost 40 IOs or 100,000 — the algorithm decides. Pick page counts P(R), P(S) and RAM buffer B, then race Block Nested Loop Join against Hash Partition Join, one page IO per tick (C_r = C_w = 1).'),
    seg,
    h('div', { class: 'jr-cfg' }, h('label', {}, 'P(R)', inPr), h('label', {}, 'P(S)', inPs), h('label', {}, 'B', inB)),
    h('div', { class: 'viz-controls' }, playB, stepB, resetB),
    note, laneBox, summary);

  function clamp(el, lo, hi, dflt) {
    const v = Math.trunc(Number(el.value));
    const out = Number.isFinite(v) && el.value !== '' ? Math.max(lo, Math.min(hi, v)) : dflt;
    el.value = out;
    return out;
  }

  function reset() {
    pause();
    t = 0;
    pr = clamp(inPr, 2, 16, 8); ps = clamp(inPs, 4, 30, 16); b = clamp(inB, 1, 12, 8);
    stepsB = bnljSteps(pr, ps, b); stepsH = hpjSteps(pr, ps);
    laneBox.innerHTML = '';
    laneB = mkLane('Block Nested Loop Join', stepsB.length, false);
    laneH = mkLane('Hash Partition Join', stepsH.length, true);
    laneBox.append(laneB.el, laneH.el);
    summary.style.display = 'none';
    playB.disabled = stepB.disabled = false;
    note.textContent = `Ready: P(R)=${pr}, P(S)=${ps}, B=${b}. Press Play — every tick each algorithm pays 1 page IO, so the cheaper join finishes first.`;
  }

  function mkLane(title, total, parts) {
    const cells = (n) => Array.from({ length: n }, () => h('span', { class: 'jr-cell' }));
    const row = (cs) => h('div', { class: 'jr-row' }, cs);
    const cellsR = cells(pr), cellsS = cells(ps), cellsP = parts ? cells(pr + ps) : null;
    const io = h('span', { class: 'jr-io' }, `0 / ${total} IOs`);
    const lanenote = h('div', { class: 'jr-lanenote' }, 'waiting…');
    const el = h('div', { class: 'jr-lane' },
      h('div', { class: 'jr-lane-head' }, h('span', { class: 'jr-lane-title' }, title), io),
      h('div', { class: 'jr-rowlab' }, `Songs R — ${pr} pages ${parts ? '(read once, hashed)' : '(outer)'}`), row(cellsR),
      h('div', { class: 'jr-rowlab' }, `Listens S — ${ps} pages ${parts ? '(read once, hashed)' : '(inner, rescanned per block)'}`), row(cellsS),
      parts ? [h('div', { class: 'jr-rowlab' }, `Partition pages on disk — ${pr + ps}`), row(cellsP)] : null,
      lanenote);
    return { el, cellsR, cellsS, cellsP, io, lanenote, count: 0, total, hot: null };
  }

  function hot(L, c) {
    if (L.hot) L.hot.classList.remove('hot');
    c.classList.add('hot');
    L.hot = c;
  }

  function applyB(st) {
    const L = laneB;
    if (st.k === 'r') {
      if (st.first) {
        L.cellsR.forEach((c) => { if (c.classList.contains('ram')) { c.classList.remove('ram'); c.classList.add('done'); } });
        L.cellsS.forEach((c) => c.classList.remove('seen'));
      }
      L.cellsR[st.i].classList.add('ram'); hot(L, L.cellsR[st.i]);
      L.lanenote.textContent = `Read Songs page ${st.i + 1} into the RAM block (block ${st.blk + 1} of ${st.nb}, B = ${b} pages).`;
    } else {
      L.cellsS[st.j].classList.add('seen'); hot(L, L.cellsS[st.j]);
      L.lanenote.textContent = `Scan Listens page ${st.j + 1} against the RAM block — full pass ${st.blk + 1} of ${st.nb} over Listens.`;
    }
  }

  function applyH(st) {
    const L = laneH;
    if (st.k === 'r') {
      const c = (st.side === 'R' ? L.cellsR : L.cellsS)[st.i];
      c.classList.add('done'); hot(L, c);
      L.lanenote.textContent = `Phase 1: read ${st.side === 'R' ? 'Songs' : 'Listens'} page ${st.i + 1}, hash its rows on song_id.`;
    } else if (st.k === 'w') {
      L.cellsP[st.p].classList.add('filled'); hot(L, L.cellsP[st.p]);
      L.lanenote.textContent = `Phase 1: write hashed rows to partition page ${st.p + 1} — writes cost IOs too.`;
    } else {
      L.cellsP[st.p].classList.add('done'); hot(L, L.cellsP[st.p]);
      L.lanenote.textContent = `Phase 2: read partition page ${st.p + 1} back — matching partitions join in RAM (build on R, probe with S).`;
    }
  }

  function tick() {
    if (!root.isConnected) return pause();
    if (t < stepsB.length) {
      applyB(stepsB[t]); laneB.count++;
      laneB.io.textContent = `${laneB.count} / ${laneB.total} IOs`;
      if (t === stepsB.length - 1) laneB.lanenote.textContent = `✓ Join finished in ${laneB.total} IOs.`;
    }
    if (t < stepsH.length) {
      applyH(stepsH[t]); laneH.count++;
      laneH.io.textContent = `${laneH.count} / ${laneH.total} IOs`;
      if (t === stepsH.length - 1) laneH.lanenote.textContent = `✓ Join finished in ${laneH.total} IOs.`;
    }
    t++;
    if (t >= Math.max(stepsB.length, stepsH.length)) {
      pause();
      playB.disabled = stepB.disabled = true;
      showSummary();
    } else {
      note.textContent = `IO ${t}: BNLJ ${Math.min(t, stepsB.length)}/${stepsB.length} · HPJ ${Math.min(t, stepsH.length)}/${stepsH.length} — one page IO per tick each.`;
    }
  }

  function showSummary() {
    const nb = Math.ceil(pr / b);
    const cB = stepsB.length, cH = stepsH.length, cS = pr + ps;
    if (cB <= cH) laneB.el.classList.add('win');
    if (cH <= cB) laneH.el.classList.add('win');
    const frow = (name, formula, total, win) => h('div', { class: 'jr-frow' + (win ? ' win' : '') },
      h('span', { class: 'jr-fname' }, name), h('span', { class: 'jr-f' }, formula),
      h('span', { class: 'jr-ftotal' }, `${total} IOs${win ? ' ✓' : ''}`));
    summary.innerHTML = '';
    summary.append(
      h('div', { class: 'jr-sum-title' }, cB === cH ? 'Dead heat — the crossover point'
        : `${cB < cH ? 'Block Nested Loop' : 'Hash Partition'} Join wins at B = ${b}`),
      frow('BNLJ', `P(R) + ⌈P(R)/B⌉·P(S) = ${pr} + ${nb}×${ps}`, cB, cB <= cH),
      frow('HPJ', `3·(P(R)+P(S)) = 3×${pr + ps}`, cH, cH <= cB),
      frow('SMJ, pre-sorted', `P(R) + P(S) = ${pr}+${ps}`, cS, false),
      h('p', { class: 'muted jr-fine' }, `Every algorithm also pays OUT to write the result, so it is omitted. BNLJ only reads — but rescans Listens once per block, so it collapses when B grows and explodes when B shrinks; HPJ's 3(N+M) never depends on B. Sort-merge costs only ${cS} if both tables are already sorted on song_id — otherwise add two BigSorts. Try a ${b > 2 ? 'smaller' : 'bigger'} B and race again.`));
    summary.style.display = '';
    note.textContent = cB === cH
      ? `Both finished in ${cB} IOs — at this B the two strategies cost exactly the same.`
      : `Race over: ${cB < cH ? 'BNLJ' : 'HPJ'} finished in ${Math.min(cB, cH)} IOs vs ${Math.max(cB, cH)}.`;
  }

  function togglePlay() {
    if (timer) return pause();
    const iv = Math.max(stepsB.length, stepsH.length) > 160 ? 50 : 120;
    timer = setInterval(tick, iv);
    playB.textContent = 'Pause';
  }

  function pause() {
    if (timer) clearInterval(timer);
    timer = null;
    playB.textContent = 'Play';
  }

  inPr.value = pr; inPs.value = ps; inB.value = b;
  reset();
}
