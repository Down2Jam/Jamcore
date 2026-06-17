import { describe, expect, it } from "vitest";

import {
  backgroundUsageAllowedByDefault,
  buildTrackWriteData,
} from "../src/features/tracks/write.js";

describe("track write helpers", () => {
  it("normalizes track payloads", () => {
    const result = buildTrackWriteData({
      name: " Song ",
      slug: "song",
      url: "https://example.com/song.mp3",
      bpm: 123.9,
      softwareUsed: [" Ableton ", "", "REAPER"],
      license: " cc by ",
      tagIds: [1, "2", "x"],
      flagIds: [3],
      links: [{ label: " Listen ", url: " https://example.com " }, {}],
      credits: [{ role: "Composer", userId: "8" }, { role: "", userId: 2 }],
    });

    expect(result.bpm).toBe(123);
    expect(result.softwareUsed).toEqual(["Ableton", "REAPER"]);
    expect(result.tagIds).toEqual([1, 2]);
    expect(result.flagIds).toEqual([3]);
    expect(result.composerId).toBe(8);
    expect(result.links).toEqual([
      { label: "Listen", url: "https://example.com" },
    ]);
  });

  it("applies background defaults from license", () => {
    expect(backgroundUsageAllowedByDefault("CC0")).toBe(true);
    expect(buildTrackWriteData({
      name: "Song",
      slug: "song",
      url: "https://example.com/song.mp3",
      license: "CC BY",
    }).allowBackgroundUse).toBe(true);
  });
});
