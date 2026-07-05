// Learn: full course map — areas > modules > sections > pages.
import { h, icon, badge } from '../ui.js';
import { getManifest, MODULE_CODES } from '../data.js';
import { isRead } from '../store.js';

export async function renderLearn(main) {
  main.className = 'view-learn';
  const man = await getManifest();

  main.append(
    h('header', { class: 'page-head' },
      h('h1', {}, 'Course'),
      h('a', { class: 'icon-btn', href: '#/search', 'aria-label': 'Search' }, icon('search'))));

  for (const area of man.areas) {
    const section = h('section', { class: 'learn-area', style: `--accent:${area.accent}` });
    section.append(h('h2', { class: 'learn-area-title' }, area.title));
    for (const mod of area.modules) {
      const pages = mod.sections.flatMap((s) => s.pages).filter((p) => !p.missing);
      const done = pages.filter((p) => p.kind !== 'quiz' && isRead(p.id)).length;
      const total = pages.filter((p) => p.kind !== 'quiz').length;
      const body = h('div', { class: 'mod-body' });
      for (const sec of mod.sections) {
        body.append(h('h4', { class: 'mod-sec-title' }, sec.title));
        for (const pg of sec.pages) {
          if (pg.missing) continue;
          if (pg.kind === 'quiz') {
            body.append(
              h('a', { class: 'page-link quiz-link', href: `#/quiz/${mod.dir}` },
                h('span', { class: 'q-badge' }, 'Q'),
                h('span', { class: 'page-link-title' }, `Quiz: ${pg.title}`)));
            continue;
          }
          body.append(
            h('a', { class: 'page-link' + (isRead(pg.id) ? ' read' : ''), href: `#/page/${pg.id}` },
              h('span', { class: 'read-dot' }),
              h('span', { class: 'page-link-title' },
                pg.kind === 'case' ? h('span', { class: 'c-badge' }, 'C') : null,
                pg.title),
              pg.video ? h('span', { class: 'has-video', title: 'Has video' }, icon('play')) : null));
        }
      }
      const details = h('details', { class: 'mod-block' },
        h('summary', {},
          badge(MODULE_CODES[mod.dir] || '', area.accent),
          h('span', { class: 'mod-title' }, mod.title),
          h('span', { class: 'mod-count' }, `${done}/${total}`)),
        body);
      if (done > 0 && done < total) details.open = true;
      section.append(details);
    }
    main.append(section);
  }
}
