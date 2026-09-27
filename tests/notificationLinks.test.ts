import { beforeEach, expect, it, vi } from "vitest";

const { findUnique, queryRawUnsafe } = vi.hoisted(() => ({ findUnique: vi.fn(), queryRawUnsafe: vi.fn() }));
vi.mock("../src/infra/db.js", () => ({
  default: { comment: { findUnique }, $queryRawUnsafe: queryRawUnsafe },
}));

import { repairCommentNotificationLinks } from "../src/features/notifications/links.js";
import { listNotifications } from "../src/features/notifications/service.js";

beforeEach(() => { findUnique.mockReset(); queryRawUnsafe.mockReset(); });

it.each([
  [{ post: { id: 1, slug: "post" } }, "/p/post"],
  [{ game: { id: 1, slug: "game" } }, "/g/game"],
  [{ gamePage: { game: { id: 1, slug: "game" } } }, "/g/game"],
  [{ track: { id: 1, slug: "track" } }, "/m/track"],
])("repairs old comment URLs through arbitrarily nested replies", async (target, page) => {
  findUnique.mockImplementation(async ({ where: { id } }) => id > 1 ? { commentId: id - 1 } : target);
  const notifications = [{ link: "/comments/8" }, { link: "#comment-8" }, { link: null, commentId: 8 }];
  await repairCommentNotificationLinks(notifications);
  expect(notifications.map(n => n.link)).toEqual(Array(3).fill(`${page}?comment=8#comment-8`));
  expect(findUnique).toHaveBeenCalledTimes(8);
});

it("leaves valid links alone without looking up comments", async () => {
  const notifications = [{ link: "/p/post?comment=8#comment-8", commentId: 8 }, { link: "https://example.com/comments/8" }];
  const original = structuredClone(notifications);
  await repairCommentNotificationLinks(notifications);
  expect(notifications).toEqual(original);
  expect(findUnique).not.toHaveBeenCalled();
});

it("removes dead links when the comment no longer exists", async () => {
  findUnique.mockResolvedValue(null);
  const notifications = [{ link: "/comments/8" }];
  await repairCommentNotificationLinks(notifications);
  expect(notifications[0].link).toBeNull();
});

it("stops safely on a broken parent cycle", async () => {
  findUnique.mockResolvedValue({ commentId: 8 });
  const notifications = [{ link: "/comments/8" }];
  await repairCommentNotificationLinks(notifications);
  expect(notifications[0].link).toBeNull();
  expect(findUnique).toHaveBeenCalledTimes(1);
});

it("returns repaired links from the notifications API", async () => {
  queryRawUnsafe.mockResolvedValueOnce([{ id: 1, link: "/comments/8" }]).mockResolvedValueOnce([{ count: 1 }]);
  findUnique.mockResolvedValue({ post: { id: 1, slug: "post" } });
  const result = await listNotifications({ actor: { id: 7 }, input: { status: "all", limit: 50 } });
  expect(result.items[0].link).toBe("/p/post?comment=8#comment-8");
  expect(result.unreadCount).toBe(1);
});
