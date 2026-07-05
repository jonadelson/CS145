// Memory Hierarchy Explorer — the latency ladder from L1 cache to a
// cross-continent round trip, plus a "where does my data live?" scenario
// picker. All numbers come from the CS145 IO reference sheet and the
// Data Centers / Storage & Paging pages (64 MB pages, C_r per device).
import { h } from '../app/ui.js';

const CSS = `
.mh-ladder{display:flex;flex-direction:column;gap:6px;margin:10px 0}
.mh-row{display:block;width:100%;text-align:left;border:1px solid var(--hairline);
  background:var(--surface);border-radius:10px;padding:8px 10px;min-height:44px;
  cursor:pointer;font:inherit;color:var(--text)}
.mh-row.active{border-color:var(--accent);box-shadow:inset 3px 0 0 var(--accent)}
.mh-top{display:flex;justify-content:space-between;align-items:baseline;gap:8px;font-size:.86rem}
.mh-name{font-weight:600}
.mh-lat{font-variant-numeric:tabular-nums;color:var(--muted);font-weight:600;white-space:nowrap}
.mh-bar{height:8px;border-radius:4px;background:var(--hairline);margin-top:6px;overflow:hidden}
.mh-fill{height:100%;border-radius:4px;background:var(--accent)}
.mh-card{border:1px solid var(--hairline);border-radius:12px;background:var(--surface);
  padding:10px 12px;margin:10px 0;font-size:.9rem;line-height:1.45}
.mh-chips{display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 8px}
.mh-x{display:inline-block;padding:2px 9px;border-radius:999px;background:var(--accent);
  color:#fff;font-size:.75rem;font-weight:600}
.mh-dim{display:inline-block;padding:2px 9px;border-radius:999px;border:1px solid var(--hairline);
  color:var(--muted);font-size:.75rem;font-weight:600}
.mh-scale{font-size:.75rem;color:var(--muted);margin:2px 0 8px}
.mh-seg{flex-wrap:wrap}
.mh-home td{font-weight:700}
.mh-home td:first-child{box-shadow:inset 3px 0 0 var(--accent)}
.mh-scroll{overflow-x:auto}
`;

// Latency ladder (Data Centers Fig. 1; SSD/RAM/HDD from the IO reference sheet).
const TIERS = [
  { name: 'L1 cache', ns: 1, lat: '1 ns', human: '1 second',
    detail: 'On-chip SRAM. The core computes only out of registers and L1/L2/L3 cache, filled from RAM in 64-byte cache lines — it never touches the SSD directly.' },
  { name: 'RAM', ns: 100, lat: '100 ns', human: '1.5 minutes', price: '$3,500/TB',
    detail: 'Main memory. Volatile — gone on power loss. Scans at 100 GB/s, so one 64 MB page costs C_r = 0.00064 s.' },
  { name: 'SSD', ns: 1e4, lat: '10 µs', human: '3 hours (an afternoon)', price: '$75/TB',
    detail: 'The first durable tier. Access 10 µs, scan 5 GB/s → one 64 MB page costs C_r = 0.01281 s.' },
  { name: 'Network, same data center', ns: 5e5, lat: '500 µs', human: '6 days',
    detail: 'A round trip to another machine in the same building. Note: another machine’s RAM is closer than your own spinning disk — the fact Module 5 (distribution) is built on.' },
  { name: 'HDD seek', ns: 1e7, lat: '10 ms', human: '4 months', price: '$25/TB',
    detail: 'A mechanical arm physically moves to the track. Scan 100 MB/s → one 64 MB page costs C_r = 0.65 s. A query that falls to disk on every page pays the four-month rate, one page at a time.' },
  { name: 'Network, cross-region', ns: 5e7, lat: '50 ms', human: '1.6 years',
    detail: 'A round trip to a data center in another region of the same continent.' },
  { name: 'Network, cross-continent', ns: 1e8, lat: '100 ms', human: '3.2 years',
    detail: 'A round trip across an ocean. The speed of light sets this floor — no hardware upgrade fixes it. End to end, the ladder spans 100,000,000×.' },
];

// "Where does my data live?" — capacities from Storage & Paging, C_r from the IO reference.
const PAGE = 64e6;
const HOMES = [
  { name: 'RAM', cap: 16e9, holds: '16 GB', cr: 0.00064, crL: '0.00064 s' },
  { name: 'SSD', cap: 128e9, holds: '128 GB', cr: 0.01281, crL: '0.01281 s' },
  { name: 'HDD', cap: 4e12, holds: '4 TB', cr: 0.65, crL: '0.65 s' },
  { name: 'Many machines', cap: Infinity, holds: 'no limit', cr: 0.00641, crL: '0.00641 s' },
];
const SCENARIOS = [
  { label: '10 MB', size: 10e6, what: 'one user’s listening history' },
  { label: '2 GB', size: 2e9, what: 'a DataFrame — the Pandas world of case study 0.1' },
  { label: '64 GB', size: 64e9, what: 'the Listens table from the BigSort example' },
  { label: '1 TB', size: 1e12, what: 'Listens plus audio features' },
  { label: '100 TB', size: 100e12, what: 'the 10-billion-row, Spotify-scale Listens' },
];

const fmtX = (n) => `${n.toLocaleString('en-US')}×`;
function fmtSecs(s) {
  if (s < 1e-3) return `${Math.round(s * 1e6)} µs`;
  if (s < 1) return `${(s * 1e3).toFixed(2)} ms`;
  if (s < 90) return `${(s < 10 ? s.toFixed(2) : s.toFixed(1))} s`;
  if (s < 5400) return `${(s / 60).toFixed(1)} min`;
  if (s < 172800) return `${(s / 3600).toFixed(1)} h`;
  return `${(s / 86400).toFixed(1)} days`;
}

