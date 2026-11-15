import test from "node:test";
import assert from "node:assert/strict";
import {
  categoryCounts,
  applyVideoFilter,
  searchVideos,
  shelfItems,
  pageWindow,
  pageSlice,
  courseProgress,
  courseWatchedCount,
} from "../src/shelf.js";

const videos = [
  {
    youtubeID: "aaaaaaaaaaa",
    title: "Actors in Swift",
    channel: "Point-Free",
    tags: ["Programming"],
    note: "",
    addedAt: 300,
    isFavorite: true,
    watchStatus: "done",
  },
  {
    youtubeID: "bbbbbbbbbbb",
    title: "Sourdough",
    channel: "Bake Club",
    tags: ["Cooking"],
    note: "swift crumb",
    addedAt: 200,
    isFavorite: false,
    watchStatus: "unwatched",
  },
  {
    youtubeID: "ccccccccccc",
    title: "Untagged",
    channel: "Nobody",
    tags: [],
    note: "",
    addedAt: 100,
    isFavorite: false,
    watchStatus: "watching",
  },
];

const playlists = [
  {
    id: "PLZHQObOWTQDPD3MizzM2xVFitgF8hE_ab",
    title: "Essence of linear algebra",
    channel: "3Blue1Brown",
    tags: ["Cooking", "Math"],
    items: [
      { videoID: "k7RM-ot2NWY", title: "One" },
      { videoID: "fNk_zzaMoSs", title: "Two" },
    ],
    watchedItemIDs: ["k7RM-ot2NWY"],
    addedAt: 250,
  },
];

test("filters by favorites, unwatched, unsorted, tag and channel", () => {
  assert.equal(applyVideoFilter(videos, { kind: "favorites" }).length, 1);
  assert.equal(applyVideoFilter(videos, { kind: "unwatched" }).length, 2);
  assert.equal(applyVideoFilter(videos, { kind: "unsorted" }).length, 1);
  assert.equal(applyVideoFilter(videos, { kind: "tag", value: "cooking" }).length, 1);
  assert.equal(applyVideoFilter(videos, { kind: "channel", value: "bake club" }).length, 1);
});

test("search scope titles differs from everything", () => {
  assert.equal(searchVideos(videos, "swift", "titles").length, 1);
  assert.equal(searchVideos(videos, "swift", "everything").length, 2);
});

test("category counts merge courses", () => {
  const counts = categoryCounts(videos, playlists);
  const cooking = counts.find((entry) => entry.name === "Cooking");
  assert.equal(cooking.count, 2, "one video plus one course");
});

test("a tag view mixes videos and courses by date", () => {
  const items = shelfItems(videos, playlists, { kind: "tag", value: "Cooking" }, "", "everything");
  assert.deepEqual(
    items.map((item) => item.kind),
    ["playlist", "video"],
    "the course was added after the cooking video"
  );
});

test("other views never include courses", () => {
  const items = shelfItems(videos, playlists, { kind: "all" }, "", "everything");
  assert.ok(items.every((item) => item.kind === "video"));
});

test("pagination clamps and slices", () => {
  const window = pageWindow(120, 48, 2);
  assert.equal(window.pageCount, 3);
  assert.equal(window.rangeLabel, "97–120 of 120");
  assert.equal(window.isLast, true);
  assert.equal(pageSlice(Array.from({ length: 120 }, (_, i) => i), window).length, 24);

  const clamped = pageWindow(10, 48, 9);
  assert.equal(clamped.index, 0);
  assert.equal(clamped.rangeLabel, "1–10 of 10");
});

test("course progress counts only ticks that exist", () => {
  assert.equal(courseWatchedCount(playlists[0]), 1);
  assert.equal(courseProgress(playlists[0]), 0.5);
});
