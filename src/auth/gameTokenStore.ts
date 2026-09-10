import { createHash, randomBytes, randomUUID } from "node:crypto";

import db from "../infra/db.js";

const GAME_TOKEN_PREFIX = "d2j_";
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

export async function createGameAccessTokenInDb(input: { userId: number; name: string }) {
  const key = `${GAME_TOKEN_PREFIX}${randomBytes(24).toString("hex")}`;
  const keyPrefix = key.slice(0, 12);
  const keyHash = hashKey(key);

  const token = await db.gameAccessToken.create({
    data: {
      id: randomUUID(),
      userId: input.userId,
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
      status: "PENDING" satisfies DeviceAuthStatus,
      expiresAt,
    },
  });

  return { deviceCode, userCode, expiresAt, request };
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
  id: string;
  userId: number;
  tokenId: string;
  pendingToken: string;
}) {
  const result = await db.deviceAuthRequest.updateMany({
    where: { id: input.id, status: "PENDING" satisfies DeviceAuthStatus },
    data: {
      status: "APPROVED" satisfies DeviceAuthStatus,
      userId: input.userId,
      tokenId: input.tokenId,
      pendingToken: input.pendingToken,
    },
  });

  return result.count > 0;
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
  const request = await db.deviceAuthRequest.findUnique({ where: { id } });
  if (!request?.pendingToken) {
    return null;
  }

  await db.deviceAuthRequest.delete({ where: { id } });
  return request.pendingToken;
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
