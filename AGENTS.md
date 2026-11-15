# AGENTS.md

Read `PLAN.md`. It is the specification for this repository.

## What it is

A static, read-only web viewer for TubeShelf backup files. One page, no build step,
no server, no dependencies. A visitor picks a JSON backup; it is parsed in the
browser and never uploaded.

It is **not** an editor, a sync client, or a backend. It must never store a shelf or
send one anywhere.

## Current state

**Implemented.** `index.html`, `styles.css`, `src/{format,shelf,app,demo}.js`, and
`node --test` coverage. `PLAN.md` remains the specification; this file records what
actually shipped.

## Commands

```bash
node --test tests/                      # 17 tests: parsing, filters, pagination, catalog flag
python3 -m http.server 8765             # ES modules require http://
open "http://localhost:8765/?demo=1"
```

Query flags for checks: `?demo=1`, `&catalog=1`, `&deck=playlist`, `&course=1`.

Headless visual check (Chrome is installed on this Mac):

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --disable-gpu --hide-scrollbars \
  --window-size=1240,800 --screenshot=/tmp/web-desktop.png \
  "http://localhost:8765/?demo=1"
```

There is **no** build, bundler or package.json dependency to install. Do not add one
without a strong reason; the value of this page is that it is auditable in one
sitting.

## Architecture

- `src/format.js` — decode and validate the two accepted shapes, normalise videos.
  Pure, no DOM, unit tested.
- `src/shelf.js` — filters, search, counts, pagination. Pure, no DOM, unit tested.
- `src/app.js` — rendering, file input, drag-drop, deck, course sheet, keys/wheel.
- `src/demo.js` — seven public videos, imported as a module so no fetch is needed.
- `index.html` / `styles.css` — shell and layout. System fonts only.

Dependency direction: `app.js → shelf.js → format.js`. Never the other way.

## Decisions and constraints

- **The format is additive and version 1.** `watchStatus`, `playlists` and
  `pinnedChannels` were added after this plan was written; treat every new field as
  optional, and never bump `version` for additions. The Mac app is the source of
  truth.
- **No embedded playback.** Course slides are posters and video slides link out.
- **The file never leaves the browser.** No upload, no analytics, no localStorage,
  IndexedDB or service worker. A reload must forget the file.
- **Text is rendered with `textContent`.** File-derived strings never go through
  `innerHTML`, and every link host is checked against an allowlist
  (`youtube.com`, `youtu.be`, `i.ytimg.com`, `youtube-nocookie.com`).
- **Validate before rendering.** Video IDs must match `^[A-Za-z0-9_-]{11}$`;
  reject foreign JSON; refuse `version > 1`; cap the file at 32 MB and the shelf at
  50,000 videos.
- **No shelf data in this repository.** It is public. The demo file is public
  YouTube links only. Never add a "load from URL" feature.
- **The format is owned by the Mac app.** `format.schema.json` is a copy, not the
  source of truth; bump it together with the app and the tests.
- **Read-only means read-only.** No editing affordances, no "suggest a tag", no
  write path — not even a disabled button.

## Known issues

- Thumbnails fall back through a per-slot ladder: `full` (maxres → sd → hq → mq)
  for video cards and deck slides, `cover` (maxres → hq → mq) for course posters,
  and `small` (hq → mq) for the filmstrip and course rows. A missing `maxres` is
  often **HTTP 404 with a 120×90 grey "…" image body**; Chrome decodes it and
  fires `load`, not `error`, so `withFallback()` treats a natural width ≤ 120 as a
  miss. Course covers try up to six chapters. Cards that exhaust every source show
  a clickable placeholder and raise **Fix N thumbnails**; a retry appends `?r=<n>`
  only to the IDs that failed, so the other cards stay cache hits.
- **No YouTube Data API.** Artwork comes from unauthenticated `i.ytimg.com`
  images: no key, no quota, no `googleapis.com`. Probes are sequential per card
  (next quality is requested only after the previous body is rejected), and the
  browser caps connections per host.
- A backup exported before the catalog shipped has no `playlists` key. The viewer
  reports `no playlist catalog` and explains it in the catalog view; it is not an
  empty catalog. `decodeBackup` exposes `hasPlaylistCatalog` for this distinction.
- The viewer is read-only: no ticking, tagging or file writing.
- 390 px is verified with Puppeteer-driven emulation (Chrome headless clamps
  `--window-size` to 500 CSS px, so use `puppeteer-core` for narrow checks).
- `style-src` allows `'unsafe-inline'` because progress bars set widths inline.
  Scripts remain `'self'` only; there is no user-controlled CSS.

## Continuity

- Repo: <https://github.com/somphol/tubeshelf-web-ro> (public, Pages from `main`).
- Live: <https://somphol.github.io/tubeshelf-web-ro/> (Pages from `main` / root).
- Local check: `python3 -m http.server 8765` then `?demo=1`.
- The writer of the format (the Mac app) is private and not required to implement
  this plan.
