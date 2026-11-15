// Decoding and validation for TubeShelf backups. Pure: no DOM, no network.
// The Mac app owns the format; everything new is optional here.

export const MAX_BYTES = 32 * 1024 * 1024;
export const MAX_VIDEOS = 50000;
export const MAX_PLAYLISTS = 500;

const ID_RE = /^[A-Za-z0-9_-]{11}$/;

export class BackupError extends Error {}

export function isVideoID(value) {
  return typeof value === "string" && ID_RE.test(value);
}

/** Lowercase, strip punctuation, collapse spaces; used for search and dedupe. */
export function normalizeTag(raw) {
  if (typeof raw !== "string") return null;
  let text = raw.trim().replace(/^#+/, "").replace(/\s+/g, " ").trim();
  if (!text || !/[a-z0-9]/i.test(text)) return null;
  if (text.length > 28) text = text.slice(0, 28).trim();
  return text;
}

export function normalizeTags(list) {
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const tag = normalizeTag(raw);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

function normalizeVideo(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (!isVideoID(raw.youtubeID)) return null;
  const tags = normalizeTags(raw.tags);
  const status = ["unwatched", "watching", "done"].includes(raw.watchStatus)
    ? raw.watchStatus
    : "unwatched";
  return {
    id: typeof raw.id === "string" ? raw.id : raw.youtubeID,
    youtubeID: raw.youtubeID,
    title: typeof raw.title === "string" && raw.title ? raw.title : "Untitled",
    channel: typeof raw.channel === "string" ? raw.channel : "",
    tags,
    note: typeof raw.note === "string" ? raw.note : "",
    addedAt: Number.isFinite(Date.parse(raw.addedAt)) ? Date.parse(raw.addedAt) : 0,
    durationSeconds: Number.isFinite(raw.durationSeconds) ? raw.durationSeconds : null,
    isFavorite: raw.isFavorite === true,
    watchStatus: status,
  };
}

function normalizePlaylistItem(raw) {
  if (!raw || !isVideoID(raw.videoID)) return null;
  return {
    videoID: raw.videoID,
    title: typeof raw.title === "string" && raw.title ? raw.title : "Untitled",
    channel: typeof raw.channel === "string" ? raw.channel : "",
    durationSeconds: Number.isFinite(raw.durationSeconds) ? raw.durationSeconds : null,
  };
}

function normalizePlaylist(raw) {
  if (!raw || typeof raw !== "object" || typeof raw.id !== "string") return null;
  const items = (Array.isArray(raw.items) ? raw.items : [])
    .map(normalizePlaylistItem)
    .filter(Boolean);
  const watched = Array.isArray(raw.watchedItemIDs)
    ? raw.watchedItemIDs.filter(isVideoID)
    : [];
  return {
    id: raw.id,
    title: typeof raw.title === "string" && raw.title ? raw.title : "Playlist",
    channel: typeof raw.channel === "string" ? raw.channel : "",
    items,
    watchedItemIDs: watched,
    tags: normalizeTags(raw.tags),
    isTruncated: raw.isTruncated === true,
    addedAt: Number.isFinite(Date.parse(raw.addedAt)) ? Date.parse(raw.addedAt) : 0,
    fetchedAt: Number.isFinite(Date.parse(raw.fetchedAt)) ? Date.parse(raw.fetchedAt) : 0,
  };
}

/**
 * @param {string} text raw file contents
 * @returns {{videos: object[], playlists: object[], pinnedTags: string[], exportedAt: string|null}}
 */
export function decodeBackup(text) {
  if (typeof text !== "string") throw new BackupError("That file could not be read as text.");
  if (text.length > MAX_BYTES) {
    throw new BackupError("That file is larger than 32 MB. Export a smaller shelf, or split it.");
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new BackupError("That file is not valid JSON.");
  }

  let library;
  let playlists = [];
  let exportedAt = null;
  let hasPlaylistCatalog = false;

  if (data && data.format !== undefined) {
    if (data.format !== "tubeshelf.backup") {
      throw new BackupError("That is not a TubeShelf backup.");
    }
    if (Number(data.version) > 1) {
      throw new BackupError("This backup was written by a newer TubeShelf. Update the app first.");
    }
    library = data.library;
    exportedAt = typeof data.exportedAt === "string" ? data.exportedAt : null;
    hasPlaylistCatalog = Array.isArray(data.playlists);
    playlists = hasPlaylistCatalog ? data.playlists : [];
  } else {
    if (!data || !Array.isArray(data.videos)) {
      throw new BackupError(
        "That file is not a TubeShelf library — a top-level videos array is missing."
      );
    }
    library = data;
  }

  if (!library || !Array.isArray(library.videos)) {
    throw new BackupError("That backup has no videos array.");
  }
  if (library.videos.length > MAX_VIDEOS) {
    throw new BackupError(`That shelf has more than ${MAX_VIDEOS} videos. Split it first.`);
  }

  const videos = library.videos.map(normalizeVideo).filter(Boolean);
  const normalizedPlaylists = playlists
    .slice(0, MAX_PLAYLISTS)
    .map(normalizePlaylist)
    .filter(Boolean);

  if (videos.length === 0 && normalizedPlaylists.length === 0) {
    throw new BackupError("That backup contains no videos or playlists.");
  }

  return {
    videos,
    playlists: normalizedPlaylists,
    hasPlaylistCatalog,
    pinnedTags: normalizeTags(library.pinnedTags || []),
    exportedAt,
  };
}

export function watchURL(videoID) {
  return `https://www.youtube.com/watch?v=${videoID}`;
}

export function playlistURL(playlistID) {
  return `https://www.youtube.com/playlist?list=${playlistID}`;
}

export const THUMBNAIL_QUALITIES = ["maxresdefault", "sddefault", "hqdefault", "mqdefault"];

export function thumbnailCandidates(videoID, qualities = THUMBNAIL_QUALITIES) {
  return qualities.map((quality) => `https://i.ytimg.com/vi/${videoID}/${quality}.jpg`);
}

export function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}
