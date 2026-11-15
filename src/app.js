import {
  decodeBackup,
  thumbnailCandidates,
  formatDuration,
  watchURL,
  playlistURL,
} from "./format.js";
import {
  categoryCounts,
  channelCounts,
  shelfItems,
  pageWindow,
  pageSlice,
  courseProgress,
  courseWatchedCount,
  playlistWatched,
  matches,
  PAGE_SIZES,
} from "./shelf.js";
import { demoBackup } from "./demo.js";

/* ---------- tiny DOM helper: text only, never innerHTML ---------- */
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key === "dataset") Object.assign(node.dataset, value);
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

const $ = (selector) => document.querySelector(selector);
const state = {
  data: null,
  fileName: "",
  filter: { kind: "all" },
  query: "",
  scope: "everything",
  page: 0,
  pageSize: 48,
  sidebarQuery: "",
  deck: null,
  course: null,
  shuffleSeed: null,
  // Thumbnails can fail transiently (CDN cold cache, offline blip). Remember
  // which IDs exhausted every quality so the header can offer a retry, and
  // bump a counter to defeat the browser's cached 404s.
  thumbFailures: new Set(),
  thumbFailedIDs: new Set(),
  retryIDs: new Set(),
  thumbAttempt: 0,
};

const FILTER_TITLES = {
  all: "All videos",
  favorites: "Favorites",
  unwatched: "Unwatched",
  unsorted: "Unsorted",
  playlists: "Playlist Catalog",
};

/**
 * Resolution ladders per slot. Small slots skip maxres on purpose: an old
 * course can otherwise spend three 404s before reaching a usable 480 px image,
 * and a filmstrip tile is 84 px wide.
 */
const THUMB_LADDERS = {
  full: ["maxresdefault", "sddefault", "hqdefault", "mqdefault"],
  cover: ["maxresdefault", "hqdefault", "mqdefault"],
  small: ["hqdefault", "mqdefault"],
};

/* ---------- loading ---------- */

function loadText(text, name) {
  try {
    const data = decodeBackup(text);
    state.data = data;
    state.fileName = name;
    state.filter = { kind: "all" };
    state.query = "";
    state.page = 0;
    state.shuffleSeed = null;
    state.thumbFailures.clear();
    state.thumbFailedIDs.clear();
    state.retryIDs.clear();
    state.thumbAttempt = 0;
    closeDeck();
    closeCourse();
    $("#landing").hidden = true;
    $("#main").hidden = false;
    render();
    toast(
      `${data.videos.length} videos · ${
        data.hasPlaylistCatalog
          ? `${data.playlists.length} playlists`
          : "no playlist catalog"
      }${data.exportedAt ? " · exported " + new Date(data.exportedAt).toLocaleDateString() : ""}`
    );
  } catch (error) {
    toast(error.message || "That file could not be read.");
  }
}

async function loadFile(file) {
  if (!file) return;
  if (file.size > 32 * 1024 * 1024) {
    toast("That file is larger than 32 MB.");
    return;
  }
  loadText(await file.text(), file.name);
}

function loadDemo() {
  loadText(JSON.stringify(demoBackup), "demo-shelf.json");
}

/* ---------- rendering ---------- */

function render() {
  if (!state.data) return;
  renderMeta();
  renderSidebar();
  renderContent();
}

function renderMeta() {
  const data = state.data;
  const meta = $("#file-meta");
  meta.textContent = "";
  const parts = [
    state.fileName,
    `${data.videos.length} videos`,
    data.hasPlaylistCatalog
      ? `${data.playlists.length} playlist${data.playlists.length === 1 ? "" : "s"}`
      : "no playlist catalog",
  ];
  if (data.exportedAt) parts.push(`exported ${new Date(data.exportedAt).toLocaleDateString()}`);
  meta.append(el("span", { text: parts.join("  ·  ") }));
}

