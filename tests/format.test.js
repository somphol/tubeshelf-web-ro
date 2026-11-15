import test from "node:test";
import assert from "node:assert/strict";
import { decodeBackup, BackupError, thumbnailCandidates } from "../src/format.js";

const envelope = {
  format: "tubeshelf.backup",
  version: 1,
  exportedAt: "2026-11-14T10:00:00Z",
  library: {
    pinnedTags: ["Math"],
    videos: [
      {
        youtubeID: "dQw4w9WgXcQ",
        title: "A",
        channel: "C",
        tags: ["Math", "math", " #Design "],
        watchStatus: "done",
      },
      { youtubeID: "not-an-id", title: "Dropped" },
    ],
  },
  playlists: [
    {
      id: "PLZHQObOWTQDPD3MizzM2xVFitgF8hE_ab",
      title: "Course",
      channel: "3Blue1Brown",
      tags: ["Math"],
      items: [
        { videoID: "k7RM-ot2NWY", title: "Chapter 1" },
        { videoID: "bad", title: "Dropped" },
      ],
      watchedItemIDs: ["k7RM-ot2NWY", "nope"],
    },
  ],
};

test("decodes an envelope with videos and playlists", () => {
  const result = decodeBackup(JSON.stringify(envelope));
  assert.equal(result.videos.length, 1, "invalid ids are dropped");
  assert.equal(result.videos[0].watchStatus, "done");
  assert.deepEqual(result.videos[0].tags, ["Math", "Design"]);
  assert.equal(result.playlists.length, 1);
  assert.equal(result.playlists[0].items.length, 1);
  assert.deepEqual(result.playlists[0].watchedItemIDs, ["k7RM-ot2NWY"]);
  assert.deepEqual(result.pinnedTags, ["Math"]);
  assert.equal(result.hasPlaylistCatalog, true);
});

test("an envelope without a playlists key is marked as lacking the catalog", () => {
  const old = { format: "tubeshelf.backup", version: 1, library: envelope.library };
  const result = decodeBackup(JSON.stringify(old));
  assert.equal(result.hasPlaylistCatalog, false);
  assert.deepEqual(result.playlists, []);
});

test("an explicitly empty catalog counts as present", () => {
  const result = decodeBackup(JSON.stringify({ ...envelope, playlists: [] }));
  assert.equal(result.hasPlaylistCatalog, true);
  assert.deepEqual(result.playlists, []);
});

test("a raw library file has no catalog", () => {
  const result = decodeBackup(JSON.stringify({ videos: [{ youtubeID: "jNQXAC9IVRw", title: "B" }] }));
  assert.equal(result.hasPlaylistCatalog, false);
});

test("accepts a raw library file", () => {
  const raw = { videos: [{ youtubeID: "jNQXAC9IVRw", title: "B" }] };
  const result = decodeBackup(JSON.stringify(raw));
  assert.equal(result.videos.length, 1);
  assert.equal(result.videos[0].watchStatus, "unwatched");
  assert.deepEqual(result.playlists, []);
});

test("refuses a newer format", () => {
  const newer = { ...envelope, version: 2 };
  assert.throws(() => decodeBackup(JSON.stringify(newer)), (error) => {
    assert.ok(error instanceof BackupError);
    assert.match(error.message, /newer TubeShelf/);
    return true;
  });
});

test("refuses foreign JSON and empty content", () => {
  assert.throws(() => decodeBackup(JSON.stringify({ name: "not a shelf" })), /not a TubeShelf library/);
  assert.throws(() => decodeBackup(JSON.stringify({ videos: [] })), /no videos or playlists/);
  assert.throws(() => decodeBackup("not json"), /not valid JSON/);
});

test("a playlist-only backup is valid", () => {
  const onlyCourse = {
    format: "tubeshelf.backup",
    version: 1,
    library: { videos: [] },
    playlists: envelope.playlists,
  };
  const result = decodeBackup(JSON.stringify(onlyCourse));
  assert.equal(result.videos.length, 0);
  assert.equal(result.playlists.length, 1);
});

test("duplicate tags are collapsed case-insensitively", () => {
  const result = decodeBackup(
    JSON.stringify({
      videos: [{ youtubeID: "dQw4w9WgXcQ", title: "A", tags: ["Math", "math", "MATH"] }],
    })
  );
  assert.deepEqual(result.videos[0].tags, ["Math"]);
});

test("an old envelope without playlists still decodes", () => {
  const old = { format: "tubeshelf.backup", version: 1, library: envelope.library };
  const result = decodeBackup(JSON.stringify(old));
  assert.deepEqual(result.playlists, []);
  assert.equal(result.videos.length, 1);
});

test("thumbnailCandidates honours a reduced quality ladder", () => {
  assert.equal(thumbnailCandidates("dQw4w9WgXcQ").length, 4);
  assert.deepEqual(
    thumbnailCandidates("dQw4w9WgXcQ", ["hqdefault", "mqdefault"]).map((url) => url.split("/").pop()),
    ["hqdefault.jpg", "mqdefault.jpg"]
  );
});

test("pinned channels keep YouTube spelling and collapse duplicates", () => {
  const result = decodeBackup(
    JSON.stringify({
      videos: [{ youtubeID: "dQw4w9WgXcQ", title: "A" }],
      pinnedTags: [],
      pinnedChannels: [" 3Blue1Brown ", "3blue1brown", "", "Bake  Club"],
    })
  );
  assert.deepEqual(result.pinnedChannels, ["3Blue1Brown", "Bake Club"]);
  assert.deepEqual(decodeBackup(JSON.stringify({ videos: [{ youtubeID: "dQw4w9WgXcQ", title: "A" }] })).pinnedChannels, []);
});
