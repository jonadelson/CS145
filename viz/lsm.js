// LSM Tree / SSTables — the write path (MemTable → flush → immutable
// SSTables → compaction) and the read path (MemTable first, then SSTables
// newest → oldest, with bloom filters skipping files that can't hold the
// key). Keys are Spotify song IDs; newest version wins on read.
import { h } from '../app/ui.js';

const CSS = `
.lsm-tier{border:1px solid var(--hairline);border-radius:12px;background:var(--surface);
  padding:10px 12px;margin:10px 0;color:var(--text)}
.lsm-tier.lsm-hit{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)}
.lsm-head{display:flex;justify-content:space-between;align-items:center;gap:8px;
  font-size:.8rem;font-weight:700;margin-bottom:6px}
.lsm-meter{flex:1;max-width:90px;height:7px;border-radius:4px;background:var(--hairline);overflow:hidden}
.lsm-meter div{height:100%;background:var(--accent)}
.lsm-chips{display:flex;flex-wrap:wrap;gap:6px;min-height:24px}
.lsm-chip{display:inline-flex;gap:5px;padding:2px 9px;border-radius:999px;border:1px solid var(--hairline);
  font-size:.75rem;font-weight:600;font-variant-numeric:tabular-nums}
.lsm-tomb{color:#E11D48;border-color:#E11D48}
.lsm-flowlab{font-size:.72rem;color:var(--muted);margin:2px 0 2px 12px}
.lsm-tables{display:flex;gap:8px;overflow-x:auto;padding:2px 2px 6px}
.lsm-sst{min-width:124px;flex:none;border:1px solid var(--hairline);border-radius:10px;
  background:var(--surface);padding:8px 9px;font-size:.75rem;color:var(--text)}
.lsm-sst.lsm-skip{border-style:dashed;opacity:.65}
.lsm-sst.lsm-hit{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)}
.lsm-sst.lsm-fp{border-color:#E11D48}
.lsm-ssthead{font-weight:700;margin-bottom:4px}
.lsm-bloom{display:flex;gap:2px;margin:4px 0 6px}
.lsm-bloom i{width:5px;height:9px;border-radius:1.5px;background:var(--hairline)}
.lsm-bloom i.on{background:var(--accent)}
.lsm-e{display:flex;justify-content:space-between;gap:8px;padding:1px 0;font-variant-numeric:tabular-nums}
.lsm-e.lsm-shadow{opacity:.4;text-decoration:line-through}
.lsm-e .lsm-del{color:#E11D48;font-weight:700}
.lsm-badge{display:inline-block;margin-top:5px;padding:1px 7px;border-radius:999px;font-size:.68rem;
  font-weight:700;border:1px solid var(--hairline);color:var(--muted)}
.lsm-badge.b-hit{border-color:var(--accent);color:var(--accent)}
.lsm-badge.b-fp{border-color:#E11D48;color:#E11D48}
.lsm-empty{font-size:.78rem;color:var(--muted);padding:6px 0}
`;

const POOL = ['S_7', 'S_12', 'S_23', 'S_40', 'S_61', 'S_75', 'S_88', 'S_102'];
const BITS = 16, THRESH = 4;
const num = (k) => parseInt(k.slice(2), 10);

