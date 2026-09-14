import { createHash, randomBytes, randomUUID } from "node:crypto";

import db from "../infra/db.js";

export const GAME_TOKEN_PREFIX = "d2j_";
const DEVICE_CODE_PREFIX = "d2jd_";
const USER_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export type DeviceAuthStatus = "PENDING" | "APPROVED" | "DENIED" | "EXPIRED";

function hashKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

function generateUserCode() {
  const segment = () =>
    Array.from(
      { length: 4 },
      () => USER_CODE_ALPHABET[randomBytes(1)[0] % USER_CODE_ALPHABET.length],
    ).join("");
  return `${segment()}-${segment()}`;
}

export async function createGameAccessTokenInDb(input: {
  userId: number;
  gameId: number;
  name: string;
}, client: Pick<typeof db, "gameAccessToken"> = db) {
  const key = `${GAME_TOKEN_PREFIX}${randomBytes(24).toString("hex")}`;
  const keyPrefix = key.slice(0, 12);
  const keyHash = hashKey(key);

  const token = await client.gameAccessToken.create({
    data: {
      id: randomUUID(),
      userId: input.userId,
      gameId: input.gameId,
      name: input.name,
      keyPrefix,
      keyHash,
    },
  });

  return { rawKey: key, token };
}

export async function findGameAccessTokenByRawKeyInDb(rawKey: string) {
  return db.gameAccessToken.findFirst({
    where: { keyHash: hashKey(rawKey), revokedAt: null },
    include: { user: true },
  });
}

export async function touchGameAccessTokenLastUsedInDb(id: string) {
  await db.gameAccessToken.update({
    where: { id },
    data: { lastUsedAt: new Date() },
  });
}

export async function listGameAccessTokensForUserInDb(userId: number) {
  return db.gameAccessToken.findMany({
    where: { userId, revokedAt: null },
    orderBy: { createdAt: "desc" },
  });
}

export async function revokeGameAccessTokenInDb(id: string, userId: number) {
  const result = await db.gameAccessToken.updateMany({
    where: { id, userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  return result.count > 0;
}

export async function createDeviceAuthRequestInDb(input: {
  clientName: string;
  gameId: number;
  expiresInMs: number;
}) {
  const deviceCode = `${DEVICE_CODE_PREFIX}${randomBytes(24).toString("hex")}`;
  const userCode = generateUserCode();
  const expiresAt = new Date(Date.now() + input.expiresInMs);

  const request = await db.deviceAuthRequest.create({
    data: {
      id: randomUUID(),
      deviceCode: hashKey(deviceCode),
      userCode,
      clientName: input.clientName,
      gameId: input.gameId,
      status: "PENDING" satisfies DeviceAuthStatus,
      expiresAt,
    },
  });

  return { deviceCode, userCode, expiresAt, request };
}

export async function findGameIdBySlugInDb(slug: string) {
  const game = await db.game.findUnique({ where: { slug }, select: { id: true } });
  return game?.id ?? null;
}

export async function findDeviceAuthRequestByUserCodeInDb(userCode: string) {
  return db.deviceAuthRequest.findUnique({
    where: { userCode: userCode.toUpperCase() },
  });
}

export async function findDeviceAuthRequestByRawDeviceCodeInDb(rawDeviceCode: string) {
  return db.deviceAuthRequest.findUnique({
    where: { deviceCode: hashKey(rawDeviceCode) },
  });
}

export async function approveDeviceAuthRequestInDb(input: {
  userCode: string;
  userId: number;
}) {
  return db.$transaction(async tx => {
    // Claim first; token creation and publication roll back together on failure.
    const claimed = await tx.deviceAuthRequest.updateMany({
      where: { userCode: input.userCode.toUpperCase(), status: "PENDING", expiresAt: { gt: new Date() } },
      data: { status: "APPROVED", userId: input.userId },
    });
    if (claimed.count !== 1) return null;
    const request = await tx.deviceAuthRequest.findUniqueOrThrow({ where: { userCode: input.userCode.toUpperCase() } });
    const { rawKey, token } = await createGameAccessTokenInDb({ userId: input.userId, gameId: request.gameId, name: request.clientName }, tx);
    await tx.deviceAuthRequest.update({ where: { id: request.id }, data: { tokenId: token.id, pendingToken: rawKey } });
    return request.clientName;
  });
}

export async function denyDeviceAuthRequestInDb(id: string) {
  const result = await db.deviceAuthRequest.updateMany({
    where: { id, status: "PENDING" satisfies DeviceAuthStatus },
    data: { status: "DENIED" satisfies DeviceAuthStatus },
  });

  return result.count > 0;
}

export async function touchDeviceAuthRequestPolledInDb(id: string) {
  await db.deviceAuthRequest.update({
    where: { id },
    data: { lastPolledAt: new Date() },
  });
}

export async function consumeDeviceAuthRequestPendingTokenInDb(id: string) {
  return db.$transaction(async tx => {
    const request = await tx.deviceAuthRequest.findUnique({ where: { id } });
    if (!request?.pendingToken || !request.userId) return null;
    const consumed = await tx.deviceAuthRequest.deleteMany({ where: { id, status: "APPROVED", expiresAt: { gt: new Date() } } });
    return consumed.count === 1 ? { pendingToken: request.pendingToken, userId: request.userId } : null;
  });
}

export async function findUserProfileByIdInDb(userId: number) {
  return db.user.findUnique({
    where: { id: userId },
    select: { id: true, slug: true, name: true, profilePicture: true },
  });
}

export async function deleteExpiredDeviceAuthRequestsInDb() {
  const result = await db.deviceAuthRequest.deleteMany({
    where: {
      expiresAt: { lt: new Date() },
      status: { in: ["PENDING", "EXPIRED"] satisfies DeviceAuthStatus[] },
    },
  });

  return result.count;
}