function renderSidebar() {
  const data = state.data;
  const sidebar = $("#sidebar");
  sidebar.replaceChildren();

  const search = el("div", { class: "side-search" },
    el("input", {
      type: "search",
      placeholder: "Filter categories & channels",
      value: state.sidebarQuery,
      oninput: (event) => {
        state.sidebarQuery = event.target.value;
        renderSidebar();
      },
    })
  );
  sidebar.append(search);

  const needle = state.sidebarQuery.trim();
  const categories = categoryCounts(data.videos, data.playlists).filter((entry) =>
    !needle || matches(entry.name, needle)
  );
  const channels = channelCounts(data.videos).filter((entry) => !needle || matches(entry.name, needle));
  const pinned = data.pinnedTags
    .map((name) => categories.find((c) => c.name.toLowerCase() === name.toLowerCase()))
    .filter(Boolean);
  const pinnedChannelRows = data.pinnedChannels
    .map((name) => channels.find((c) => c.name.toLowerCase() === name.toLowerCase()))
    .filter(Boolean);
  const pinnedChannelKeys = new Set(pinnedChannelRows.map((c) => c.name.toLowerCase()));

  sidebar.append(sideList("Library", [
    row("All videos", data.videos.length, { kind: "all" }),
    row("Favorites", data.videos.filter((v) => v.isFavorite).length, { kind: "favorites" }),
    row("Unwatched", data.videos.filter((v) => v.watchStatus !== "done").length, { kind: "unwatched" }),
    row("Unsorted", data.videos.filter((v) => v.tags.length === 0).length, { kind: "unsorted" }),
    row("Playlist Catalog", data.playlists.length, { kind: "playlists" }),
  ]));

  if (pinned.length || pinnedChannelRows.length) {
    sidebar.append(sideList("Pinned", [
      ...pinned.map((entry) => row(entry.name, entry.count, { kind: "tag", value: entry.name })),
      ...pinnedChannelRows.map((entry) => row(entry.name, entry.count, { kind: "channel", value: entry.name })),
    ]));
  }

  const rest = categories.filter((entry) => !pinned.some((p) => p.name === entry.name));
  const categoryRows = rest.map((entry) => row(entry.name, entry.count, { kind: "tag", value: entry.name }));
  if (!categoryRows.length) categoryRows.push(el("div", { class: "side-empty", text: "No categories yet" }));
  sidebar.append(sideList("Categories", categoryRows));

  const channelRows = channels
    .filter((entry) => !pinnedChannelKeys.has(entry.name.toLowerCase()))
    .slice(0, 40)
    .map((entry) => row(entry.name, entry.count, { kind: "channel", value: entry.name }));
  if (channelRows.length) sidebar.append(sideList("Channels", channelRows));
}

function sideList(title, rows) {
  return el("section", {},
    el("h3", { text: title }),
    el("ul", { class: "side-list" }, rows.map((rowNode) => el("li", {}, rowNode)))
  );
}

function row(label, count, filter) {
  const active = activeFilter(filter);
  return el("button", {
    class: active ? "active" : "",
    title: label,
    onclick: () => {
      state.filter = filter;
      state.page = 0;
      state.shuffleSeed = null;
      render();
    },
  },
    el("span", { class: "label", text: label }),
    el("span", { class: "count", text: String(count) })
  );
}

function activeFilter(filter) {
  const a = state.filter;
  if (a.kind !== filter.kind) return false;
  if (filter.kind === "tag" || filter.kind === "channel") {
    return a.value.toLowerCase() === filter.value.toLowerCase();
  }
  return true;
}

function filterTitle() {
  if (state.filter.kind === "tag") return state.filter.value;
  if (state.filter.kind === "channel") return state.filter.value;
  return FILTER_TITLES[state.filter.kind] || "Shelf";
}

function currentItems() {
  const data = state.data;
  if (state.filter.kind === "playlists") {
    const needle = state.query.trim();
    const items = data.playlists
      .filter((playlist) => !needle || matches([playlist.title, playlist.channel].join(" "), needle))
      .map((playlist) => ({ kind: "playlist", playlist, addedAt: playlist.addedAt }))
      .sort((a, b) => b.addedAt - a.addedAt);
    return items;
  }

  let items = shelfItems(data.videos, data.playlists, state.filter, state.query, state.scope);
  if (state.shuffleSeed !== null) items = seededShuffle(items, state.shuffleSeed);
  return items;
}