function hash(s, seed) {
  let x = (seed ^ 2166136261) >>> 0;
  for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); }
  return ((x ^ (x >>> 13)) >>> 0);
}
const bloomOf = (keys) => {
  const b = new Array(BITS).fill(0);
  for (const k of keys) { b[hash(k, 7) % BITS] = 1; b[hash(k, 131) % BITS] = 1; }
  return b;
};
const bloomMaybe = (b, k) => !!(b[hash(k, 7) % BITS] && b[hash(k, 131) % BITS]);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export function mount(root) {
  if (!document.getElementById('lsm-style')) document.head.append(h('style', { id: 'lsm-style' }, CSS));

  let mem = new Map();        // key -> {v, del}
  let tables = [];            // newest first: {id, entries:[{k,v,del}], bloom}
  let ver = {}, nextId = 1, busy = false, marks = { mem: null, t: {} };
  let note = 'No random disk writes, ever: writes land in the RAM MemTable, flush as immutable sorted files, and compaction cleans up. Tap "Write key" a few times.';

  const noteEl = h('div', { class: 'stepper-note' });
  const body = h('div');
  const btns = [
    h('button', { class: 'btn btn-accent', onclick: () => guard(doWrite) }, 'Write key'),
    h('button', { class: 'btn', onclick: () => guard(doUpdateDelete) }, 'Update / Delete'),
    h('button', { class: 'btn', onclick: () => guard(doCompact) }, 'Compact'),
    h('button', { class: 'btn', onclick: () => guard(doRead) }, 'Read key'),
    h('button', { class: 'btn', onclick: () => guard(doReset) }, 'Reset'),
  ];

  root.append(
    h('p', { class: 'viz-intro' },
      'When Spotify ingests a million listen events per second, a B+Tree dies — every insert is a random disk write. The LSM tree absorbs writes in RAM and only ever writes disk sequentially.'),
    h('div', { class: 'viz-controls' }, btns), noteEl, body);

  function guard(fn) { if (!busy) fn(); }
  const knownKeys = () => {
    const s = new Set([...mem.keys()]);
    for (const t of tables) for (const e of t.entries) s.add(e.k);
    return [...s];
  };
  const stateOf = (k) => {
    if (mem.has(k)) return mem.get(k);
    for (const t of tables) { const e = t.entries.find((e) => e.k === k); if (e) return e; }
    return null;
  };

  function maybeFlush() {
    if (mem.size < THRESH) return;
    const entries = [...mem.entries()].map(([k, e]) => ({ k, ...e })).sort((a, b) => num(a.k) - num(b.k));
    tables.unshift({ id: nextId, entries, bloom: bloomOf(entries.map((e) => e.k)) });
    mem = new Map();
    note += ` MemTable hit ${THRESH} entries → FLUSH: sort by key, build a bloom filter, write immutable SSTable #${nextId} to disk in ONE sequential write.`;
    nextId++;
  }

  function doWrite() {
    const k = pick(POOL);
    ver[k] = (ver[k] || 0) + 1;
    mem.set(k, { v: 'v' + ver[k], del: false });
    note = `Write (${k}, v${ver[k]}) → MemTable. Pure RAM: 0 disk IOs, no seek, no B+Tree rebalance.` +
      (ver[k] > 1 ? ` Older versions of ${k} already on disk are NOT touched — the newest timestamp wins on read.` : '');
    maybeFlush();
    marks = { mem: null, t: {} };
    render();
  }

  function doUpdateDelete() {
    const known = knownKeys();
    if (!known.length) { note = 'Nothing to update yet — tap "Write key" first.'; render(); return; }
    const live = known.filter((k) => { const s = stateOf(k); return s && !s.del; });
    if (live.length && Math.random() < 0.5) {
      const k = pick(live);
      mem.set(k, { v: '⌫', del: true });
      note = `Delete ${k} → write a TOMBSTONE to the MemTable. SSTables are immutable, so old versions can't be erased in place — the tombstone shadows them until compaction really drops them.`;
    } else {
      const k = pick(known);
      ver[k] = (ver[k] || 0) + 1;
      mem.set(k, { v: 'v' + ver[k], del: false });
      note = `Update ${k} → just append (${k}, v${ver[k]}). No in-place edit: the new version shadows the old ones (shown struck-through below).`;
    }
    maybeFlush();
    marks = { mem: null, t: {} };
    render();
  }

  function doCompact() {
    if (tables.length < 2) { note = 'Compaction needs at least 2 SSTables to merge — keep writing.'; render(); return; }
    const newest = new Map();
    let total = 0;
    for (const t of tables) for (const e of t.entries) { total++; if (!newest.has(e.k)) newest.set(e.k, e); }
    const kept = [...newest.values()].filter((e) => !e.del).sort((a, b) => num(a.k) - num(b.k));
    const shadowed = total - newest.size;
    const tombs = newest.size - kept.length;
    const n = tables.length;
    tables = kept.length ? [{ id: nextId++, entries: kept, bloom: bloomOf(kept.map((e) => e.k)) }] : [];
    note = `Compaction: k-way merged ${n} SSTables → ${kept.length ? 1 : 0} (it's external merge sort again!). Kept the newest version per key; dropped ${shadowed} shadowed version${shadowed === 1 ? '' : 's'} and ${tombs} tombstone${tombs === 1 ? '' : 's'} for good (safe here because ALL older files were merged).`;
    marks = { mem: null, t: {} };
    render();
  }

  function doRead() {
    const known = knownKeys();
    const k = (!known.length || Math.random() < 0.2) ? 'S_999' : pick(known);
    const steps = [];
    let io = 0;
    const tm = {};
    const m = mem.get(k);
    if (m) {
      steps.push({ note: m.del
        ? `Read ${k}: check the MemTable first — found a TOMBSTONE. ${k} is deleted. Answered from RAM: 0 disk IOs.`
        : `Read ${k}: check the MemTable first — found ${m.v} in RAM. 0 disk IOs — hot keys are free.`, mem: 'hit', t: {}, io });
    } else {
      steps.push({ note: `Read ${k}: check the MemTable first — not there (0 IO). Fall through to the SSTables, newest → oldest.`, mem: 'miss', t: {}, io });
      let done = false;
      for (const t of tables) {
        if (!bloomMaybe(t.bloom, k)) {
          tm[t.id] = 'skip';
          steps.push({ note: `SSTable #${t.id}: bloom filter says "definitely NOT here" → skip it with zero disk reads. IOs so far: ${io}.`, mem: 'miss', t: { ...tm }, io });
          continue;
        }
        io++;
        const e = t.entries.find((e) => e.k === k);
        if (e) {
          tm[t.id] = 'hit';
          steps.push({ note: e.del
            ? `SSTable #${t.id}: bloom says "maybe" → probe (1 IO)… found a TOMBSTONE. ${k} is deleted; stop — never look at older files. Total: ${io} IO${io > 1 ? 's' : ''}.`
            : `SSTable #${t.id}: bloom says "maybe" → probe (1 IO)… found ${e.v}. Newest version wins — stop here. Total: ${io} IO${io > 1 ? 's' : ''}.`, mem: 'miss', t: { ...tm }, io });
          done = true; break;
        }
        tm[t.id] = 'fp';
        steps.push({ note: `SSTable #${t.id}: bloom said "maybe" → probe (1 IO)… not there. A bloom FALSE POSITIVE — 1 wasted IO, the price of a tiny probabilistic filter. Keep going.`, mem: 'miss', t: { ...tm }, io });
      }
      if (!done) steps.push({ note: `${k} does not exist. Total: ${io} IO${io === 1 ? '' : 's'}` +
        (tables.length && io < tables.length ? ` — bloom filters skipped ${tables.length - io} of ${tables.length} SSTables for free.` : '.'), mem: 'miss', t: { ...tm }, io });
    }
    busy = true;
    btns.forEach((b) => (b.disabled = true));
    let i = 0;
    const timer = setInterval(() => {
      if (!root.isConnected) { clearInterval(timer); return; }
      const s = steps[i++];
      note = s.note;
      marks = { mem: s.mem, t: s.t };
      render();
      if (i >= steps.length) {
        clearInterval(timer);
        busy = false;
        btns.forEach((b) => (b.disabled = false));
      }
    }, 950);
  }

  function doReset() {
    mem = new Map(); tables = []; ver = {}; nextId = 1; marks = { mem: null, t: {} };
    note = 'Reset. Tap "Write key" to start filling the MemTable.';
    render();
  }

  function render() {
    noteEl.textContent = note;
    body.innerHTML = '';
    // ---- MemTable (RAM)
    const memCard = h('div', { class: 'lsm-tier' + (marks.mem === 'hit' ? ' lsm-hit' : '') },
      h('div', { class: 'lsm-head' },
        h('span', {}, 'MemTable — RAM'),
        h('div', { class: 'lsm-meter' }, h('div', { style: `width:${(mem.size / THRESH) * 100}%` })),
        h('span', { class: 'muted', style: 'font-size:.75rem' }, `${mem.size}/${THRESH}`)),
      h('div', { class: 'lsm-chips' },
        mem.size ? [...mem.entries()].sort((a, b) => num(a[0]) - num(b[0])).map(([k, e]) =>
          h('span', { class: 'lsm-chip' + (e.del ? ' lsm-tomb' : '') }, `${k} ${e.del ? '⌫' : e.v}`))
          : h('span', { class: 'lsm-empty' }, 'empty — writes land here first')));
    // ---- SSTables (disk)
    const winner = {};
    for (const k of knownKeys()) winner[k] = mem.has(k) ? 'mem' : (tables.find((t) => t.entries.some((e) => e.k === k)) || {}).id;
    const row = h('div', { class: 'lsm-tables' });
    if (!tables.length) row.append(h('div', { class: 'lsm-empty' }, `no SSTables yet — the MemTable flushes at ${THRESH} entries`));
    tables.forEach((t) => {
      const mk = marks.t[t.id];
      row.append(h('div', { class: 'lsm-sst' + (mk === 'skip' ? ' lsm-skip' : mk === 'hit' ? ' lsm-hit' : mk === 'fp' ? ' lsm-fp' : '') },
        h('div', { class: 'lsm-ssthead' }, `SSTable #${t.id}`),
        h('div', { class: 'lsm-bloom' }, t.bloom.map((b) => h('i', { class: b ? 'on' : '' }))),
        t.entries.map((e) => h('div', { class: 'lsm-e' + (winner[e.k] !== t.id ? ' lsm-shadow' : '') },
          h('span', {}, e.k), h('span', { class: e.del ? 'lsm-del' : '' }, e.del ? '⌫ tomb' : e.v))),
        mk ? h('div', { class: 'lsm-badge' + (mk === 'hit' ? ' b-hit' : mk === 'fp' ? ' b-fp' : '') },
          mk === 'skip' ? 'bloom: skip' : mk === 'hit' ? 'probe: hit' : 'probe: miss (FP)') : null));
    });
    body.append(memCard,
      h('div', { class: 'lsm-flowlab' }, '↓ flush (sequential write) · disk, newest → oldest · struck-through = shadowed by a newer version'),
      row);
  }

  render();
}
