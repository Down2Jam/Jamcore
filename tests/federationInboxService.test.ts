import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildFollowersCollection } from "../features/federation/state/followers.service.js";
import { clearFederationState } from "../features/federation/state/state.service.js";

const mocks = vi.hoisted(() => ({
  createMany: vi.fn(),
  findMany: vi.fn(),
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  queryRawUnsafe: vi.fn(),
}));

vi.mock("../infra/db.js", () => ({
  default: {
    notification: {
      createMany: mocks.createMany,
    },
    user: {
      findMany: mocks.findMany,
      findUnique: mocks.findUnique,
    },
    post: {
      findUnique: mocks.findUnique,
    },
    comment: {
      findUnique: mocks.findUnique,
    },
    game: {
      findUnique: mocks.findUnique,
    },
    gamePageTrack: {
      findFirst: mocks.findFirst,
    },
    $queryRawUnsafe: mocks.queryRawUnsafe,
  },
}));

vi.mock("../features/federation/models/remote-actor.service.js", () => ({
  resolveRemoteActorProfile: vi.fn(async (actorId: string) => ({
    id: actorId,
    preferredUsername: "alice",
    name: "Alice",
    summary: null,
    inbox: "https://remote.example/inbox",
    outbox: null,
    iconUrl: null,
    url: null,
  })),
}));

vi.mock("../features/federation/transport/delivery.service.js", () => ({
  enqueueFederationDelivery: vi.fn(async () => "delivery-1"),
}));

import {
  getInboxTargetForJam,
  getInboxTargetForUser,
  handleInboxActivity,
} from "../features/federation/inbox/service.js";
import { getJamActorId, getPostObjectId, getUserActorId } from "../features/federation/protocol/urls.js";

describe("federation inbox service", () => {
  beforeEach(async () => {
    mocks.createMany.mockReset();
    mocks.findMany.mockReset();
    mocks.findUnique.mockReset();
    mocks.findFirst.mockReset();
    mocks.queryRawUnsafe.mockReset();
    mocks.queryRawUnsafe.mockImplementation(async (sql: string) =>
      sql.includes("RemoteFeedPost") ? [{ id: "remote-post-1" }] : [],
    );
    await clearFederationState();
  });

  it("accepts remote follows for the jam actor", async () => {
    mocks.findMany.mockResolvedValue([{ id: 1 }]);
    mocks.createMany.mockResolvedValue({ count: 1 });

    const result = await handleInboxActivity({
      target: getInboxTargetForJam(),
      body: {
        id: "https://remote.example/follow/1",
        type: "Follow",
        actor: "https://remote.example/users/alice",
        object: getJamActorId(),
      },
    });

    expect(result.summary).toContain("jam actor");
    expect(result.activity).toEqual(
      expect.objectContaining({
        type: "Accept",
        actor: getJamActorId(),
      }),
    );
    expect(result.deliveryId).toBe("delivery-1");
    expect(mocks.createMany).toHaveBeenCalled();
    expect(await buildFollowersCollection(getJamActorId())).toEqual(
      expect.objectContaining({
        totalItems: 1,
        orderedItems: ["https://remote.example/users/alice"],
      }),
    );
  });

  it("accepts remote follows for a local user", async () => {
    mocks.findUnique.mockResolvedValueOnce({ id: 7 });
    mocks.createMany.mockResolvedValue({ count: 1 });

    const result = await handleInboxActivity({
      target: getInboxTargetForUser("ben"),
      body: {
        id: "https://remote.example/follow/2",
        type: "Follow",
        actor: "https://remote.example/users/alice",
        object: getUserActorId("ben"),
      },
    });

    expect(result.summary).toContain("user actor");
    expect(result.activity).toEqual(
      expect.objectContaining({
        type: "Accept",
        actor: getUserActorId("ben"),
      }),
    );
    expect(result.deliveryId).toBe("delivery-1");
    expect(mocks.createMany).toHaveBeenCalled();
  });

  it("accepts remote reply notes for local posts", async () => {
    mocks.findUnique.mockResolvedValueOnce({
      authorId: 5,
      id: 12,
    });
    mocks.createMany.mockResolvedValue({ count: 1 });

    const result = await handleInboxActivity({
      target: getInboxTargetForJam(),
      body: {
        id: "https://remote.example/create/3",
        type: "Create",
        actor: "https://remote.example/users/alice",
        object: {
          id: "https://remote.example/notes/9",
          type: "Note",
          content: "Nice post :jamjar:",
          inReplyTo: getPostObjectId(12),
        },
      },
    });

    expect(result.summary).toContain("remote reply");
    expect(mocks.createMany).toHaveBeenCalled();
  });

  it("stores top-level d2jam and Lemmy posts for the jam feed", async () => {
    const result = await handleInboxActivity({
      target: getInboxTargetForJam(),
      body: {
        id: "https://lemmy.example/activities/create/1",
        type: "Create",
        actor: "https://lemmy.example/u/alice",
        object: {
          id: "https://lemmy.example/post/1",
          type: "Page",
          name: "Jam devlog",
          content: "<p>Here is a #d2jam update.</p>",
          tag: [{ type: "Hashtag", name: "#d2jam" }],
        },
      },
    });

    expect(result.summary).toContain("remote feed post");
    expect(mocks.queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining("RemoteFeedPost"),
      expect.any(String),
      "default",
      "https://lemmy.example/activities/create/1",
      "https://lemmy.example/post/1",
      "https://lemmy.example/u/alice",
      "Alice",
      "https://lemmy.example/u/alice",
      "lemmy.example",
      "Jam devlog",
      expect.stringContaining("d2jam update"),
      "https://lemmy.example/post/1",
      JSON.stringify(["d2jam"]),
      "lemmy",
      null,
    );
  });

  it("marks followers as undone when receiving undo follow", async () => {
    mocks.findMany.mockResolvedValue([{ id: 1 }]);
    mocks.createMany.mockResolvedValue({ count: 1 });

    await handleInboxActivity({
      target: getInboxTargetForJam(),
      body: {
        id: "https://remote.example/follow/1",
        type: "Follow",
        actor: "https://remote.example/users/alice",
        object: getJamActorId(),
      },
    });

    await handleInboxActivity({
      target: getInboxTargetForJam(),
      body: {
        id: "https://remote.example/undo/1",
        type: "Undo",
        actor: "https://remote.example/users/alice",
        object: {
          id: "https://remote.example/follow/1",
          type: "Follow",
          actor: "https://remote.example/users/alice",
          object: getJamActorId(),
        },
      },
    });

    expect(await buildFollowersCollection(getJamActorId())).toEqual(
      expect.objectContaining({
        totalItems: 0,
        orderedItems: [],
      }),
    );
  });
});


