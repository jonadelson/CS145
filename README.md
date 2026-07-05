# CS145 Study

A one-stop, mobile-first learning app for the **Modern Data Systems** course
([cs145.web.app](https://cs145.web.app)). The full course content is embedded —
130 lecture pages across 12 modules — wrapped in study tools:

- **Learn** — every lecture page, readable in-app, with figures, videos
  (streamed from the course site), and transcripts. Reading progress tracked.
- **Practice** — original multiple-choice quizzes per module (with teaching
  explanations and links back to the source page), plus the course's real
  problem sets with answer keys.
- **Review** — flashcards for every module on an SM-2 style spaced-repetition
  schedule. Grade yourself Again/Hard/Good/Easy; the app schedules the next look.
- **Demos** — interactive visualizations: SQL query stepper, B-tree playground,
  LSM trees, join algorithms, external merge sort, memory hierarchy,
  transaction schedules, consistent hashing.
- **Search** — full-text search across all embedded content.
- **Progress** — per-area reading/quiz mastery, review forecast, streaks, and
  JSON export/import of your data.

## Running it

It's a static site — no build step, no dependencies. Serve the repo root over
HTTP:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

(Note: opening `index.html` directly as a `file://` URL won't work — the app
fetches its content with `fetch()`.)

### On your phone

Deploy to any static host and open it in your phone's browser, then
"Add to Home Screen" — it installs as an app (PWA) and works offline
(except video, which streams from cs145.web.app).

Firebase Hosting (matches the course site's stack):

```bash
npm i -g firebase-tools
firebase login
firebase init hosting   # public dir: . (repo root), single-page app: No
firebase deploy
```

GitHub Pages works too: Settings → Pages → serve from the branch root.

## Where things live

| Path | What |
| --- | --- |
| `index.html`, `app/` | the app: router, views, quiz engine, SRS, styles |
| `content/` | embedded course content: `manifest.json` (course map), `pages/` (article HTML), `vtt/` (transcripts), `search-index.json`, `psets.json` |
| `assets/` | figures (SVG/PNG) referenced by the content |
| `study/quizzes/`, `study/flashcards/` | authored question banks and decks (JSON) |
| `viz/` | interactive demo widgets (self-contained ES modules) |
| `vendor/katex/` | math rendering (used by the IO cost model page) |
| `tools/build_content.py` | regenerates `content/` + `assets/` from a site mirror |

## Updating content when the course site changes

Mirror the site, then rebuild:

```bash
python3 tools/sync_site.py /tmp/cs145-mirror     # 1. mirror the live site
python3 tools/build_content.py /tmp/cs145-mirror .   # 2. rebuild content/ + assets/
```

Your study data (reading progress, quiz history, flashcard schedule) lives in
`localStorage` in your browser — use **Progress → Export** for backups.
