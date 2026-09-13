import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock, assertTenant } = vi.hoisted(() => ({
  dbMock: { comment: { findUnique: vi.fn(), findMany: vi.fn() } },
  assertTenant: vi.fn(),
}));
vi.mock("../src/infra/db.js", () => ({ default: dbMock }));
vi.mock("../src/lib/contentTenant.js", () => ({ assertCommentTargetBelongsToTenant: assertTenant }));

import { commentRepliesQuerySchema, getCommentReplies } from "../src/features/comments/read.service.js";

describe("loading comment replies", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    dbMock.comment.findUnique.mockResolvedValue({ id: 1, commentId: null, postId: 5 });
    dbMock.comment.findMany.mockResolvedValue([]);
  });

  it("validates comment IDs", () => {
    expect(commentRepliesQuerySchema.parse({ commentId: "12" })).toEqual({ commentId: 12 });
    for (const commentId of [undefined, "bad", 0, -1, 1.5]) {
      expect(commentRepliesQuerySchema.safeParse({ commentId }).success).toBe(false);
    }
  });

  it("loads direct replies with viewer likes, reactions, and deeper reply markers", async () => {
    dbMock.comment.findMany.mockResolvedValue([
      { id: 2, author: { id: 7 }, likes: [{ userId: 7 }], children: [{ id: 3 }],
        commentReactions: [{ reactionId: 1, reaction: { id: 1, slug: "heart" }, userId: 7 }] },
      { id: 4, removedAt: new Date() },
    ]);
    const replies = await getCommentReplies({ commentId: 1, user: { id: 7 } });
    expect(replies).toHaveLength(1);
    expect(replies[0]).toMatchObject({ id: 2, hasLiked: true, children: [{ id: 3 }], reactions: [{ count: 1, reacted: true }] });
    expect(dbMock.comment.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { commentId: 1 } }));
  });

  it("checks tenant membership at the root of a nested thread", async () => {
    dbMock.comment.findUnique
      .mockResolvedValueOnce({ id: 2, commentId: 1 })
      .mockResolvedValueOnce({ id: 1, commentId: null, postId: 5 });
    assertTenant.mockImplementation(async (comment) => {
      if (comment.postId) throw new Error("Wrong tenant");
    });
    await expect(getCommentReplies({ commentId: 2, tenantId: "other" })).rejects.toThrow("Wrong tenant");
    expect(assertTenant).toHaveBeenLastCalledWith(expect.objectContaining({ postId: 5 }), "other");
    expect(dbMock.comment.findMany).not.toHaveBeenCalled();
  });

  it.each([
    null,
    { id: 1, commentId: null, deletedAt: new Date() },
    { id: 1, commentId: null, post: { removedAt: new Date() } },
  ])("rejects unavailable parent threads", async (parent) => {
    dbMock.comment.findUnique.mockResolvedValue(parent);
    await expect(getCommentReplies({ commentId: 1 })).rejects.toThrow("Comment not found");
    expect(dbMock.comment.findMany).not.toHaveBeenCalled();
  });

  it("preserves moderator visibility", async () => {
    dbMock.comment.findUnique.mockResolvedValue({ id: 1, commentId: null, removedAt: new Date() });
    dbMock.comment.findMany.mockResolvedValue([{ id: 2, removedAt: new Date() }]);
    expect(await getCommentReplies({ commentId: 1, user: { id: 7, mod: true } })).toHaveLength(1);
  });

  it("returns an empty list when replies are gone", async () => {
    expect(await getCommentReplies({ commentId: 1 })).toEqual([]);
  });

  it("rejects cyclic parent chains", async () => {
    dbMock.comment.findUnique.mockResolvedValue({ id: 1, commentId: 1 });
    await expect(getCommentReplies({ commentId: 1 })).rejects.toThrow("Comment not found");
  });
});