function renderContent() {
  const content = $("#content");
  content.replaceChildren();
  const items = currentItems();
  const window = pageWindow(items.length, state.pageSize, state.page);
  const pageItems = pageSlice(items, window);

  const head = el("div", { class: "content-head" },
    el("div", {},
      el("h2", { text: filterTitle() }),
      el("div", { class: "sub", text: subtitle(items, window) })
    ),
    el("div", { class: "grow" }),
    el("div", { class: "search" },
      el("input", {
        type: "search",
        placeholder: "Search titles…",
        value: state.query,
        oninput: (event) => {
          state.query = event.target.value;
          state.page = 0;
          renderContent();
        },
      }),
      el("select", {
        title: "Search scope",
        onchange: (event) => {
          state.scope = event.target.value;
          state.page = 0;
          renderContent();
        },
      },
        el("option", { value: "titles", selected: state.scope === "titles", text: "Titles" }),
        el("option", { value: "everything", selected: state.scope === "everything", text: "Everything" })
      )
    ),
    retryButton(),
    shuffleButton()
  );
  content.append(head);

  if (!items.length) {
    content.append(emptyState());
    return;
  }

  const grid = el("div", { class: "grid" });
  for (const item of pageItems) {
    grid.append(item.kind === "video" ? videoCard(item.video) : courseCard(item.playlist));
  }
  content.append(grid);
  if (window.pageCount > 1) content.append(pager(items, window));
}

function subtitle(items, window) {
  const videos = state.data.videos.length;
  const courses = state.data.playlists.length;
  if (state.filter.kind === "playlists") {
    if (!state.data.hasPlaylistCatalog) {
      return "This backup was exported without its playlist catalog";
    }
    return `${courses} course${courses === 1 ? "" : "s"} · ${state.data.playlists.reduce((n, p) => n + p.items.length, 0)} chapters`;
  }
  if (state.filter.kind === "tag") {
    const tagged = items.filter((item) => item.kind === "playlist").length;
    return `${videos} videos · ${tagged} course${tagged === 1 ? "" : "s"} · ${window.rangeLabel}`;
  }
  if (state.query.trim()) return `${window.rangeLabel} matching “${state.query.trim()}”`;
  return `${videos} videos · ${window.rangeLabel}`;
}

function shuffleButton() {
  const active = state.shuffleSeed !== null;
  return el("button", {
    class: "button",
    title: active ? "New random order" : "Shuffle this list",
    style: active ? "border-color: var(--accent); color: var(--accent)" : "",
    onclick: () => {
      state.shuffleSeed = active ? randomSeed() : randomSeed();
      state.page = 0;
      renderContent();
    },
  }, active ? "Shuffle again" : "Shuffle");
}

function retryButton() {
  const count = state.thumbFailures.size;
  return el("button", {
    class: "button warn",
    id: "retry-thumbs",
    hidden: count === 0,
    title: "Reload artwork that failed to load",
    onclick: retryThumbnails,
  }, retryLabel(count));
}

function retryLabel(count) {
  return `Fix ${count} thumbnail${count === 1 ? "" : "s"}`;
}

function refreshRetryButton() {
  const button = document.getElementById("retry-thumbs");
  if (!button) return;
  const count = state.thumbFailures.size;
  button.hidden = count === 0;
  button.textContent = retryLabel(count);
}

function retryThumbnails() {
  // Only the failed IDs get a new query string; everything else stays a cache
  // hit, so a retry cannot turn into a 48-image burst.
  state.retryIDs = new Set(state.thumbFailedIDs);
  state.thumbFailedIDs.clear();
  state.thumbFailures.clear();
  state.thumbAttempt += 1;
  if (state.deck) renderDeck();
  renderContent();
  toast("Reloading thumbnails…");
}

/** Append the retry counter so a known-404 URL is not served from cache. */
function withAttempt(videoID, url) {
  return state.retryIDs.has(videoID) ? `${url}?r=${state.thumbAttempt}` : url;
}

