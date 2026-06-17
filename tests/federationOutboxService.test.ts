import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getJamOutboxItems: vi.fn(),
  getUserOutboxItems: vi.fn(),
}));

vi.mock("../src/features/federation/models/service.js", () => ({
  getJamOutboxItems: mocks.getJamOutboxItems,
  getUserOutboxItems: mocks.getUserOutboxItems,
}));

import {
  buildJamOutboxCollection,
  buildUserOutboxCollection,
} from "../src/features/federation/outbox/service.js";
import { getJamOutboxId, getUserOutboxId } from "../src/features/federation/protocol/urls.js";

describe("federation outbox service", () => {
  beforeEach(() => {
    mocks.getJamOutboxItems.mockReset();
    mocks.getUserOutboxItems.mockReset();
  });

  it("builds a jam outbox collection with sorted create activities", async () => {
    mocks.getJamOutboxItems.mockResolvedValue({
      posts: [
        {
          id: 1,
          title: "Post",
          content: "Hello",
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-01T00:00:00.000Z"),
          author: { slug: "ben" },
        },
      ],
      comments: [],
      games: [],
      tracks: [],
    });

    const collection = await buildJamOutboxCollection(5);

    expect(collection.id).toBe(getJamOutboxId());
    expect(collection.totalItems).toBe(1);
    expect(collection.orderedItems[0]).toEqual(
      expect.objectContaining({
        type: "Create",
      }),
    );
  });

  it("builds a user outbox collection", async () => {
    mocks.getUserOutboxItems.mockResolvedValue({
      posts: [
        {
          id: 2,
          title: "Post",
          content: "Hello",
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-01T00:00:00.000Z"),
          author: { slug: "ben" },
        },
      ],
      comments: [],
      games: [],
      tracks: [],
    });

    const collection = await buildUserOutboxCollection({
      slug: "ben",
      limit: 3,
    });

    expect(collection.id).toBe(getUserOutboxId("ben"));
    expect(collection.totalItems).toBe(1);
  });
});

