import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    $transaction: vi.fn(),
    gameAccessToken: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    deviceAuthRequest: {
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    game: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("../src/infra/db.js", () => ({ default: dbMock }));
vi.mock("../src/config/env.js", () => ({
  env: {
    clientOrigin: "https://jam.example.test",
  },
}));

import { NotFoundError } from "../src/lib/errors.js";
import {
  approveDeviceAuthRequest,
  cleanupExpiredDeviceAuthRequests,
  createGameAccessToken,
  denyDeviceAuthRequest,
  listGameAccessTokens,
  pollDeviceAuthRequest,
  resolveUserByGameAccessToken,
  revokeGameAccessToken,
  startDeviceAuthRequest,
} from "../src/auth/gameToken.js";

function hashKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}
beforeEach(() => {
  dbMock.$transaction.mockImplementation(async callback => callback(dbMock));
  dbMock.deviceAuthRequest.deleteMany.mockResolvedValue({ count: 1 });
});

describe("game access tokens", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a token whose hash matches what gets persisted, never exposing it back", async () => {
    dbMock.gameAccessToken.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({
        id: "token-1",
        userId: data.userId,
        name: data.name,
        keyPrefix: data.keyPrefix,
        keyHash: data.keyHash,
        createdAt: new Date("2026-01-01"),
        lastUsedAt: null,
        revokedAt: null,
      }),
    );

    const { key, token } = await createGameAccessToken({ userId: 1, gameId: 42, name: "Steam Deck" });

    expect(key.startsWith("d2j_")).toBe(true);
    expect(token.keyPrefix).toBe(key.slice(0, 12));
    expect(dbMock.gameAccessToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 1,
        gameId: 42,
        name: "Steam Deck",
        keyPrefix: key.slice(0, 12),
        keyHash: hashKey(key),
      }),
    });
    expect(token).not.toHaveProperty("keyHash");
  });

  it("resolves the owning user, token id and game id for a valid token, and bumps lastUsedAt", async () => {
    dbMock.gameAccessToken.findFirst.mockResolvedValue({
      id: "token-1",
      gameId: 42,
      user: { id: 7, slug: "ategon" },
    });

    const resolved = await resolveUserByGameAccessToken("d2j_whatever");

    expect(resolved).toEqual({ user: { id: 7, slug: "ategon" }, tokenId: "token-1", gameId: 42 });
    expect(dbMock.gameAccessToken.update).toHaveBeenCalledWith({
      where: { id: "token-1" },
      data: { lastUsedAt: expect.any(Date) },
    });
  });

  it("returns null for an unknown or revoked token, without touching lastUsedAt", async () => {
    dbMock.gameAccessToken.findFirst.mockResolvedValue(null);

    const resolved = await resolveUserByGameAccessToken("d2j_nope");

    expect(resolved).toBeNull();
    expect(dbMock.gameAccessToken.update).not.toHaveBeenCalled();
  });

  it("lists only the requesting user's tokens without their hash", async () => {
    dbMock.gameAccessToken.findMany.mockResolvedValue([
      {
        id: "token-1",
        name: "Steam Deck",
        keyPrefix: "d2j_abcdef12",
        keyHash: "should-not-leak",
        createdAt: new Date("2026-01-01"),
        lastUsedAt: null,
      },
    ]);

    const tokens = await listGameAccessTokens(7);

    expect(dbMock.gameAccessToken.findMany).toHaveBeenCalledWith({
      where: { userId: 7, revokedAt: null },
      orderBy: { createdAt: "desc" },
    });
    expect(tokens).toEqual([
      {
        id: "token-1",
        name: "Steam Deck",
        keyPrefix: "d2j_abcdef12",
        createdAt: new Date("2026-01-01"),
        lastUsedAt: null,
      },
    ]);
  });

  it("revokes a token only when it belongs to the requesting user", async () => {
    dbMock.gameAccessToken.updateMany.mockResolvedValue({ count: 1 });

    const revoked = await revokeGameAccessToken("token-1", 7);

    expect(revoked).toBe(true);
    expect(dbMock.gameAccessToken.updateMany).toHaveBeenCalledWith({
      where: { id: "token-1", userId: 7, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });
});

describe("device authorization flow", () => {
  beforeEach(() => vi.clearAllMocks());

  it("builds a verification URI from the configured client origin and resolved game", async () => {
    dbMock.game.findUnique.mockResolvedValue({ id: 42 });
    dbMock.deviceAuthRequest.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ ...data, id: "device-1" }),
    );

    const request = await startDeviceAuthRequest({
      clientName: "Godot Client",
      gameSlug: "weldroot",
    });

    expect(request.deviceCode.startsWith("d2jd_")).toBe(true);
    expect(request.verificationUri).toBe(
      `https://jam.example.test/link-device?code=${request.userCode}&game=weldroot`,
    );
    expect(request.interval).toBe(5);
    expect(dbMock.game.findUnique).toHaveBeenCalledWith({
      where: { slug: "weldroot" },
      select: { id: true },
    });
    expect(dbMock.deviceAuthRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ gameId: 42 }),
    });
  });

  it("rejects starting a device link for an unknown game", async () => {
    dbMock.game.findUnique.mockResolvedValue(null);

    await expect(
      startDeviceAuthRequest({ clientName: "Godot Client", gameSlug: "nope" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(dbMock.deviceAuthRequest.create).not.toHaveBeenCalled();
  });

  it("rejects approval of an unknown, non-pending, or expired code", async () => {
    dbMock.deviceAuthRequest.updateMany.mockResolvedValue({ count: 0 });
    dbMock.deviceAuthRequest.findUnique.mockResolvedValue(null);

    await expect(
      approveDeviceAuthRequest({ userCode: "AAAA-BBBB", userId: 1 }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("issues a token scoped to the device row's game, and stages its raw value for pickup", async () => {
    dbMock.deviceAuthRequest.findUniqueOrThrow.mockResolvedValue({
      id: "device-1",
      status: "PENDING",
      clientName: "Godot Client",
      gameId: 42,
      expiresAt: new Date(Date.now() + 60_000),
    });
    dbMock.gameAccessToken.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ ...data, id: "token-1" }),
    );
    dbMock.deviceAuthRequest.updateMany.mockResolvedValue({ count: 1 });

    await approveDeviceAuthRequest({ userCode: "AAAA-BBBB", userId: 7 });

    expect(dbMock.gameAccessToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 7, gameId: 42 }),
    });
    expect(dbMock.deviceAuthRequest.updateMany).toHaveBeenCalledWith({
      where: { userCode: "AAAA-BBBB", status: "PENDING", expiresAt: { gt: expect.any(Date) } },
      data: expect.objectContaining({
        status: "APPROVED",
        userId: 7,
      }),
    });
    expect(dbMock.deviceAuthRequest.update).toHaveBeenCalledWith({ where: { id: "device-1" }, data: { tokenId: "token-1", pendingToken: expect.stringContaining("d2j_") } });
  });

  it("rejects denial of a request that is not pending", async () => {
    dbMock.deviceAuthRequest.findUnique.mockResolvedValue({ id: "device-1", status: "APPROVED" });

    await expect(denyDeviceAuthRequest({ userCode: "AAAA-BBBB" })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
  it("creates only one token when two approvals compete for a request", async () => {
    dbMock.deviceAuthRequest.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    dbMock.deviceAuthRequest.findUniqueOrThrow.mockResolvedValue({ id: "device-1", gameId: 42, clientName: "Client" });
    dbMock.gameAccessToken.create.mockResolvedValue({ id: "token-1" });
    const results = await Promise.allSettled([
      approveDeviceAuthRequest({ userCode: "AAAA-BBBB", userId: 7 }),
      approveDeviceAuthRequest({ userCode: "AAAA-BBBB", userId: 8 }),
    ]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(dbMock.gameAccessToken.create).toHaveBeenCalledTimes(1);
    expect(dbMock.deviceAuthRequest.update).toHaveBeenCalledTimes(1);
    expect(dbMock.$transaction).toHaveBeenCalledTimes(2);
  });
  it("propagates token-creation failures out of the transaction without publishing a token", async () => {
    dbMock.deviceAuthRequest.updateMany.mockResolvedValue({ count: 1 });
    dbMock.deviceAuthRequest.findUniqueOrThrow.mockResolvedValue({ id: "device-1", gameId: 42, clientName: "Client" });
    dbMock.gameAccessToken.create.mockRejectedValueOnce(new Error("Write failed"));
    await expect(approveDeviceAuthRequest({ userCode: "AAAA-BBBB", userId: 7 })).rejects.toThrow("Write failed");
    expect(dbMock.deviceAuthRequest.update).not.toHaveBeenCalled();
  });

  it("cleans up stale pending/expired requests", async () => {
    dbMock.deviceAuthRequest.deleteMany.mockResolvedValue({ count: 3 });

    const deleted = await cleanupExpiredDeviceAuthRequests();

    expect(deleted).toBe(3);
    expect(dbMock.deviceAuthRequest.deleteMany).toHaveBeenCalledWith({
      where: {
        expiresAt: { lt: expect.any(Date) },
        status: { in: ["PENDING", "EXPIRED"] },
      },
    });
  });

  describe("polling", () => {
    it("reports expired for an unknown or expired device code", async () => {
      dbMock.deviceAuthRequest.findUnique.mockResolvedValue(null);

      const result = await pollDeviceAuthRequest({ deviceCode: "d2jd_nope" });

      expect(result).toEqual({ status: "expired" });
    });
    it("does not hand over a token when another poll already consumed it", async () => {
      dbMock.deviceAuthRequest.findUnique.mockResolvedValue({ id: "device-1", status: "APPROVED", expiresAt: new Date(Date.now() + 60000), pendingToken: "secret", userId: 7 });
      dbMock.deviceAuthRequest.deleteMany.mockResolvedValue({ count: 0 });
      expect(await pollDeviceAuthRequest({ deviceCode: "device" })).toEqual({ status: "expired" });
      expect(dbMock.user.findUnique).not.toHaveBeenCalled();
    });

    it("reports denied", async () => {
      dbMock.deviceAuthRequest.findUnique.mockResolvedValue({
        status: "DENIED",
        expiresAt: new Date(Date.now() + 60_000),
      });

      const result = await pollDeviceAuthRequest({ deviceCode: "d2jd_x" });

      expect(result).toEqual({ status: "denied" });
    });

    it("reports slow_down when polled again inside the interval", async () => {
      dbMock.deviceAuthRequest.findUnique.mockResolvedValue({
        id: "device-1",
        status: "PENDING",
        lastPolledAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      });

      const result = await pollDeviceAuthRequest({ deviceCode: "d2jd_x" });

      expect(result).toEqual({ status: "slow_down" });
      expect(dbMock.deviceAuthRequest.update).toHaveBeenCalledWith({
        where: { id: "device-1" },
        data: { lastPolledAt: expect.any(Date) },
      });
    });

    it("reports authorization_pending on a first poll", async () => {
      dbMock.deviceAuthRequest.findUnique.mockResolvedValue({
        id: "device-1",
        status: "PENDING",
        lastPolledAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      });

      const result = await pollDeviceAuthRequest({ deviceCode: "d2jd_x" });

      expect(result).toEqual({ status: "authorization_pending" });
    });

    it("hands over the pending token and the approving user's profile exactly once, then reports expired", async () => {
      dbMock.deviceAuthRequest.findUnique
        .mockResolvedValueOnce({
          id: "device-1",
          status: "APPROVED",
          expiresAt: new Date(Date.now() + 60_000),
        })
        .mockResolvedValueOnce({ id: "device-1", pendingToken: "d2j_secret", userId: 7 });
      dbMock.user.findUnique.mockResolvedValue({
        id: 7,
        slug: "ategon",
        name: "Ategon",
        profilePicture: null,
      });

      const result = await pollDeviceAuthRequest({ deviceCode: "d2jd_x" });

      expect(result).toEqual({
        status: "approved",
        token: "d2j_secret",
        user: { id: 7, slug: "ategon", name: "Ategon", profilePicture: null },
      });
      expect(dbMock.deviceAuthRequest.deleteMany).toHaveBeenCalledWith({ where: { id: "device-1", status: "APPROVED", expiresAt: { gt: expect.any(Date) } } });
      expect(dbMock.user.findUnique).toHaveBeenCalledWith({
        where: { id: 7 },
        select: { id: true, slug: true, name: true, profilePicture: true },
      });
    });
  });
});
