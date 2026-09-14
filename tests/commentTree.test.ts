import { beforeEach, expect, it, vi } from "vitest";

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("../src/infra/db.js", () => ({ default: { comment: { findMany } } }));

import { loadCommentDescendants } from "../src/features/comments/load-tree.js";
import { mapCommentsForViewer } from "../src/features/comments/thread.service.js";

beforeEach(() => vi.resetAllMocks());

it("loads replies beyond the old depth limit and batches separate post trees", async () => {
  const roots = [{ id: 1 }, { id: 10 }];
  const replies = [
    { id: 2, commentId: 1 }, { id: 3, commentId: 2 },
    { id: 4, commentId: 3 }, { id: 5, commentId: 4 },
    { id: 6, commentId: 5 }, { id: 11, commentId: 10 },
  ];
  findMany.mockImplementation(async ({ where }) =>
    replies.filter((reply) => where.commentId.in.includes(reply.commentId)),
  );
  await loadCommentDescendants(roots);
  expect(roots).toEqual([
    { id: 1, children: [{ id: 2, commentId: 1, children: [
      { id: 3, commentId: 2, children: [{ id: 4, commentId: 3, children: [
        { id: 5, commentId: 4, children: [{ id: 6, commentId: 5, children: [] }] },
      ] }] },
    ] }] },
    { id: 10, children: [{ id: 11, commentId: 10, children: [] }] },
  ]);
  expect(findMany).toHaveBeenCalledTimes(6);
  expect(findMany.mock.calls[0][0].where.commentId.in).toEqual([1, 10]);
  expect(findMany.mock.calls[1][0].where.commentId.in).toEqual([2, 11]);
});

it("preserves viewer filtering of removed branches", async () => {
  const roots = [{ id: 1 }];
  findMany.mockResolvedValueOnce([{ id: 2, commentId: 1, removedAt: new Date() }])
    .mockResolvedValueOnce([{ id: 3, commentId: 2 }]).mockResolvedValue([]);
  await loadCommentDescendants(roots);
  expect(mapCommentsForViewer(roots, null, false)[0].children).toEqual([]);
  expect(mapCommentsForViewer(roots, null, true)[0].children?.[0].children).toHaveLength(1);
});

it("skips queries for an empty page", async () => {
  await loadCommentDescendants([]);
  expect(findMany).not.toHaveBeenCalled();
});
