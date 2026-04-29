import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../features/federation/models/service.js", () => ({
  getFederatedPostById: vi.fn(async (id: number) => ({
    id,
    title: "Post title",
    content: "Hello world",
    createdAt: new Date("2026-04-20T10:00:00.000Z"),
    updatedAt: new Date("2026-04-21T12:00:00.000Z"),
    author: {
      slug: "ben",
    },
  })),
  getFederatedCommentById: vi.fn(async (id: number) => ({
    id,
    content: "Comment body",
    createdAt: new Date("2026-04-20T10:00:00.000Z"),
    updatedAt: new Date("2026-04-21T12:00:00.000Z"),
    author: {
      slug: "ben",
    },
    postId: 42,
  })),
  getFederatedGameBySlug: vi.fn(async (slug: string) => ({
    slug,
    category: "solo",
    createdAt: new Date("2026-04-20T10:00:00.000Z"),
    updatedAt: new Date("2026-04-21T12:00:00.000Z"),
    team: {
      owner: {
        slug: "ben",
      },
    },
    gamePage: {
      name: "Game title",
      description: "Game body",
      short: "Short",
      screenshots: [],
      thumbnail: null,
      trailerUrl: null,
    },
    emojis: [],
  })),
  getFederatedTrackBySlug: vi.fn(async (slug: string) => ({
    slug,
    name: "Track title",
    commentary: "Track body",
    url: "https://example.com/track.mp3",
    createdAt: new Date("2026-04-20T10:00:00.000Z"),
    updatedAt: new Date("2026-04-21T12:00:00.000Z"),
    composer: {
      slug: "ben",
    },
    gamePage: {
      game: {
        slug: "my-game",
      },
    },
    emojis: [],
  })),
}));

vi.mock("../features/federation/outbox/publication.service.js", () => ({
  publishActivityToAudience: vi.fn(async () => ["delivery-1"]),
}));

import { getJamActorId, getUserActorId } from "../features/federation/protocol/urls.js";
import {
  publishCommentCreated,
  publishCommentUpdated,
  publishGameCreated,
  publishGameUpdated,
  publishPostCreated,
  publishPostUpdated,
  publishTrackUpdated,
} from "../features/federation/outbox/mutation-publication.service.js";
import { publishActivityToAudience } from "../features/federation/outbox/publication.service.js";

describe("federation mutation publication service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("publishes forum post creates to both jam and author audiences", async () => {
    const result = await publishPostCreated(42);

    expect(result).toEqual(["delivery-1"]);
    expect(publishActivityToAudience).toHaveBeenCalledWith({
      actorIds: [getJamActorId(), getUserActorId("ben")],
      activity: expect.objectContaining({
        type: "Create",
        actor: getUserActorId("ben"),
        object: expect.objectContaining({
          id: expect.stringContaining("/ap/objects/posts/42"),
          type: "Article",
        }),
      }),
    });
  });

  it("publishes comment updates as Update activities", async () => {
    await publishCommentUpdated(9);

    expect(publishActivityToAudience).toHaveBeenCalledWith({
      actorIds: [getJamActorId(), getUserActorId("ben")],
      activity: expect.objectContaining({
        type: "Update",
        actor: getUserActorId("ben"),
        object: expect.objectContaining({
          id: expect.stringContaining("/ap/objects/comments/9"),
          type: "Note",
        }),
      }),
    });
  });

  it("publishes games with the owner actor", async () => {
    await publishGameCreated("my-game");

    expect(publishActivityToAudience).toHaveBeenCalledWith({
      actorIds: [getJamActorId(), getUserActorId("ben")],
      activity: expect.objectContaining({
        type: "Create",
        actor: getUserActorId("ben"),
        object: expect.objectContaining({
          id: expect.stringContaining("/ap/objects/games/my-game"),
          type: "Page",
        }),
      }),
    });
  });

  it("publishes game updates as Update activities", async () => {
    await publishGameUpdated("my-game");

    expect(publishActivityToAudience).toHaveBeenCalledWith({
      actorIds: [getJamActorId(), getUserActorId("ben")],
      activity: expect.objectContaining({
        type: "Update",
        actor: getUserActorId("ben"),
        object: expect.objectContaining({
          id: expect.stringContaining("/ap/objects/games/my-game"),
          type: "Page",
        }),
      }),
    });
  });

  it("publishes track updates with the composer actor", async () => {
    await publishTrackUpdated("my-track");

    expect(publishActivityToAudience).toHaveBeenCalledWith({
      actorIds: [getJamActorId(), getUserActorId("ben")],
      activity: expect.objectContaining({
        type: "Update",
        actor: getUserActorId("ben"),
        object: expect.objectContaining({
          id: expect.stringContaining("/ap/objects/tracks/my-track"),
          type: "Audio",
        }),
      }),
    });
  });

  it("supports comment creates and post updates through the same publisher surface", async () => {
    await publishCommentCreated(7);
    await publishPostUpdated(42);

    expect(publishActivityToAudience).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        activity: expect.objectContaining({
          type: "Create",
        }),
      }),
    );
    expect(publishActivityToAudience).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        activity: expect.objectContaining({
          type: "Update",
        }),
      }),
    );
  });
});