function pager(items, window) {
  return el("div", { class: "pager" },
    el("button", {
      class: "button",
      disabled: window.isFirst,
      onclick: () => {
        state.page = window.index - 1;
        renderContent();
      },
    }, "Previous"),
    el("span", { text: window.rangeLabel }),
    el("span", { class: "grow" }),
    el("span", { text: `Page ${window.index + 1} of ${window.pageCount}` }),
    el("select", {
      title: "Go to page",
      onchange: (event) => {
        state.page = Number(event.target.value);
        renderContent();
      },
    }, Array.from({ length: window.pageCount }, (_, index) =>
      el("option", { value: String(index), selected: index === window.index, text: `Page ${index + 1}` })
    )),
    el("select", {
      title: "Page size",
      onchange: (event) => {
        state.pageSize = Number(event.target.value);
        state.page = 0;
        renderContent();
      },
    }, PAGE_SIZES.map((size) =>
      el("option", { value: String(size), selected: size === state.pageSize, text: `${size} per page` })
    )),
    el("button", {
      class: "button",
      disabled: window.isLast,
      onclick: () => {
        state.page = window.index + 1;
        renderContent();
      },
    }, "Next")
  );
}

function emptyState() {
  if (state.query.trim()) {
    return el("div", { class: "empty" },
      el("h3", { text: `Nothing matches “${state.query.trim()}”` }),
      el("p", { text: "Try a shorter word, or switch the scope to Everything." })
    );
  }
  if (state.filter.kind === "playlists") {
    if (!state.data.hasPlaylistCatalog) {
      return el("div", { class: "empty" },
        el("h3", { text: "This backup has no playlist catalog" }),
        el("p", { text: "It was exported before TubeShelf wrote courses into backups. Export again from the current app, then reopen the file. Your videos are all here." })
      );
    }
    return el("div", { class: "empty" },
      el("h3", { text: "No playlists in this backup" }),
      el("p", { text: "The export has an empty catalog." })
    );
  }
  return el("div", { class: "empty" },
    el("h3", { text: "Nothing here" }),
    el("p", { text: "This category is empty in the backup." })
  );
}

/* ---------- cards ---------- */

/**
 * YouTube answers a missing `maxresdefault` with 404 + a 120×90 grey "…" image.
 * Chrome decodes that body and fires `load`, not `error`, so size is the only
 * reliable signal that the quality is absent. Later chapters are tried too:
 * old courses often start with a video whose artwork is gone.
 */
function withFallback(img, urls, onGiveUp) {
  let index = 0;
  const advance = () => {
    index += 1;
    if (index < urls.length) img.src = urls[index];
    else onGiveUp?.();
  };
  img.addEventListener("error", advance);
  img.addEventListener("load", () => {
    if (img.naturalWidth <= 120) advance();
  });
  if (urls.length === 0) onGiveUp?.();
  else img.src = urls[0];
  return img;
}

function imageSources(videoIDs, ladder = "full") {
  const ids = (Array.isArray(videoIDs) ? videoIDs : [videoIDs]).filter(Boolean);
  const qualities = THUMB_LADDERS[ladder] || THUMB_LADDERS.full;
  return ids.flatMap((id) => thumbnailCandidates(id, qualities).map((url) => withAttempt(id, url)));
}

function thumb(videoIDs, badge, ladder = "full") {
  const wrap = el("div", { class: "thumb" });
  const ids = (Array.isArray(videoIDs) ? videoIDs : [videoIDs]).filter(Boolean).slice(0, 6);
  const img = withFallback(el("img", { alt: "", loading: "lazy" }), imageSources(ids, ladder), () => {
    ids.forEach((id) => state.thumbFailedIDs.add(id));
    state.thumbFailures.add(ids[0] || "unknown");
    img.remove();
    wrap.prepend(placeholderNode());
    refreshRetryButton();
  });
  wrap.append(img);
  if (badge) wrap.append(badge);
  return wrap;
}

/** Artwork gave up. Clicking the tile retries without opening the card. */
function placeholderNode() {
  return el("div", {
    class: "placeholder",
    title: "Click to reload this artwork",
    onclick: (event) => {
      event.stopPropagation();
      retryThumbnails();
    },
  },
    el("span", { text: "No artwork" }),
    el("span", { class: "retry", text: "Click to retry" })
  );
}

function durationBadge(seconds) {
  const label = formatDuration(seconds);
  return label ? el("span", { class: "duration", text: label }) : null;
}

function watchFlag(video) {
  if (video.watchStatus === "done") return el("span", { class: "flag", text: "✓ Watched" });
  if (video.watchStatus === "watching") return el("span", { class: "flag", text: "◐ Watching" });
  return null;
}

