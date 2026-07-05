// SM-2-lite spaced repetition. Grades: 0 again, 1 hard, 2 good, 3 easy.
import { srsGet, srsSet } from './store.js';

const DAY = 24 * 60 * 60 * 1000;

export function grade(cardId, g) {
  const now = Date.now();
  const rec = srsGet(cardId) || { ease: 2.5, ivl: 0, due: now, reps: 0, lapses: 0 };
  if (g === 0) {
    rec.reps = 0;
    rec.lapses++;
    rec.ease = Math.max(1.3, rec.ease - 0.2);
    rec.ivl = 0;
    rec.due = now + 10 * 60 * 1000; // see it again soon (in-session requeue)
  } else {
    if (g === 1) {
      rec.ease = Math.max(1.3, rec.ease - 0.15);
      rec.ivl = rec.reps === 0 ? 1 : Math.max(1, rec.ivl * 1.2);
    } else if (g === 2) {
      rec.ivl = rec.reps === 0 ? 1 : rec.reps === 1 ? 3 : rec.ivl * rec.ease;
    } else {
      rec.ease += 0.15;
      rec.ivl = rec.reps === 0 ? 2 : rec.reps === 1 ? 5 : rec.ivl * rec.ease * 1.3;
    }
    rec.ivl = Math.min(365, Math.round(rec.ivl * 10) / 10);
    rec.reps++;
    rec.due = now + rec.ivl * DAY;
  }
  srsSet(cardId, rec);
  return rec;
}

export function isDue(cardId, at = Date.now()) {
  const rec = srsGet(cardId);
  return !!rec && rec.due <= at;
}

export const isNew = (cardId) => !srsGet(cardId);

export function nextDueText(cardId) {
  const rec = srsGet(cardId);
  if (!rec) return 'new';
  const d = rec.due - Date.now();
  if (d <= 0) return 'due now';
  if (d < DAY) return 'later today';
  const days = Math.round(d / DAY);
  return days === 1 ? 'tomorrow' : `in ${days}d`;
}

/** Preview of the interval each grade would produce (for button labels). */
export function previewIntervals(cardId) {
  const rec = srsGet(cardId) || { ease: 2.5, ivl: 0, reps: 0 };
  const fmt = (d) => (d < 1 ? '10m' : d < 30 ? `${Math.round(d)}d` : `${Math.round(d / 30)}mo`);
  return {
    again: '10m',
    hard: fmt(rec.reps === 0 ? 1 : Math.max(1, rec.ivl * 1.2)),
    good: fmt(rec.reps === 0 ? 1 : rec.reps === 1 ? 3 : rec.ivl * rec.ease),
    easy: fmt(rec.reps === 0 ? 2 : rec.reps === 1 ? 5 : rec.ivl * rec.ease * 1.3),
  };
}
