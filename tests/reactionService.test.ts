import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    post: {
      findUnique: vi.fn(),
    },
    comment: {
      findUnique: vi.fn(),
    },
    like: {
      findFirst: vi.fn(),
      deleteMany: vi.fn(),
      create: vi.fn(),
    },
    reaction: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("../infra/db.js", () => ({
  default: dbMock,
}));

import { ConflictError, NotFoundError } from "../lib/errors.js";
import {
  toggleLike,
  toggleCommentReaction,
  togglePostReaction,
} from "../features/reactions/index.js";

describe("reaction service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("summarizes updated post reactions", async () => {
    dbMock.post.findUnique.mockResolvedValue({ id: 3 });
    dbMock.reaction.findUnique.mockResolvedValue({ id: 4, slug: "wow" });
    dbMock.$transaction.mockImplementation(async (callback: (tx: any) => unknown) =>
      callback({
        postReaction: {
          findUnique: vi.fn(async () => ({ id: 7 })),
          delete: vi.fn(async () => ({})),
          findMany: vi.fn(async () => [
            {
              reactionId: 4,
              userId: 2,
              createdAt: new Date("2026-01-01T00:00:00Z"),
              reaction: { slug: "wow" },
              user: {
                id: 2,
                slug: "ben",
                name: "Ben",
                profilePicture: null,
              },
            },
          ]),
        },
      }),
    );

    const result = await togglePostReaction({
      input: { postId: 3, reactionId: 4 },
      userId: 2,
    });

    expect(result).toEqual([
      expect.objectContaining({
        count: 1,
        reacted: true,
        isFirstReactor: true,
      }),
    ]);
  });

  it("throws on missing comment or reaction", async () => {
    dbMock.comment.findUnique.mockResolvedValue(null);
    await expect(
      toggleCommentReaction({
        input: { commentId: 9, reactionId: 1 },
        userId: 2,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("enforces the first-reactor limit on comments", async () => {
    dbMock.comment.findUnique.mockResolvedValue({ id: 9 });
    dbMock.reaction.findUnique.mockResolvedValue({ id: 3, slug: "wow" });
    dbMock.$transaction.mockImplementation(async (callback: (tx: any) => unknown) =>
      callback({
        commentReaction: {
          findUnique: vi.fn(async () => null),
          create: vi.fn(async () => ({})),
          findMany: vi
            .fn()
            .mockResolvedValueOnce([
              { id: 1, reactionId: 1, userId: 2, createdAt: new Date() },
              { id: 2, reactionId: 2, userId: 2, createdAt: new Date() },
            ]),
        },
      }),
    );

    await expect(
      toggleCommentReaction({
        input: { commentId: 9, reactionId: 3 },
        userId: 2,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("toggles likes off when an existing like is present", async () => {
    dbMock.like.findFirst.mockResolvedValue({ id: 6 });

    const result = await toggleLike({
      userId: 2,
      postId: 3,
    });

    expect(dbMock.like.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: 2,
        postId: 3,
      },
    });
    expect(result).toEqual({ liked: false });
  });
});