function videoCard(video) {
  return el("button", {
    class: "card",
    onclick: () => openDeck(indexInDeck(video)),
  },
    thumb(video.youtubeID, el("div", {}, durationBadge(video.durationSeconds), watchFlag(video))),
    el("div", { class: "card-body" },
      el("div", { class: "card-title", text: video.title }),
      el("div", { class: "card-meta" },
        el("span", { text: video.channel || "Unknown channel" }),
        el("span", { class: "dot", text: "·" }),
        el("span", { text: dateLabel(video.addedAt) })
      ),
      tagRow(video.tags)
    )
  );
}

function courseCard(playlist) {
  const watched = courseWatchedCount(playlist);
  return el("button", {
    class: "card",
    onclick: () => openCourse(playlist),
  },
    thumb(playlist.items.map((item) => item.videoID), el("span", {
      class: "chapters",
      text: `${playlist.items.length} chapters`,
    }), "cover"),
    el("div", { class: "card-body" },
      el("div", { class: "card-title", text: playlist.title }),
      el("div", { class: "card-meta" },
        el("span", { text: playlist.channel || "Playlist" }),
        el("span", { class: "dot", text: "·" }),
        el("span", { text: `${watched}/${playlist.items.length} watched` })
      ),
      el("div", { class: "progress" }, el("span", { style: `width:${Math.round(courseProgress(playlist) * 100)}%` })),
      tagRow(playlist.tags)
    )
  );
}

function tagRow(tags) {
  if (!tags || !tags.length) return el("div", { class: "card-tags" }, el("span", { class: "chip", text: "Unsorted" }));
  return el("div", { class: "card-tags" }, tags.slice(0, 3).map((tag) => el("span", { class: "chip", text: tag })));
}

function indexInDeck(video) {
  const items = currentItems();
  const index = items.findIndex((item) => item.kind === "video" && item.video.youtubeID === video.youtubeID);
  return { items, index: index < 0 ? 0 : index };
}

/* ---------- deck ---------- */

function openDeck({ items, index }) {
  if (!items.length) return;
  state.deck = { items, index: Math.max(0, Math.min(index, items.length - 1)) };
  $("#deck").hidden = false;
  renderDeck();
}

function closeDeck() {
  state.deck = null;
  $("#deck").hidden = true;
}

function deckStep(delta) {
  if (!state.deck) return;
  const next = state.deck.index + delta;
  if (next < 0 || next >= state.deck.items.length) return;
  state.deck.index = next;
  renderDeck();
}

function deckJump(index) {
  if (!state.deck) return;
  state.deck.index = Math.max(0, Math.min(index, state.deck.items.length - 1));
  renderDeck();
}

function currentSlide() {
  return state.deck ? state.deck.items[state.deck.index] : null;
}

