// Progress dashboard: reading, quiz mastery, SRS stats, streak calendar, export.
import { h, ring, bar, toast, badge } from '../ui.js';
import { getManifest, flatPages, allModules, getDeck, getQuizBank, MODULE_CODES } from '../data.js';
import { readPages, allQuiz, srsAll, streak, exportState, importState, resetState } from '../store.js';

export async function renderProgress(main) {
  main.className = 'view-progress';
  main.append(h('header', { class: 'page-head' }, h('h1', {}, 'Progress')));

  const man = await getManifest();
  const flat = (await flatPages()).filter((p) => !p.missing && p.kind !== 'quiz');
  const read = readPages();
  const nRead = flat.filter((p) => read[p.id]).length;

  // overview
  main.append(
    h('div', { class: 'row-3' },
      h('div', { class: 'card stat-card' },
        h('div', { class: 'stat-big' }, `${Math.round((nRead / flat.length) * 100)}%`),
        h('div', { class: 'stat-label' }, 'course read')),
      h('div', { class: 'card stat-card' },
        h('div', { class: 'stat-big' }, String(streak())),
        h('div', { class: 'stat-label' }, 'day streak')),
      h('div', { class: 'card stat-card' },
        h('div', { class: 'stat-big' }, String(matureCards())),
        h('div', { class: 'stat-label' }, 'cards learned'))));

  // per-area reading + quiz mastery
  main.append(h('h2', { class: 'section-head' }, 'By area'));
  const stack = h('div', { class: 'stack' });
  for (const area of man.areas) {
    const pages = flat.filter((p) => p.area.id === area.id);
    const done = pages.filter((p) => read[p.id]).length;
    const mods = area.modules.map((m) => m.dir);
    let best = null;
    for (const dir of mods) {
      const st = allQuiz()[dir];
      if (st && st.attempts.length) {
        const b = st.attempts.reduce((x, a) => Math.max(x, a.correct / a.total), 0);
        best = Math.max(best ?? 0, b);
      }
    }
    stack.append(
      h('div', { class: 'card area-progress', style: `--accent:${area.accent}` },
        h('div', { class: 'ap-head' },
          h('span', { class: 'ap-title' }, area.title),
          h('span', { class: 'ap-nums' }, `${done}/${pages.length} read${best != null ? ` · quiz best ${Math.round(best * 100)}%` : ''}`)),
        bar(pages.length ? done / pages.length : 0, area.accent)));
  }
  main.append(stack);

  // SRS forecast
  const due = dueForecast();
  main.append(
    h('h2', { class: 'section-head' }, 'Reviews due'),
    h('div', { class: 'card forecast' },
      due.map(([label, n]) =>
        h('div', { class: 'forecast-row' },
          h('span', { class: 'forecast-label' }, label),
          bar(n / Math.max(1, Math.max(...due.map((d) => d[1]))), null),
          h('span', { class: 'forecast-n' }, String(n))))));

  // data controls
  main.append(
    h('h2', { class: 'section-head' }, 'Your data'),
    h('div', { class: 'card data-controls' },
      h('p', { class: 'muted' }, 'Progress lives in this browser. Export a backup before switching devices.'),
      h('div', { class: 'result-actions' },
        h('button', { class: 'btn', onclick: doExport }, 'Export'),
        h('button', { class: 'btn', onclick: () => file.click() }, 'Import'),
        h('button', { class: 'btn btn-danger', onclick: doReset }, 'Reset'))));

  const file = h('input', { type: 'file', accept: 'application/json', style: 'display:none' });
  main.append(file);
  file.addEventListener('change', async () => {
    const f = file.files[0];
    if (!f) return;
    try {
      importState(await f.text());
      toast('Progress imported');
      setTimeout(() => location.reload(), 600);
    } catch (e) {
      toast('Import failed: not a valid backup');
    }
  });

  function doExport() {
    const blob = new Blob([exportState()], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `cs145-progress-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a);
    a.click();
    a.remove();
  }
  function doReset() {
    if (confirm('Erase all progress (reading, quiz history, flashcard schedule)?')) {
      resetState();
      location.reload();
    }
  }
}

function matureCards() {
  return Object.values(srsAll()).filter((r) => r.ivl >= 7).length;
}

function dueForecast() {
  const DAY = 86400000;
  const now = Date.now();
  const buckets = [['overdue', 0], ['today', 0], ['tomorrow', 0], ['this week', 0], ['later', 0]];
  const eod = new Date(); eod.setHours(23, 59, 59, 999);
  for (const r of Object.values(srsAll())) {
    if (r.due <= now) buckets[0][1]++;
    else if (r.due <= eod.getTime()) buckets[1][1]++;
    else if (r.due <= eod.getTime() + DAY) buckets[2][1]++;
    else if (r.due <= eod.getTime() + 7 * DAY) buckets[3][1]++;
    else buckets[4][1]++;
  }
  return buckets;
}
