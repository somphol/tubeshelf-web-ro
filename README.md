# TubeShelf Web (read-only)

A static page that opens a **TubeShelf backup** and lets you browse it read-only:
categories, channels, search, the playlist catalog, and the slide deck.

The file you choose is parsed in your browser. It is never uploaded, and reloading
the page forgets it.

- Live: <https://somphol.github.io/tubeshelf-web-ro/>
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
- Sidebar: All, Favorites, Unwatched, Unsorted, Playlist Catalog, pinned and all
  categories (videos + courses), and channels. The filter field searches the lists.
- Grid with videos and, in a category that contains them, course cards — the same
  mixing as the Mac app. Pagination at 24/48/96/144, shuffle.
- Search scope: Titles or Everything (channel, note, categories).
- Slide deck: video slides and course poster slides, arrow keys, Home/End, Esc,
  mouse wheel, filmstrip and progress. Playback opens YouTube; nothing is embedded.
- Course sheet: ordered chapters with per-course ticks, on-shelf markers, and
  *Present* for the chapters you own.
- Artwork retry: cards that exhaust every thumbnail quality show *No artwork —
  click to retry*, and a **Fix N thumbnail(s)** button appears in the header.
  Retries bypass cached 404s with a fresh query string.

## Privacy

This repository is public and contains no shelves. The demo is seven public YouTube
videos. The viewer makes exactly one kind of network request: thumbnails from
`i.ytimg.com`. There is no analytics, no storage, no iframe and no upload.
