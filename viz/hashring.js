// Consistent Hashing Ring — sharding without the reshuffle: keys and nodes
// hash onto a 0..2³²−1 circle and each key belongs to the first node
// clockwise. Add/remove nodes and compare keys moved vs naive hash % N.
// Second panel: replication N=3 with R/W quorums and a node-failure toggle.
import { h } from '../app/ui.js';

const CSS = `
.hr-wrap{max-width:340px;margin:4px auto}
.hr-zero{font-size:10px;fill:var(--muted)}
.hr-node-label{font-size:11px;font-weight:700;fill:#fff}
.hr-legend{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin:4px 0 10px}
.hr-chip{display:inline-flex;align-items:center;gap:5px;padding:2px 9px;border-radius:999px;
  border:1px solid var(--hairline);font-size:.75rem;font-weight:600;color:var(--text)}
.hr-dot{width:9px;height:9px;border-radius:50%;flex:none}
.hr-panel{border:1px solid var(--hairline);border-radius:12px;background:var(--surface);
  padding:12px;margin:12px 0;color:var(--text)}
.hr-ptitle{font-weight:700;font-size:.88rem;margin-bottom:4px}
.hr-pintro{font-size:.78rem;color:var(--muted);margin-bottom:10px;line-height:1.45}
.hr-steps{display:flex;flex-wrap:wrap;gap:14px;margin-bottom:10px}
.hr-step{display:flex;align-items:center;gap:8px}
.hr-step .btn{min-width:44px}
.hr-steplab{font-size:.78rem;font-weight:600}
.hr-stepval{min-width:20px;text-align:center;font-weight:700;font-variant-numeric:tabular-nums}
.hr-reps{display:flex;gap:8px;margin:10px 0}
.hr-rep{flex:1;border:1.5px solid var(--hairline);border-radius:10px;padding:8px 6px;text-align:center;
  font-size:.72rem;min-height:72px}
.hr-rep.olap{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)}
.hr-rep.down{border-style:dashed;opacity:.55}
.hr-rep b{display:block;margin-bottom:5px}
.hr-mark{display:inline-block;margin:1px 2px;padding:1px 7px;border-radius:999px;font-size:.68rem;font-weight:700}
.hr-mw{background:var(--accent);color:#fff}
.hr-mr{border:1.5px solid var(--accent);color:var(--accent)}
.hr-md{background:#E11D48;color:#fff}
.hr-verdict{font-size:.8rem;line-height:1.5;border-top:1px solid var(--hairline);padding-top:8px;margin-top:4px}
.hr-verdict b{color:var(--accent)}
`;

const NAMES = 'ABCDEFGH';
const COLORS = { A: '#3B82F6', B: '#E11D48', C: '#059669', D: '#D97706', E: '#7C3AED', F: '#0891B2', G: '#DB2777', H: '#65A30D' };
const KEYS = Array.from({ length: 24 }, (_, i) => 'S_' + (i + 1));

function hash32(s) {
  let x = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); }
  x = (x ^ (x >>> 13)) >>> 0;
  x = Math.imul(x, 0x5bd1e995) >>> 0;
  return (x ^ (x >>> 15)) >>> 0;
}
const kh = Object.fromEntries(KEYS.map((k) => [k, hash32(k)]));
const nh = (n) => hash32('x2-' + n);
const pct = (n) => Math.round((n / KEYS.length) * 100) + '%';