function renderDeck() {
  const deck = $("#deck");
  deck.replaceChildren();
  const slide = currentSlide();
  if (!slide) return;
  const video = slide.kind === "video" ? slide.video : null;
  const playlist = slide.kind === "playlist" ? slide.playlist : null;
  const backdropID = video ? video.youtubeID : playlist.items[0]?.videoID;

  const backdrop = el("div", { class: "deck-backdrop" });
  if (backdropID) {
    const chapterIDs = playlist ? playlist.items.slice(0, 3).map((item) => item.videoID) : [backdropID];
    backdrop.append(withFallback(el("img", { alt: "", loading: "lazy" }), imageSources(chapterIDs, "small"), () => {}));
  }

  const top = el("div", { class: "deck-top" },
    el("button", { class: "pill", onclick: closeDeck }, "‹ Shelf"),
    el("span", { text: filterTitle() }),
    el("div", { class: "right" },
      el("span", { text: `${state.deck.index + 1} / ${state.deck.items.length}` }),
      el("button", { class: "pill", onclick: closeDeck, title: "Close (esc)" }, "✕")
    )
  );

  const media = el("div", { class: "deck-media" });
  if (video) {
    const img = withFallback(el("img", { alt: "" }), imageSources(video.youtubeID), () => {
      img.style.visibility = "hidden";
    });
    media.append(img);
  } else {
    const mosaic = el("div", { class: "mosaic", style: "max-width:min(100%,780px);width:100%" });
    for (const item of playlist.items.slice(0, 9)) {
      const img = withFallback(el("img", { alt: "", loading: "lazy" }), imageSources(item.videoID, "cover"), () => {
        img.remove();
      });
      img.style.width = "100%";
      img.style.aspectRatio = "16 / 9";
      img.style.objectFit = "cover";
      mosaic.append(img);
    }
    media.append(mosaic);
  }
  media.append(el("button", {
    class: "deck-nav prev",
    disabled: state.deck.index === 0,
    title: "Previous (←)",
    onclick: () => deckStep(-1),
  }, "‹"));
  media.append(el("button", {
    class: "deck-nav next",
    disabled: state.deck.index >= state.deck.items.length - 1,
    title: "Next (→)",
    onclick: () => deckStep(1),
  }, "›"));

  const info = video ? videoInfo(video) : courseInfo(playlist);
  const body = el("div", { class: "deck-body" }, media, info);

  const film = el("div", { class: "filmstrip" });
  const radius = 20;
  const lower = Math.max(0, state.deck.index - radius);
  const upper = Math.min(state.deck.items.length, state.deck.index + radius + 1);
  for (let index = lower; index < upper; index += 1) {
    const item = state.deck.items[index];
    const ids = item.kind === "video"
      ? [item.video.youtubeID]
      : item.playlist.items.slice(0, 3).map((chapter) => chapter.videoID);
    const button = el("button", {
      class: index === state.deck.index ? "current" : "",
      onclick: () => deckJump(index),
      title: item.kind === "video" ? item.video.title : item.playlist.title,
    });
    if (ids.length) {
      button.append(withFallback(el("img", { alt: "", loading: "lazy" }), imageSources(ids, "small"), () => {}));
    }
    film.append(button);
  }

  const progress = el("div", { class: "deck-progress" },
    el("span", { style: `width:${((state.deck.index + 1) / state.deck.items.length) * 100}%` })
  );

  const controls = el("div", { class: "deck-controls" },
    el("button", { class: "button", disabled: state.deck.index === 0, onclick: () => deckStep(-1) }, "‹ Previous"),
    el("span", { class: "grow" }),
    el("a", {
      class: "link",
      href: video ? watchURL(video.youtubeID) : playlistURL(playlist.id),
      target: "_blank",
      rel: "noreferrer noopener",
      text: "Open on YouTube",
    }),
    el("span", { class: "grow" }),
    el("button", {
      class: "button",
      disabled: state.deck.index >= state.deck.items.length - 1,
      onclick: () => deckStep(1),
    }, "Next ›")
  );

  deck.append(backdrop, top, body, film, progress, controls);
}

function videoInfo(video) {
  return el("div", { class: "deck-info" },
    el("div", { class: "deck-kicker", text: "SLIDE" }),
    el("div", { class: "deck-title", text: video.title }),
    el("div", { class: "deck-meta" },
      el("span", { text: video.channel || "Unknown" }),
      video.durationSeconds ? el("span", { text: "·" }) : null,
      video.durationSeconds ? el("span", { text: formatDuration(video.durationSeconds) }) : null,
      video.watchStatus === "done" ? el("span", { text: "· Watched" }) : null
    ),
    el("div", { class: "deck-saved", text: `saved ${dateLabel(video.addedAt)}` }),
    tags(video.tags),
    video.note ? el("p", { style: "color:rgba(255,255,255,0.6);font-size:12px;font-style:italic", text: video.note }) : null,
    el("div", { class: "deck-actions" },
      el("a", {
        class: "button primary",
        href: watchURL(video.youtubeID),
        target: "_blank",
        rel: "noreferrer noopener",
        text: "Play on YouTube",
      })
    )
  );
}

