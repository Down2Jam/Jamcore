import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock, filterCoreEntityIdsByTenantMock } = vi.hoisted(() => ({
  dbMock: {
    conversationMember: { findUnique: vi.fn(), updateMany: vi.fn() },
    conversationMessage: { count: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
    conversation: { findMany: vi.fn(), update: vi.fn() },
    user: { findMany: vi.fn(), findUnique: vi.fn() },
    userBlock: { findFirst: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
    $transaction: vi.fn(),
  },
  filterCoreEntityIdsByTenantMock: vi.fn(),
}));

vi.mock("../src/infra/db.js", () => ({ default: dbMock }));
vi.mock("../src/infra/coreTenantStore.js", () => ({
  filterCoreEntityIdsByTenant: filterCoreEntityIdsByTenantMock,
}));

import { BadRequestError, ConflictError, ForbiddenError } from "../src/lib/errors.js";
import { blockUser, createConversation, sendMessage } from "../src/features/messages/service.js";

describe("message service", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not allow additional messages while every recipient is pending", async () => {
    dbMock.conversationMember.findUnique.mockResolvedValue({
      conversationId: 4,
      userId: 1,
      status: "ACCEPTED",
      lastReadMessageId: 1,
      conversation: {
        id: 4,
        type: "DIRECT",
        members: [
          { userId: 1, status: "ACCEPTED" },
          { userId: 2, status: "PENDING" },
        ],
        messages: [],
      },
    });

    await expect(sendMessage({
      actor: { id: 1 },
      conversationId: 4,
      input: { body: "A second message" },
    })).rejects.toBeInstanceOf(ConflictError);
  });

  it("does not allow users to block themselves", async () => {
    dbMock.user.findUnique.mockResolvedValue({ id: 1 });
    await expect(blockUser({ actor: { id: 1 }, targetSlug: "self" }))
      .rejects.toBeInstanceOf(BadRequestError);
  });

  it("resolves legacy recipients using the same tenant visibility rules as search", async () => {
    dbMock.user.findMany.mockResolvedValue([{
      id: 2,
      slug: "ategon",
      messageRequestPolicy: "EVERYONE",
      tenantId: null,
    }]);
    filterCoreEntityIdsByTenantMock.mockResolvedValue([2]);
    dbMock.userBlock.findFirst.mockResolvedValue({ blockerId: 2 });

    await expect(createConversation({
      actor: { id: 1 },
      input: { recipientSlugs: ["ategon"], name: null, body: "Hello" },
      tenantId: "default",
    })).rejects.toBeInstanceOf(ForbiddenError);

    expect(filterCoreEntityIdsByTenantMock).toHaveBeenCalledWith({
      entityType: "User",
      ids: [2],
      tenantId: "default",
    });
  });
});