export function mount(root) {
  if (!document.getElementById('hr-style')) document.head.append(h('style', { id: 'hr-style' }, CSS));

  let nodes = ['A', 'B', 'C'];
  let moved = new Set();
  let note = 'Nodes and keys both hash onto the ring (0 at the top, clockwise to 2³²−1). Each key dot belongs to the first node clockwise from it — that node\'s color. Try adding a node.';
  let W = 2, R = 2, down = false;

  const owner = (khash, ns) => {
    let best = null, bd = Infinity;
    for (const n of ns) { const d = (nh(n) - khash) >>> 0; if (d < bd) { bd = d; best = n; } }
    return best;
  };
  const assign = (ns) => Object.fromEntries(KEYS.map((k) => [k, owner(kh[k], ns)]));

  const noteEl = h('div', { class: 'stepper-note' });
  const ringBox = h('div', { style: 'overflow-x:auto' });
  const legend = h('div', { class: 'hr-legend' });
  const qbox = h('div', { class: 'hr-panel' });

  root.append(
    h('p', { class: 'viz-intro' },
      'With hash(key) % N, adding one machine reshuffles almost every key (3→4 machines moves ~75%). Consistent hashing puts machines on a ring so a new node steals only its neighbor\'s arc — about 1/N of the keys. Cassandra, DynamoDB and memcached run on this.'),
    h('div', { class: 'viz-controls' },
      h('button', { class: 'btn btn-accent', onclick: addNode }, 'Add node'),
      h('button', { class: 'btn', onclick: removeNode }, 'Remove node'),
      h('button', { class: 'btn', onclick: reset }, 'Reset')),
    noteEl, ringBox, legend, qbox);

  function addNode() {
    if (nodes.length >= NAMES.length) { note = 'Ring is full (8 nodes) — remove one first.'; render(); return; }
    const name = [...NAMES].find((n) => !nodes.includes(n));
    const before = assign(nodes), oldN = nodes.length;
    nodes.push(name);
    const after = assign(nodes);
    const m = KEYS.filter((k) => before[k] !== after[k]);
    const naive = KEYS.filter((k) => kh[k] % oldN !== kh[k] % nodes.length).length;
    moved = new Set(m);
    note = `Added node ${name}: only ${m.length}/24 keys moved (${pct(m.length)}) — the keys on the arc between ${name} and its predecessor (outlined dots). Naive hash % N going ${oldN}→${nodes.length} machines would have moved ${naive}/24 (${pct(naive)}).`;
    render();
  }

  function removeNode() {
    if (nodes.length <= 2) { note = 'Keep at least 2 nodes on the ring.'; render(); return; }
    const before = assign(nodes), oldN = nodes.length;
    const name = nodes.pop();
    const after = assign(nodes);
    const m = KEYS.filter((k) => before[k] !== after[k]);
    const naive = KEYS.filter((k) => kh[k] % oldN !== kh[k] % nodes.length).length;
    moved = new Set(m);
    note = `Removed node ${name}: its ${m.length}/24 keys (${pct(m.length)}) slide clockwise to the next node — nobody else's keys move. Naive hash % N going ${oldN}→${nodes.length} would have moved ${naive}/24 (${pct(naive)}).`;
    render();
  }

  function reset() {
    nodes = ['A', 'B', 'C']; moved = new Set(); W = 2; R = 2; down = false;
    note = 'Reset to 3 nodes. Each key belongs to the first node clockwise from where it hashes.';
    render();
  }

  function render() {
    noteEl.textContent = note;
    const own = assign(nodes);
    // ---------------- ring SVG
    const C = 160, RAD = 118;
    const xy = (hash, r) => {
      const a = (hash / 2 ** 32) * 2 * Math.PI - Math.PI / 2;
      return [C + r * Math.cos(a), C + r * Math.sin(a)];
    };
    let svg = `<circle cx="${C}" cy="${C}" r="${RAD}" fill="none" stroke="var(--hairline)" stroke-width="2"/>`;
    svg += `<line x1="${C}" y1="${C - RAD - 6}" x2="${C}" y2="${C - RAD + 6}" stroke="var(--muted)" stroke-width="1.5"/>`;
    svg += `<text x="${C}" y="${C - RAD - 12}" text-anchor="middle" class="hr-zero">0 / 2³²−1</text>`;
    for (const k of KEYS) {
      const [x, y] = xy(kh[k], RAD);
      svg += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" fill="${COLORS[own[k]]}"` +
        (moved.has(k) ? ` stroke="var(--text)" stroke-width="2.5"` : '') + `/>`;
    }
    for (const n of nodes) {
      const [x, y] = xy(nh(n), RAD);
      const [tx, ty] = xy(nh(n), RAD + 22);
      svg += `<line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${tx.toFixed(1)}" y2="${ty.toFixed(1)}" stroke="${COLORS[n]}" stroke-width="2"/>`;
      svg += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="11" fill="${COLORS[n]}" stroke="var(--surface)" stroke-width="2"/>`;
      svg += `<text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="middle" class="hr-node-label">${n}</text>`;
    }
    ringBox.innerHTML = `<div class="hr-wrap"><svg viewBox="0 0 320 320" width="100%">${svg}</svg></div>`;
    legend.innerHTML = '';
    for (const n of nodes) {
      const c = KEYS.filter((k) => own[k] === n).length;
      legend.append(h('span', { class: 'hr-chip' }, h('span', { class: 'hr-dot', style: `background:${COLORS[n]}` }), `${n} · ${c} keys`));
    }
    renderQ();
  }

  // ---------------- replication + quorum panel
  function renderQ() {
    qbox.innerHTML = '';
    const alive = [1, 2, 3].filter((i) => !(down && i === 1));
    const wset = W <= alive.length ? alive.slice(0, W) : [];
    const rset = R <= alive.length ? alive.slice(-R) : [];
    const stepper = (label, get, set) => h('div', { class: 'hr-step' },
      h('span', { class: 'hr-steplab' }, label),
      h('button', { class: 'btn', onclick: () => { set(Math.max(1, get() - 1)); renderQ(); } }, '−'),
      h('span', { class: 'hr-stepval' }, String(get())),
      h('button', { class: 'btn', onclick: () => { set(Math.min(3, get() + 1)); renderQ(); } }, '+'));

    const reps = h('div', { class: 'hr-reps' }, [1, 2, 3].map((i) => {
      const isDown = down && i === 1;
      return h('div', { class: 'hr-rep' + (wset.includes(i) && rset.includes(i) ? ' olap' : '') + (isDown ? ' down' : '') },
        h('b', {}, `Replica ${i}${i === 1 ? ' (owner)' : ''}`),
        isDown ? h('span', { class: 'hr-mark hr-md' }, 'DOWN') : [
          wset.includes(i) && h('span', { class: 'hr-mark hr-mw' }, 'W ack'),
          rset.includes(i) && h('span', { class: 'hr-mark hr-mr' }, 'R read'),
          !wset.includes(i) && !rset.includes(i) && h('span', { class: 'muted' }, '—'),
        ]);
    }));

    const strong = R + W > 3;
    const v1 = h('div', {}, `R + W = ${R + W} ${strong ? '>' : '≤'} N = 3 → `, strong
      ? h('b', {}, 'every read set overlaps every write set — reads are guaranteed to see the latest write.')
      : 'a read can land only on replicas the newest write hasn\'t reached yet — stale reads possible.');
    const v2 = down
      ? h('div', { style: 'margin-top:4px' }, `Owner down, 2 replicas alive → writes ${W <= alive.length ? `still succeed (W = ${W} acks reachable)` : 'BLOCK: W = 3 acks are impossible'}; reads ${R <= alive.length ? 'still succeed' : 'BLOCK: R = 3 probes are impossible'}. Bigger quorums buy consistency but cost availability.`)
      : h('div', { style: 'margin-top:4px' }, 'All 3 replicas up: reads and writes both succeed at any quorum size.');

    qbox.append(
      h('div', { class: 'hr-ptitle' }, 'Replication + quorums (N = 3 copies)'),
      h('div', { class: 'hr-pintro' },
        'Each key is stored on its owner plus the next 2 nodes clockwise. A write waits for W acks; a read probes R replicas and takes the newest version. Boxes show the worst case: the read set chosen as far from the write set as possible.'),
      h('div', { class: 'hr-steps' }, stepper('W', () => W, (v) => (W = v)), stepper('R', () => R, (v) => (R = v))),
      reps,
      h('div', { class: 'viz-controls' },
        h('button', { class: 'btn' + (down ? ' btn-accent' : ''), onclick: () => { down = !down; renderQ(); } },
          down ? 'Repair the node' : 'Fail the owner node')),
      h('div', { class: 'hr-verdict' }, v1, v2));
  }

  render();
}
