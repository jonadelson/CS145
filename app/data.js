// Data layer: loads and caches the course manifest, study banks, psets, search index.
const cache = new Map();

async function getJSON(url) {
  if (cache.has(url)) return cache.get(url);
  const p = fetch(url).then((r) => {
    if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
    return r.json();
  });
  cache.set(url, p);
  return p;
}

export const getManifest = () => getJSON('content/manifest.json');
export const getSearchIndex = () => getJSON('content/search-index.json');
export const getPsets = () => getJSON('content/psets.json');

export async function getPageHTML(pageId) {
  const url = `content/pages/${pageId}.html`;
  if (cache.has(url)) return cache.get(url);
  const p = fetch(url).then((r) => {
    if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
    return r.text();
  });
  cache.set(url, p);
  return p;
}

// ---- study banks --------------------------------------------------------
export async function getQuizBank(moduleDir) {
  try { return await getJSON(`study/quizzes/${moduleDir}.json`); }
  catch { return null; }
}
export async function getDeck(moduleDir) {
  try { return await getJSON(`study/flashcards/${moduleDir}.json`); }
  catch { return null; }
}

// ---- derived course-map helpers -----------------------------------------
let _flat = null;
export async function flatPages() {
  if (_flat) return _flat;
  const man = await getManifest();
  const flat = [];
  for (const area of man.areas) {
    for (const mod of area.modules) {
      for (const sec of mod.sections) {
        for (const pg of sec.pages) {
          flat.push({ ...pg, area, mod, sec });
        }
      }
    }
  }
  _flat = flat;
  return flat;
}

export async function pageById(pageId) {
  return (await flatPages()).find((p) => p.id === pageId) || null;
}

/** prev/next content page (skipping quiz entries and missing pages). */
export async function neighbors(pageId) {
  const flat = (await flatPages()).filter((p) => !p.missing);
  const i = flat.findIndex((p) => p.id === pageId);
  return { prev: i > 0 ? flat[i - 1] : null, next: i >= 0 && i < flat.length - 1 ? flat[i + 1] : null };
}

export async function allModules() {
  const man = await getManifest();
  const mods = [];
  for (const area of man.areas) for (const mod of area.modules) mods.push({ ...mod, area });
  return mods;
}

export const MODULE_CODES = {
  'Module0-Kickoff': 'M0', 'Module1-SQL': 'M1', 'Module1B-Intermediate-SQL': 'M1B',
  'Module2-Systems': 'M2', 'Module3-nanoDB': 'M3', 'Module3B-Indexing': 'M3B',
  'Module3C-Query-Optimization': 'M3C', 'Module4-Transactions': 'M4',
  'Module4B-Crash-Recovery': 'M4B', 'Module4C-End-to-End-TM': 'M4C',
  'Module5-Distributed': 'M5', 'Module6-Data-Systems': 'M6',
};

export async function getVTTText(url) {
  const key = `vtt:${url}`;
  if (cache.has(key)) return cache.get(key);
  const p = fetch(url).then((r) => (r.ok ? r.text() : '')).then(parseVTT);
  cache.set(key, p);
  return p;
}

function parseVTT(text) {
  const lines = text.split(/\r?\n/);
  const out = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t || t === 'WEBVTT' || /^\d+$/.test(t) || t.includes('-->') || /^(NOTE|STYLE|REGION)\b/.test(t)) continue;
    out.push(t.replace(/<[^>]+>/g, ''));
  }
  // collapse consecutive duplicates (VTT cues often repeat lines)
  const dedup = out.filter((l, i) => l !== out[i - 1]);
  return dedup.join(' ');
}
