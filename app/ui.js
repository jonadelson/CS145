// Tiny DOM helpers + shared UI fragments.

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(c));
  }
  return el;
}

export const frag = (...children) => {
  const f = document.createDocumentFragment();
  for (const c of children.flat(Infinity)) if (c != null && c !== false) f.append(c.nodeType ? c : document.createTextNode(c));
  return f;
};

export function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/** SVG circular progress ring. pct in [0,1]. */
export function ring(pct, size = 44, stroke = 5, color = 'var(--accent, #2563EB)') {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.min(1, Math.max(0, pct)));
  const wrap = h('span', { class: 'ring', style: `width:${size}px;height:${size}px` });
  wrap.innerHTML =
    `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--hairline)" stroke-width="${stroke}"/>` +
    `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}"` +
    ` stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${off}"` +
    ` transform="rotate(-90 ${size / 2} ${size / 2})"/>` +
    `<text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" class="ring-label">${Math.round(pct * 100)}%</text>` +
    `</svg>`;
  return wrap;
}

export function bar(pct, color) {
  return h('div', { class: 'bar' },
    h('div', { class: 'bar-fill', style: `width:${Math.round(Math.min(1, Math.max(0, pct)) * 100)}%;${color ? `background:${color}` : ''}` }));
}

let toastTimer;
export function toast(msg) {
  let el = document.getElementById('toast');
  if (!el) {
    el = h('div', { id: 'toast' });
    document.body.append(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

/** Fullscreen image lightbox (tap image to zoom — important on phones). */
export function bindLightbox(container) {
  container.addEventListener('click', (e) => {
    const img = e.target.closest('img');
    if (!img || img.closest('a')) return;
    const ov = h('div', { class: 'lightbox', onclick: () => ov.remove() },
      h('img', { src: img.currentSrc || img.src, alt: img.alt || '' }));
    document.body.append(ov);
  });
}

export function badge(code, accent) {
  return h('span', { class: 'mod-badge', style: accent ? `background:${accent}` : '' }, code);
}

export const icons = {
  home: '<svg viewBox="0 0 24 24"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>',
  learn: '<svg viewBox="0 0 24 24"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15.5H6.5A2.5 2.5 0 0 0 4 21z"/><path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H20"/></svg>',
  practice: '<svg viewBox="0 0 24 24"><path d="M9 11.5 11 14l4.5-5.5"/><rect x="3.5" y="3.5" width="17" height="17" rx="3"/></svg>',
  review: '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="13" height="15" rx="2"/><path d="M8 6V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-1"/></svg>',
  more: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.8-3.8"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="m5 12.5 5 5L19.5 7"/></svg>',
  spark: '<svg viewBox="0 0 24 24"><path d="M12 2.5 14 9l6.5 2-6.5 2-2 6.5L10 13l-6.5-2L10 9z"/></svg>',
  chart: '<svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-8M21 20H3"/></svg>',
  viz: '<svg viewBox="0 0 24 24"><circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="M7.8 7.8 10.5 16M16.2 7.8 13.5 16M8.5 6h7"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
};

export function icon(name) {
  const s = h('span', { class: 'icon' });
  s.innerHTML = icons[name] || '';
  return s;
}
