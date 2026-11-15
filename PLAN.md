# PLAN — TubeShelf Web (read-only viewer)

Status: **planning only. No implementation yet.** This file is the contract for
whoever builds it next.

## 1. Goal

A static, zero-server web page that opens a **TubeShelf backup file** and lets you
browse it read-only: categories, channels, search, and the slide deck. The file is
chosen from disk and parsed in the browser. It is never uploaded, and nothing about
it is persisted.

Non-goals: editing, adding videos, tag management, profiles, accounts, sync,
analytics, uploads.

Why it exists: the Mac app can export one JSON backup. A friend without the app
can still read a shared shelf. A friend with the app imports it as a profile.

## 2. Hosting and repo

- Public repo `somphol/tubeshelf-web-ro`, GitHub Pages from `main` / root.
- Target URL: `https://somphol.github.io/tubeshelf-web-ro/`
- No build step, no bundler, no dependencies. Native ES modules, served as-is.
- The repo must never contain a real shelf. `src/demo.js` ships seven public
  YouTube videos for first-visit interest.

## 3. File format contract

The viewer accepts two shapes.

**A. Backup envelope (preferred, written by the Mac app):**

```json
{
  "format": "tubeshelf.backup",
  "version": 1,
  "exportedAt": "2026-11-14T15:42:07Z",
  "library": {
    "videos": [
      {
        "id": "BEA1E34F-7601-4BB1-A159-442AE37BFC86",
        "youtubeID": "dQw4w9WgXcQ",
        "title": "Never Gonna Give You Up",
        "channel": "Rick Astley",
        "tags": ["Music"],
        "note": "optional, may be empty",
        "addedAt": "2026-11-14T15:42:07Z",
        "durationSeconds": 213,
        "isFavorite": false
      }
    ],
    "pinnedTags": ["Music"]
  }
}
```

**B. Raw library file** — the same `{ "videos": [...], "pinnedTags": [...] }`
object without the envelope. Users copy this out of Application Support, so it must
keep working.

**C. Playlist catalog (optional).** The envelope may carry
`playlists: [{ id, title, channel, items: [{ videoID, title, channel, durationSeconds }],
watchedItemIDs, tags, isTruncated, addedAt, fetchedAt }]`. Treat it as absent when
missing: a viewer that ignores it still shows every video. Fields are additive, so
`version` stays 1.

`format.schema.json` in this repo is the machine-readable version of the above.

### Validation rules (exact)

1. File must be valid JSON and under **32 MB**. Anything else: one clear error line,
   never a blank screen.
2. If a top-level `format` key exists, it must equal `tubeshelf.backup`.
   - `version > 1` → "This backup was written by a newer TubeShelf. Update the app
     first." Do not attempt to render it.
   - `version <= 1` → read `library`.
3. If there is no `format` key, the top-level object must contain a `videos` array,
   otherwise reject. **Do not** treat arbitrary JSON as an empty shelf; that is how
   a viewer convinces someone their data vanished.
4. Videos:
   - `youtubeID` must match `^[A-Za-z0-9_-]{11}$`; drop the entry otherwise (never
     invent a link).
   - `title` missing → "Untitled"; `channel` missing → "".
   - `tags`: trim, drop empties, de-duplicate case-insensitively, keep first spelling.
   - `isFavorite` defaults false; `durationSeconds` defaults absent; `note` defaults "".
   - `watchStatus` is `unwatched | watching | done`; missing means `unwatched`.
5. Cap at **50,000 videos**; report the cap rather than freezing.
6. Unknown fields are ignored, never rejected — the format will grow.
7. Empty `videos` array is valid but shows the empty-state explanation
   ("This backup contains no videos").

## 4. Architecture

```
index.html          shell, CSP meta, mount points
styles.css          tokens + layout, system fonts only
format.schema.json  the contract above
src/
  format.js         decode + validate + normalise → { videos, pinnedTags, exportedAt }
  shelf.js          pure query layer: filters, search, pagination, counts
  demo.js           seven public videos (no fetch, satisfies CSP)
  app.js            DOM rendering, file input, drag-drop, deck, keyboard
tests/
  format.test.js    node --test
  shelf.test.js     node --test
```

`format.js` and `shelf.js` **must not touch the DOM** so they can be tested under
Node and reused later by a native client.

## 5. UI specification

Desktop (≥ 900 px): two columns.

- **Header**: file name, "Read-only" badge, `exportedAt` date, `N videos · M
  categories`, a "Choose another file" button.
- **Sidebar** (238 px): search box for the category/channel lists; then
  - All videos (count)
  - Favorites
  - Unsorted (no tags)
  - **Pinned** (from `pinnedTags`, only categories that exist)
  - Categories, sorted by video count desc, with counts
  - Channels, top 5 by count plus "All N ›" opening a channel sheet
- **Grid**: 16:9 thumbnails from `https://i.ytimg.com/vi/<id>/maxresdefault.jpg`,
  falling back to `sddefault`, `hqdefault`, `mqdefault`, then a placeholder.
  Duration badge, favourite star, up to 2 tag chips.
- **Pager**: `1–48 of 312 · Page 1 of 7`, page size 24/48/96/144 (default 48),
  ⌥← / ⌥→.
- **Search**: one field, scope switch **Titles** / **Everything** (title, channel,
  note, tags). Every term must match; case and diacritics folded.

