// Reader: renders an embedded lecture page with video, transcript, prev/next.
import { h, icon, badge, bindLightbox, toast } from '../ui.js';
import { getPageHTML, pageById, neighbors, getVTTText, MODULE_CODES } from '../data.js';
import { isRead, markRead, setLastPage } from '../store.js';

export async function renderReader(main, pageId) {
  main.className = 'view-reader';
  const pg = await pageById(pageId);
  if (!pg || pg.missing) {
    main.append(h('div', { class: 'empty-state' }, h('h2', {}, 'Page not found'), h('a', { class: 'btn', href: '#/learn' }, 'Course map')));
    return;
  }
  if (pg.kind === 'quiz') { location.hash = `#/quiz/${pg.mod.dir}`; return; }
  setLastPage(pageId);

  main.style.setProperty('--accent', pg.area.accent);

  main.append(
    h('header', { class: 'reader-head' },
      h('a', { class: 'icon-btn', href: '#/learn', 'aria-label': 'Back to course' }, icon('back')),
      h('div', { class: 'reader-head-txt' },
        h('div', { class: 'reader-crumb' },
          badge(MODULE_CODES[pg.mod.dir] || '', pg.area.accent), ` ${pg.mod.title}`),
        h('div', { class: 'reader-sec' }, pg.sec.title))));

  const html = await getPageHTML(pageId);
  const article = h('article', { class: 'v5-article', html });
  bindLightbox(article);

  // math (only a page or two uses it) — render if KaTeX auto-render is present
  if (/\\\(|\\\[|\$\$/.test(html)) await renderMath(article);

  // video card
  if (pg.video) {
    const holder = h('div', { class: 'video-card' });
    const poster = pg.poster || '';
    const start = h('button', { class: 'video-start', onclick: () => {
      const v = h('video', {
        controls: true, playsinline: true, preload: 'metadata', crossorigin: 'anonymous',
        poster,
      },
        h('source', { src: pg.video, type: 'video/mp4' }),
        pg.vtt ? h('track', { kind: 'captions', srclang: 'en', label: 'English', src: pg.vtt }) : null);
      holder.replaceChildren(v);
      v.play().catch(() => {});
    } },
      poster ? h('img', { src: poster, alt: '', loading: 'lazy' }) : null,
      h('span', { class: 'video-start-btn' }, icon('play'), ' Watch the video'));
    holder.append(start);

    const videoBits = [holder];
    if (pg.vtt) {
      const det = h('details', { class: 'transcript' },
        h('summary', {}, 'Read the transcript'));
      det.addEventListener('toggle', async () => {
        if (det.open && det.childElementCount === 1) {
          det.append(h('p', {}, await getVTTText(pg.vtt) || 'Transcript unavailable.'));
        }
      }, { once: false });
      videoBits.push(det);
    }
    article.append(h('section', { class: 'video-block' }, videoBits));
  }

  main.append(article);

  // footer: mark read + prev/next
  const { prev, next } = await neighbors(pageId);
  const readBtn = h('button', {
    class: 'btn read-btn' + (isRead(pageId) ? ' done' : ''),
    onclick: () => {
      const now = !isRead(pageId);
      markRead(pageId, now);
      readBtn.classList.toggle('done', now);
      readBtn.replaceChildren(icon('check'), now ? ' Read' : ' Mark as read');
      if (now) toast('Nice — progress saved');
    },
  }, icon('check'), isRead(pageId) ? ' Read' : ' Mark as read');

  main.append(
    h('div', { class: 'reader-actions' }, readBtn),
    h('nav', { class: 'pager' },
      prev
        ? h('a', { class: 'pager-link prev', href: `#/page/${prev.id}` },
            h('span', { class: 'pager-dir' }, '← Previous'), h('span', { class: 'pager-title' }, prev.title))
        : h('span'),
      next
        ? h('a', {
            class: 'pager-link next', href: `#/page/${next.id}`,
            onclick: () => markRead(pageId, true),
          },
            h('span', { class: 'pager-dir' }, 'Next →'), h('span', { class: 'pager-title' }, next.title))
        : h('span')));
}

let katexLoading = null;
async function renderMath(root) {
  try {
    if (!window.renderMathInElement) {
      katexLoading ||= new Promise((res) => {
        const css = h('link', { rel: 'stylesheet', href: 'vendor/katex/katex.min.css' });
        document.head.append(css);
        const s1 = h('script', { src: 'vendor/katex/katex.min.js' });
        s1.onload = () => {
          const s2 = h('script', { src: 'vendor/katex/auto-render.min.js' });
          s2.onload = res;
          document.head.append(s2);
        };
        document.head.append(s1);
      });
      await katexLoading;
    }
    window.renderMathInElement(root, {
      delimiters: [
        { left: '\\[', right: '\\]', display: true },
        { left: '\\(', right: '\\)', display: false },
        { left: '$$', right: '$$', display: true },
      ],
      throwOnError: false,
    });
  } catch { /* math stays as source text */ }
}
