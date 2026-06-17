import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    comment: {
      findUnique: vi.fn(),
      update: vi.fn(async () => ({})),
    },
  },
}));

vi.mock("../src/infra/db.js", () => ({
  default: dbMock,
}));

vi.mock("../src/features/comments/thread.service.js", () => ({
  cleanupNotificationsForComment: vi.fn(async () => undefined),
}));

import { cleanupNotificationsForComment } from "../src/features/comments/thread.service.js";
import { ForbiddenError, NotFoundError } from "../src/lib/errors.js";
import { deleteCommentById } from "../src/features/comments/moderation.service.js";

describe("comment moderation service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes a comment for its author", async () => {
    dbMock.comment.findUnique.mockResolvedValue({
      id: 8,
      authorId: 2,
      deletedAt: null,
      removedAt: null,
    });

    const message = await deleteCommentById({
      commentId: 8,
      mode: "delete",
      actor: { id: 2 },
    });

    expect(message).toBe("Comment deleted");
    expect(cleanupNotificationsForComment).toHaveBeenCalledWith(8);
    expect(dbMock.comment.update).toHaveBeenCalled();
  });

  it("prevents non-moderators from removing comments", async () => {
    dbMock.comment.findUnique.mockResolvedValue({
      id: 8,
      authorId: 2,
      deletedAt: null,
      removedAt: null,
    });

    await expect(
      deleteCommentById({
        commentId: 8,
        mode: "remove",
        actor: { id: 2, mod: false, admin: false },
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("throws when the comment does not exist", async () => {
    dbMock.comment.findUnique.mockResolvedValue(null);
    await expect(
      deleteCommentById({
        commentId: 88,
        mode: "delete",
        actor: { id: 2 },
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