Deck (overlay, same as the app). It carries two slide types — a video and a course:

- Dark backdrop using the current thumbnail, blurred.
- Slide `N / M`, title, channel (click → filter), duration, saved date, tags,
  note.
- `Play here` toggles an `https://www.youtube-nocookie.com/embed/<id>?rel=0`
  iframe; on load failure, revert and point at YouTube.
- Filmstrip shows **±20 slides around the current one** (never all of them), with
  the current one highlighted and scrolled into view.
- Keyboard: ← → move, Home/End first/last, Esc closes. A mouse wheel/trackpad
  swipe moves too (wheel notches are small; use a low threshold).
- Return to the shelf keeps the active filter and page.

Narrow (< 760 px, iPad/phone):

- Sidebar collapses into a horizontal chip row (All, Favorites, Pinned, then
  categories) above the grid; channels move into the search sheet.
- Grid becomes 2 columns ≤ 900 px, 1 column ≤ 520 px.
- Deck stacks: image on top, text below, controls at the bottom.
- Nothing may horizontally scroll.

States: no file yet (picker + "open the demo"), parsing, invalid file (reason +
retry), valid but empty, and no search results (with the scope hint when in Titles).

## 6. Security and limits

- Render text with `textContent` only. Never `innerHTML` for file-derived data.
- Validate every video ID before building a URL; only construct URLs on
  `youtube.com`, `youtu.be`, `i.ytimg.com`, `youtube-nocookie.com`.
- CSP in `index.html`:
  `default-src 'none'; script-src 'self'; style-src 'self'; img-src https://i.ytimg.com data:; frame-src https://www.youtube-nocookie.com; base-uri 'none'; form-action 'none'`
- No analytics, no external fonts, no remote scripts. The only requests the page
  makes are thumbnails and an embed when the user presses play.
- The chosen file is read with `FileReader`/`file.text()`; it never goes over the
  network and is not written to localStorage, IndexedDB or a service worker.
- File input: `accept=".json,application/json"`, plus drag-and-drop on the whole
  page with a visible drop target.

## 7. Performance

- Pagination caps rendered cards at 144.
- Thumbnails: `loading="lazy"`, `decoding="async"`, fixed 16:9 box to avoid layout
  shift.
- Derived lists (counts, filters) computed once per file load and memoised; the
  search runs on keystroke against normalised strings.
- No virtual scrolling needed at the 50k cap with pages of 144.

## 8. Build order

1. `format.js` + `format.schema.json` + tests (corrupt, foreign, future version,
   missing fields, bad IDs, 50k cap).
2. `shelf.js` + tests (filters, pinned, channels, title/all search, pagination
   clamping).
3. `index.html` + `styles.css`: picker, header, sidebar, grid, pager.
4. Deck, player, keyboard, filmstrip window.
5. Responsive pass at 390 px and 1024 px; empty/error states.
6. `demo.js`, screenshots, Pages, `AGENTS.md`, push.

## 9. Acceptance checklist

- [ ] Envelope v1 loads; raw `library.json` loads; `version: 2` is refused with the
      update message; arbitrary JSON is refused with a reason.
- [ ] 50,000-video file loads without freezing; pages render ≤ 144 cards.
- [ ] A hostile file (`<img onerror>`, `javascript:` URLs, 500-char tags, non-ASCII
      titles) renders as inert text and links only to YouTube.
- [ ] Exactly two outbound hosts are possible: `i.ytimg.com`, and
      `youtube-nocookie.com` after pressing play.
- [ ] Keyboard: ← → Esc in the deck; ⌥← / ⌥→ pages; Esc closes the deck, not the page.
- [ ] 390 px wide: no horizontal scrolling, deck readable, chips scroll.
- [ ] A backup with `playlists` shows course cards; a course opens its ordered
      chapter list and a course slide presents as a poster.
- [ ] A missing `playlists` key still loads every video.
- [ ] Reload leaves no trace of the file (no storage, no cached network request).
- [ ] `https://somphol.github.io/tubeshelf-web-ro/` serves the demo.

## 10. Verification commands

```bash
node --test tests/            # pure modules

python3 -m http.server 8765   # ES modules need http://, not file://
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --disable-gpu --hide-scrollbars \
  --window-size=1240,800 \
  --screenshot=/tmp/web-desktop.png "http://localhost:8765/?demo=1"

"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --disable-gpu --hide-scrollbars \
  --window-size=390,844 \
  --screenshot=/tmp/web-mobile.png "http://localhost:8765/?demo=1"
```

`?demo=1` loads `src/demo.js` without a file picker so headless checks can render.

## 11. Risks and open questions

- **Thumbnail hotlinking** may be blocked on some networks or by privacy settings;
  the placeholder must be good and the YouTube link must always work.
- **Embeddings** can be disabled per video; the player needs the fallback path.
- **Pages on a public repo** is a deliberate choice: it contains code and a public
  demo only. Never add a real backup to this repository, and never add a "load from
  URL" feature that could be pointed at someone's hosted shelf.
- **Format drift**: if the Mac app bumps the envelope, update this repo's
  `format.schema.json` and tests in the same change.

## 12. Handoff

This repository currently contains documentation only. The Mac app that writes the
format lives in a **private** repo; the contract above is complete enough to build
against without access to it. Generate a fixture with any JSON that satisfies
`format.schema.json`, or copy `src/demo.js` into that shape.