export function mount(root) {
  if (!document.getElementById('mh-style')) document.head.append(h('style', { id: 'mh-style' }, CSS));

  let tab = 0, tierSel = -1, scenSel = 2;

  const note = h('div', { class: 'stepper-note' });
  const body = h('div');
  const tabs = h('div', { class: 'seg viz-tabs' },
    ['Latency ladder', 'Where does my data live?'].map((t, i) =>
      h('button', {
        class: 'seg-btn' + (i === 0 ? ' active' : ''),
        onclick: (e) => {
          tab = i;
          tabs.querySelectorAll('.seg-btn').forEach((b) => b.classList.remove('active'));
          e.currentTarget.classList.add('active');
          render();
        },
      }, t)));

  root.append(
    h('p', { class: 'viz-intro' },
      'The same byte can be a nanosecond away or a hundred milliseconds away. Seven tiers, eight orders of magnitude — every cost model in this course is priced against this ladder.'),
    tabs, note, body);

  function render() { body.innerHTML = ''; (tab === 0 ? renderLadder : renderScenario)(); }

  // ---------------------------------------------------------- Tab 1: ladder
  function renderLadder() {
    const ladder = h('div', { class: 'mh-ladder' });
    TIERS.forEach((t, i) => {
      const pct = ((Math.log10(t.ns) + 1) / 9) * 100;
      ladder.append(h('button', {
        class: 'mh-row' + (i === tierSel ? ' active' : ''),
        onclick: () => { tierSel = i; render(); },
      },
        h('div', { class: 'mh-top' }, h('span', { class: 'mh-name' }, t.name), h('span', { class: 'mh-lat' }, t.lat)),
        h('div', { class: 'mh-bar' }, h('div', { class: 'mh-fill', style: `width:${pct}%` }))));
    });
    body.append(
      h('div', { class: 'mh-scale' }, 'Bars are log-scale: each extra sliver of bar is another 10×.'),
      ladder);

    if (tierSel < 0) {
      note.textContent = 'Tap a tier to see what one access really costs.';
      return;
    }
    const t = TIERS[tierSel];
    note.textContent = `${t.name}: ${t.lat} per access — if an L1 hit took 1 second, this would take ${t.human}.`;
    const chips = h('div', { class: 'mh-chips' },
      h('span', { class: 'mh-x' }, tierSel === 0 ? 'baseline' : `${fmtX(t.ns)} slower than L1`),
      tierSel > 0 && h('span', { class: 'mh-dim' }, `${fmtX(Math.round(t.ns / TIERS[tierSel - 1].ns))} vs ${TIERS[tierSel - 1].name}`),
      t.price && h('span', { class: 'mh-dim' }, t.price));
    body.append(h('div', { class: 'mh-card' }, chips, t.detail));
  }

  // -------------------------------------------------- Tab 2: scenario picker
  function renderScenario() {
    body.append(h('div', { class: 'seg mh-seg', style: 'margin:6px 0 10px' },
      SCENARIOS.map((s, i) => h('button', {
        class: 'seg-btn' + (i === scenSel ? ' active' : ''),
        onclick: () => { scenSel = i; render(); },
      }, s.label))));

    const sc = SCENARIOS[scenSel];
    const pages = Math.ceil(sc.size / PAGE);
    const homeIdx = HOMES.findIndex((hm) => sc.size <= hm.cap);
    const scan = (i) => fmtSecs(pages * HOMES[i].cr);

    const tbl = h('table', { class: 'mini-table' },
      h('thead', {}, h('tr', {}, ['Tier', 'Holds', 'Fits?', 'Full scan'].map((c) => h('th', {}, c)))),
      h('tbody', {}, HOMES.map((hm, i) => h('tr', { class: i === homeIdx ? 'mh-home' : '' },
        h('td', {}, hm.name + (i === homeIdx ? ' ←' : '')),
        h('td', {}, hm.holds),
        h('td', {}, sc.size <= hm.cap ? '✓' : '✗ too big'),
        h('td', {}, sc.size <= hm.cap ? scan(i) : '—')))));
    body.append(h('div', { class: 'mh-scroll' }, tbl));

    const msgs = [
      `Fits in 16 GB of RAM with room to spare: a full scan costs ${scan(0)}. (RAM is volatile, so a durable copy still lives on SSD — but the working set stays hot in memory.)`,
      `Fits in RAM — this is the Pandas world: everything is a ${scan(0)} scan away, until the data grows.`,
      `Too big for 16 GB of RAM → its home is the SSD. Full scan: ${pages.toLocaleString('en-US')} × ${HOMES[1].crL} ≈ ${scan(1)}. From RAM it would be ${scan(0)} — that gap is why Module 3 is about touching fewer pages.`,
      `Too big for RAM and the 128 GB SSD → it lives on HDD at ${HOMES[2].crL} per page. Full scan ≈ ${scan(2)}; the same scan from SSD would be ${scan(1)}. HDD is 140× cheaper per TB than RAM — capacity gets cheaper exactly as latency gets worse.`,
      `No single machine holds ${sc.label} → shard it across many machines (Module 5). Serially that is ${scan(3)} of network page IOs, but 100 machines scanning their own shards in parallel cut it ~100× — the BigQuery trick.`,
    ];
    const idx = scenSel === 0 ? 0 : scenSel === 1 ? 1 : homeIdx === 1 ? 2 : homeIdx === 2 ? 3 : 4;
    note.textContent = `${sc.label} (${sc.what}) = ${pages.toLocaleString('en-US')} page${pages > 1 ? 's' : ''} of 64 MB. ${msgs[idx]}` +
      (pages === 1 ? ' Note: even 10 MB costs one full page IO — the disk hands you a whole 64 MB page whether you want one row or all of it.' : '');
  }

  render();
}
