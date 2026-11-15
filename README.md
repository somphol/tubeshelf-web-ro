# TubeShelf Web (read-only)

A static page that opens a **TubeShelf backup** and lets you browse it read-only:
categories, channels, search, the playlist catalog, and the slide deck.

The file you choose is parsed in your browser. It is never uploaded, and reloading
the page forgets it.

- Live: <https://somphol.github.io/tubeshelf-web-ro/>
- Need to edit a backup? Use the companion app:
  <https://somphol.github.io/tubeshelf-web-rw/> (phase 1).
- Spec: [PLAN.md](PLAN.md)
- Handoff: [AGENTS.md](AGENTS.md)
- Format: [format.schema.json](format.schema.json)

## Run it

```bash
python3 -m http.server 8765
open "http://localhost:8765/?demo=1"     # demo shelf
```

Choose a backup with the button, or drop the `.json` anywhere on the page.

## What it does

- Reads the versioned `tubeshelf.backup` envelope, a raw `library.json`, and the
  optional playlist catalog. Older backups without `playlists` still load, and the
  catalog view explains that the file predates the catalog instead of implying it
  is empty.
- Sidebar: All, Favorites, Unwatched, Unsorted, Playlist Catalog, pinned categories
  and pinned channels, all categories (videos + courses), and channels. The filter
  field searches the lists; a pinned channel leaves the Channels list.
- Grid with videos and, in a category that contains them, course cards — the same
  mixing as the Mac app. Pagination at 24/48/96/144, shuffle.
- Search scope: Titles or Everything (channel, note, categories).
- Slide deck: video slides and course poster slides, arrow keys, Home/End, Esc,
  mouse wheel, filmstrip and progress. Playback opens YouTube; nothing is embedded.
- Course sheet: ordered chapters with per-course ticks, on-shelf markers, and
  *Present* for the chapters you own.
- Artwork retry: a missing `maxres` quality is detected even when YouTube answers
  with a 404 plus a decodable 120×90 grey image. Quality fallback then chapter
  fallback for course covers; cards that exhaust every source show *No artwork —
  click to retry*, and a **Fix N thumbnail(s)** button appears in the header.
  Retries re-request only the failed IDs, with a fresh query string.

## Privacy

This repository is public and contains no shelves. The demo is seven public YouTube
videos. The viewer makes exactly one kind of network request: thumbnails from
`i.ytimg.com`. There is no YouTube Data API call (no key, no quota), no analytics,
no storage, no iframe and no upload.
