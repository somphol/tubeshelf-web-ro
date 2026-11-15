// Query layer: filters, search, counts and pagination. Pure, DOM-free.
import { normalizeTag } from "./format.js";

export const PAGE_SIZES = [24, 48, 96, 144];
export const DEFAULT_PAGE_SIZE = 48;

export function fold(text) {
  return String(text)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function matches(haystack, needle) {
  const hay = fold(haystack);
  return fold(needle)
    .split(" ")
    .filter(Boolean)
    .every((term) => hay.includes(term));
}

export function videoSearchText(video) {
  return [video.title, video.channel, video.note, ...video.tags].join(" ");
}

export function playlistSearchText(playlist) {
  return [playlist.title, playlist.channel, ...playlist.tags].join(" ");
}

export function playlistWatched(playlist, videoID) {
  const key = videoID.toLowerCase();
  return playlist.watchedItemIDs.some((id) => id.toLowerCase() === key);
}

/** Categories as the sidebar shows them: videos and courses together. */
export function categoryCounts(videos, playlists) {
  const tally = new Map();
  const spelling = new Map();
  const add = (name, amount) => {
    const key = name.toLowerCase();
    tally.set(key, (tally.get(key) || 0) + amount);
    if (!spelling.has(key)) spelling.set(key, name);
  };
  for (const video of videos) for (const tag of video.tags) add(tag, 1);
  for (const playlist of playlists) for (const tag of playlist.tags) add(tag, 1);

  return [...tally.entries()]
    .map(([key, count]) => ({ name: spelling.get(key), count }))
    .sort((a, b) => (a.count === b.count ? a.name.localeCompare(b.name) : b.count - a.count));
}

export function channelCounts(videos) {
  const tally = new Map();
  const spelling = new Map();
  for (const video of videos) {
    const name = video.channel.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    tally.set(key, (tally.get(key) || 0) + 1);
    if (!spelling.has(key)) spelling.set(key, name);
  }
  return [...tally.entries()]
    .map(([key, count]) => ({ name: spelling.get(key), count }))
    .sort((a, b) => (a.count === b.count ? a.name.localeCompare(b.name) : b.count - a.count));
}

export function applyVideoFilter(videos, filter) {
  switch (filter.kind) {
    case "favorites":
      return videos.filter((video) => video.isFavorite);
    case "unwatched":
      return videos.filter((video) => video.watchStatus !== "done");
    case "unsorted":
      return videos.filter((video) => video.tags.length === 0);
    case "tag":
      return videos.filter((video) =>
        video.tags.some((tag) => tag.toLowerCase() === filter.value.toLowerCase())
      );
    case "channel":
      return videos.filter((video) => video.channel.toLowerCase() === filter.value.toLowerCase());
    case "playlists":
      return [];
    default:
      return videos;
  }
}

export function searchVideos(videos, query, scope) {
  if (!query.trim()) return videos;
  return videos.filter((video) =>
    scope === "titles" ? matches(video.title, query) : matches(videoSearchText(video), query)
  );
}

export function playlistsWithTag(playlists, tag, query = "") {
  const needle = query.trim();
  return playlists.filter(
    (playlist) =>
      playlist.tags.some((t) => t.toLowerCase() === tag.toLowerCase()) &&
      (!needle || matches(playlistSearchText(playlist), needle))
  );
}

/** One list for the grid: videos, plus courses when a category is selected. */
export function shelfItems(videos, playlists, filter, query, scope) {
  const videoItems = searchVideos(applyVideoFilter(videos, filter), query, scope).map((video) => ({
    kind: "video",
    addedAt: video.addedAt,
    video,
  }));

  if (filter.kind !== "tag") return videoItems.sort((a, b) => b.addedAt - a.addedAt);

  const courseItems = playlistsWithTag(playlists, filter.value, query).map((playlist) => ({
    kind: "playlist",
    addedAt: playlist.addedAt,
    playlist,
  }));

  return [...videoItems, ...courseItems].sort((a, b) => b.addedAt - a.addedAt);
}

export function pageWindow(total, pageSize, pageIndex) {
  const size = Math.max(1, pageSize);
  const count = Math.max(1, Math.ceil(total / size));
  const index = Math.min(Math.max(0, pageIndex), count - 1);
  const start = total === 0 ? 0 : index * size;
  const end = Math.min(total, start + size);
  return {
    total,
    pageSize: size,
    pageCount: count,
    index,
    start,
    end,
    isFirst: index === 0,
    isLast: index >= count - 1,
    rangeLabel: total === 0 ? "0 videos" : `${start + 1}–${end} of ${total}`,
  };
}

export function pageSlice(items, window) {
  return items.slice(window.start, window.end);
}

export function courseProgress(playlist) {
  const total = playlist.items.length;
  if (total === 0) return 0;
  const watched = playlist.items.filter((item) => playlistWatched(playlist, item.videoID)).length;
  return watched / total;
}

export function courseWatchedCount(playlist) {
  return playlist.items.filter((item) => playlistWatched(playlist, item.videoID)).length;
}

export { normalizeTag };
