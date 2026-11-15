# TubeShelf Web (read-only)

A static page that opens a **TubeShelf backup** and lets you browse it read-only:
categories, channels, search, and the slide deck.

The file you choose is parsed in your browser. It is never uploaded, and reloading
the page forgets it.

> **Status: planning.** No implementation yet. The contract now covers watch
> state and the playlist catalog, not just videos. `PLAN.md` is the build contract,
> `AGENTS.md` is the handoff, `format.schema.json` is the accepted file format.

- Plan: [PLAN.md](PLAN.md)
- Handoff: [AGENTS.md](AGENTS.md)
- Format: [format.schema.json](format.schema.json)

## Privacy

This repository is public and contains no shelves. The demo is seven public YouTube
videos. The viewer makes exactly two kinds of network request: thumbnails from
`i.ytimg.com`, and an embed from `youtube-nocookie.com` when you press play.
