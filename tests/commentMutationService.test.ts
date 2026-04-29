import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
  post: {
    findUnique: vi.fn(async () => null),
  },
  comment: {
    findUnique: vi.fn(async () => null),
    create: vi.fn(async () => ({ id: 55 })),
  },
  game: {
    findUnique: vi.fn(async () => ({
      id: 9,
      slug: "game-slug",
      pages: [{ name: "Game Name" }],
      team: {
        users: [{ id: 1 }, { id: 2 }, { id: 3 }],
      },
    })),
  },
  gamePage: {
    findUnique: vi.fn(async () => null),
  },
  gamePageTrack: {
    findUnique: vi.fn(async () => null),
  },
  notification: {
    create: vi.fn(async () => ({})),
  },
  },
}));

vi.mock("../infra/db.js", () => ({
  default: dbMock,
}));

vi.mock("../features/mentions/notifications.service.js", () => ({
  notifyNewMentions: vi.fn(async () => undefined),
  resolveCommentMentionContext: vi.fn(async () => ({})),
}));

vi.mock("../features/federation/outbox/mutation-publication.service.js", () => ({
  publishCommentCreated: vi.fn(async () => ["delivery-1"]),
  publishCommentUpdated: vi.fn(async () => ["delivery-1"]),
}));

import {
  createComment,
  createCommentSchema,
} from "../features/comments/mutation.service.js";
import { notifyNewMentions } from "../features/mentions/notifications.service.js";
import { publishCommentCreated } from "../features/federation/outbox/mutation-publication.service.js";

describe("comment mutation service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("validates that exactly one comment target is provided", () => {
    expect(() =>
      createCommentSchema.parse({
        content: "Hello",
      }),
    ).toThrow();

    expect(() =>
      createCommentSchema.parse({
        content: "Hello",
        postId: 1,
        gameId: 2,
      }),
    ).toThrow();

    expect(
      createCommentSchema.parse({
        content: "Hello",
        gameId: 2,
      }),
    ).toEqual({
      content: "Hello",
      gameId: 2,
    });
  });

  it("creates team notifications for game comments and publishes the comment", async () => {
    await createComment({
      actor: {
        id: 1,
        name: "Ben",
        slug: "ben",
      },
      input: {
        content: "Nice game",
        gameId: 9,
      },
    });

    expect(dbMock.comment.create).toHaveBeenCalledWith({
      data: {
        content: "Nice game",
        authorId: 1,
        postId: null,
        commentId: null,
        gameId: 9,
        gamePageId: null,
        trackId: null,
      },
    });
    expect(dbMock.notification.create).toHaveBeenCalledTimes(2);
    expect(dbMock.notification.create).toHaveBeenCalledWith({
      data: {
        type: "GAME_COMMENT",
        recipientId: 2,
        actorId: 1,
        gameId: 9,
        commentId: 55,
      },
    });
    expect(dbMock.notification.create).toHaveBeenCalledWith({
      data: {
        type: "GAME_COMMENT",
        recipientId: 3,
        actorId: 1,
        gameId: 9,
        commentId: 55,
      },
    });
    expect(notifyNewMentions).toHaveBeenCalled();
    expect(publishCommentCreated).toHaveBeenCalledWith(55);
  });
});