function courseInfo(playlist) {
  const chapters = el("div", { class: "deck-chapters" });
  playlist.items.slice(0, 6).forEach((item, index) => {
    chapters.append(el("div", { class: "deck-chapter" },
      el("span", { class: "n", text: String(index + 1) }),
      el("span", { class: "tick", text: playlistWatched(playlist, item.videoID) ? "✓" : "○" }),
      el("span", { text: item.title })
    ));
  });
  if (playlist.items.length > 6) {
    chapters.append(el("div", { class: "deck-chapter" },
      el("span", { class: "n", text: "+" }),
      el("span", { text: `${playlist.items.length - 6} more chapters` })
    ));
  }

  return el("div", { class: "deck-info" },
    el("div", { class: "deck-kicker", text: "COURSE" }),
    el("div", { class: "deck-title", text: playlist.title }),
    el("div", { class: "deck-meta" },
      el("span", { text: playlist.channel || "Playlist" }),
      el("span", { text: "·" }),
      el("span", { text: `${courseWatchedCount(playlist)} of ${playlist.items.length} watched` }),
      playlist.isTruncated ? el("span", { text: "· first batch" }) : null
    ),
    el("div", { class: "progress", style: "margin:10px 0 12px" },
      el("span", { style: `width:${Math.round(courseProgress(playlist) * 100)}%` })
    ),
    tags(playlist.tags),
    chapters,
    el("div", { class: "deck-actions" },
      el("button", { class: "button", onclick: () => openCourse(playlist) }, "Open course"),
      el("a", {
        class: "button primary",
        href: playlistURL(playlist.id),
        target: "_blank",
        rel: "noreferrer noopener",
        text: "YouTube",
      })
    )
  );
}

function tags(list) {
  if (!list || !list.length) return el("div", { class: "deck-tags" }, el("span", { class: "deck-chapter", text: "No category" }));
  return el("div", { class: "deck-tags" }, list.map((tag) =>
    el("button", {
      onclick: () => {
        closeDeck();
        state.filter = { kind: "tag", value: tag };
        state.page = 0;
        render();
      },
      text: tag,
    })
  ));
}

/* ---------- course sheet ---------- */

function openCourse(playlist) {
  state.course = playlist;
  $("#course").hidden = false;
  renderCourse();
}

function closeCourse() {
  state.course = null;
  $("#course").hidden = true;
}

function renderCourse() {
  const sheet = $("#course");
  sheet.replaceChildren();
  const playlist = state.course;
  if (!playlist) return;
  const onShelf = playlist.items.filter((item) => state.data.videos.some((v) => v.youtubeID === item.videoID));

  sheet.append(el("div", { class: "deck-top" },
    el("button", { class: "pill", onclick: closeCourse }, "‹ Back"),
    el("div", { class: "right" },
      el("button", { class: "pill", onclick: closeCourse, title: "Close (esc)" }, "✕")
    )
  ));

  const head = el("div", { class: "course-head" });
  const coverIDs = playlist.items.slice(0, 3).map((item) => item.videoID);
  if (coverIDs.length) {
    head.append(withFallback(el("img", { alt: "" }), imageSources(coverIDs, "cover"), () => {}));
  }
  head.append(el("div", {},
    el("h2", { text: playlist.title }),
    el("div", { class: "deck-meta" },
      el("span", { text: playlist.channel || "Playlist" }),
      el("span", { text: "·" }),
      el("span", { text: `${courseWatchedCount(playlist)} of ${playlist.items.length} watched` }),
      el("span", { text: "·" }),
      el("span", { text: `${onShelf.length} on your shelf` })
    ),
    el("div", { class: "deck-actions" },
      el("a", {
        class: "button",
        href: playlistURL(playlist.id),
        target: "_blank",
        rel: "noreferrer noopener",
        text: "Open on YouTube",
      }),
      onShelf.length
        ? el("button", {
            class: "button primary",
            onclick: () => {
              const items = onShelf
                .map((item) => ({
                  kind: "video",
                  video: state.data.videos.find((v) => v.youtubeID === item.videoID),
                }))
                .filter((item) => item.video);
              closeCourse();
              openDeck({ items, index: 0 });
            },
          }, `Present ${onShelf.length} chapter${onShelf.length === 1 ? "" : "s"}`)
        : null
    )
  ));
  sheet.append(head);

  const list = el("div", { class: "course-list" });
  playlist.items.forEach((item, index) => {
    const video = state.data.videos.find((v) => v.youtubeID === item.videoID);
    list.append(el("div", { class: "course-row" },
      el("span", { class: "idx", text: String(index + 1) }),
      el("span", {
        class: playlistWatched(playlist, item.videoID) ? "tick on" : "tick",
        text: playlistWatched(playlist, item.videoID) ? "✓" : "○",
      }),
      (() => {
        const img = el("img", { alt: "", loading: "lazy" });
        withFallback(img, imageSources(item.videoID, "small"), () => {
          img.style.visibility = "hidden";
        });
        return img;
      })(),
      el("div", {},
        el("div", { class: "title", text: item.title }),
        el("div", { class: "sub", text: [item.channel, formatDuration(item.durationSeconds)].filter(Boolean).join(" · ") })
      ),
      el("span", { class: "shelf", text: video ? "On shelf" : "Not on shelf" })
    ));
  });
  sheet.append(list);
}

