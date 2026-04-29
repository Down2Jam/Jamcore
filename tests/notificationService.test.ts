import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    notification: {
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock("../infra/db.js", () => ({
  default: dbMock,
}));

import { ForbiddenError, NotFoundError } from "../lib/errors.js";
import { deleteNotificationById } from "../features/notifications";

describe("notification service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows notification owners to delete their notification", async () => {
    dbMock.notification.findUnique.mockResolvedValueOnce({
      id: 4,
      recipientId: 9,
    });
    dbMock.notification.delete.mockResolvedValueOnce({});

    await deleteNotificationById({
      notificationId: 4,
      actor: { id: 9, mod: false, admin: false },
    });

    expect(dbMock.notification.delete).toHaveBeenCalledWith({
      where: { id: 4 },
    });
  });

  it("rejects deletion when the notification is missing", async () => {
    dbMock.notification.findUnique.mockResolvedValueOnce(null);

    await expect(
      deleteNotificationById({
        notificationId: 4,
        actor: { id: 9, mod: false, admin: false },
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects non-owner non-moderator deletion attempts", async () => {
    dbMock.notification.findUnique.mockResolvedValueOnce({
      id: 4,
      recipientId: 12,
    });

    await expect(
      deleteNotificationById({
        notificationId: 4,
        actor: { id: 9, mod: false, admin: false },
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

