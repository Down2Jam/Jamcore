import { describe, expect, it } from "vitest";

import {
  calculatePostHotScore,
  listPostsQuerySchema,
} from "../src/features/posts/service.js";

describe("post hot sorting", () => {
  const now = new Date("2026-08-28T12:00:00.000Z");

  it("accepts hot as a post-list sort", () => {
    expect(listPostsQuerySchema.parse({ sort: "hot" }).sort).toBe("hot");
  });

  it("decays the value of likes over the 24-hour window", () => {
    const newPost = calculatePostHotScore(3, now, now);
    const twelveHourPost = calculatePostHotScore(
      3,
      new Date(now.getTime() - 12 * 60 * 60 * 1000),
      now,
    );
    const expiredPost = calculatePostHotScore(
      100,
      new Date(now.getTime() - 24 * 60 * 60 * 1000),
      now,
    );

    expect(newPost).toBe(4);
    expect(twelveHourPost).toBe(2);
    expect(expiredPost).toBe(0);
  });

  it("lets strong engagement outweigh some loss of freshness", () => {
    const popularOlderPost = calculatePostHotScore(
      12,
      new Date(now.getTime() - 6 * 60 * 60 * 1000),
      now,
    );
    const newPost = calculatePostHotScore(3, now, now);

    expect(popularOlderPost).toBeGreaterThan(newPost);
  });
});