/* ---------- helpers ---------- */

function dateLabel(ms) {
  if (!ms) return "";
  return new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function randomSeed() {
  return Math.floor(Math.random() * 0xffffffff) || 1;
}

function seededShuffle(items, seed) {
  let stateSeed = seed >>> 0 || 1;
  const next = () => {
    stateSeed = (stateSeed + 0x9e3779b9) >>> 0;
    let z = stateSeed;
    z = Math.imul(z ^ (z >>> 30), 0xbf58476d1ce4e5b9);
    z = Math.imul(z ^ (z >>> 27), 0x94d049bb133111eb);
    return (z ^ (z >>> 31)) >>> 0;
  };
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = next() % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

let toastTimer = null;
function toast(message) {
  const node = $("#toast");
  node.textContent = message;
  node.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    node.hidden = true;
  }, 4200);
}

/* ---------- events ---------- */

$("#choose").addEventListener("click", () => $("#file").click());
$("#choose-2").addEventListener("click", () => $("#file").click());
$("#demo").addEventListener("click", loadDemo);
$("#file").addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  loadFile(file);
  event.target.value = "";
});

document.addEventListener("keydown", (event) => {
  if (state.deck) {
    if (event.key === "ArrowRight") { event.preventDefault(); deckStep(1); }
    else if (event.key === "ArrowLeft") { event.preventDefault(); deckStep(-1); }
    else if (event.key === "Home") { event.preventDefault(); deckJump(0); }
    else if (event.key === "End") { event.preventDefault(); deckJump(state.deck.items.length - 1); }
    else if (event.key === "Escape") { event.preventDefault(); closeDeck(); }
    return;
  }
  if (state.course && event.key === "Escape") {
    event.preventDefault();
    closeCourse();
  }
});

let lastWheel = 0;
$("#deck").addEventListener("wheel", (event) => {
  if (!state.deck) return;
  const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
  if (Math.abs(delta) < 8) return;
  const now = Date.now();
  if (now - lastWheel < 280) return;
  lastWheel = now;
  deckStep(delta > 0 ? 1 : -1);
}, { passive: true });

let dragDepth = 0;
window.addEventListener("dragenter", (event) => {
  event.preventDefault();
  dragDepth += 1;
  $("#drop").hidden = false;
});
window.addEventListener("dragleave", (event) => {
  event.preventDefault();
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) $("#drop").hidden = true;
});
window.addEventListener("dragover", (event) => event.preventDefault());
window.addEventListener("drop", (event) => {
  event.preventDefault();
  dragDepth = 0;
  $("#drop").hidden = true;
  const file = event.dataTransfer?.files?.[0];
  if (file) loadFile(file);
});

const params = new URLSearchParams(location.search);

if (params.get("demo") === "1") {
  loadDemo();
  if (params.get("catalog") === "1") {
    state.filter = { kind: "playlists" };
    render();
  }
  if (params.get("deck") === "playlist" && state.data) {
    const items = shelfItems(state.data.videos, state.data.playlists, { kind: "tag", value: "Math" }, "", "everything");
    const index = items.findIndex((item) => item.kind === "playlist");
    openDeck({ items, index: index < 0 ? 0 : index });
  } else if (params.get("course") === "1" && state.data?.playlists.length) {
    openCourse(state.data.playlists[0]);
  } else if (params.get("deck") === "1" && state.data) {
    openDeck({ items: currentItems(), index: 0 });
  }
}
