import { z } from "zod";

import { env } from "../config/env.js";
import { NotFoundError } from "../lib/errors.js";
import * as GameTokenStore from "./gameTokenStore.js";

const DEVICE_CODE_EXPIRES_IN_MS = 10 * 60 * 1000;
const DEVICE_POLL_INTERVAL_SECONDS = 5;

// Used to auto-validate schema's
export const startDeviceAuthRequestSchema = z.object({
  clientName: z.string().trim().min(1).max(200),
});

export const deviceUserCodeSchema = z.object({
  userCode: z.string().trim().min(1),
});

export const deviceCodeSchema = z.object({
  deviceCode: z.string().trim().min(1),
});

export const revokeGameAccessTokenSchema = z.object({
  id: z.string().trim().min(1),
});

export type GameAccessTokenSummary = {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: Date;
  lastUsedAt: Date | null;
};

function toSummary(token: {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: Date;
  lastUsedAt: Date | null;
}): GameAccessTokenSummary {
  return {
    id: token.id,
    name: token.name,
    keyPrefix: token.keyPrefix,
    createdAt: token.createdAt,
    lastUsedAt: token.lastUsedAt,
  };
}

export async function createGameAccessToken(input: { userId: number; name: string }) {
  const { rawKey, token } = await GameTokenStore.createGameAccessTokenInDb(input);
  return { key: rawKey, token: toSummary(token) };
}

export async function listGameAccessTokens(userId: number) {
  const tokens = await GameTokenStore.listGameAccessTokensForUserInDb(userId);
  return tokens.map(toSummary);
}

export async function revokeGameAccessToken(id: string, userId: number) {
  return GameTokenStore.revokeGameAccessTokenInDb(id, userId);
}

export async function resolveUserByGameAccessToken(rawKey: string) {
  const token = await GameTokenStore.findGameAccessTokenByRawKeyInDb(rawKey);
  if (!token) {
    return null;
  }

  await GameTokenStore.touchGameAccessTokenLastUsedInDb(token.id);
  return token.user;
}

export async function startDeviceAuthRequest(input: { clientName: string }) {
  const { deviceCode, userCode, expiresAt } = await GameTokenStore.createDeviceAuthRequestInDb({
    clientName: input.clientName,
    expiresInMs: DEVICE_CODE_EXPIRES_IN_MS,
  });

  return {
    deviceCode,
    userCode,
    verificationUri: `${env.clientOrigin}/link-device?code=${userCode}`,
    expiresIn: Math.floor((expiresAt.getTime() - Date.now()) / 1000),
    interval: DEVICE_POLL_INTERVAL_SECONDS,
  };
}

export async function approveDeviceAuthRequest(input: { userCode: string; userId: number }) {
  const request = await GameTokenStore.findDeviceAuthRequestByUserCodeInDb(input.userCode);
  if (!request || request.status !== "PENDING" || request.expiresAt < new Date()) {
    throw new NotFoundError("Device request not found or expired");
  }

  const { rawKey, token } = await GameTokenStore.createGameAccessTokenInDb({
    userId: input.userId,
    name: request.clientName,
  });

  await GameTokenStore.approveDeviceAuthRequestInDb({
    id: request.id,
    userId: input.userId,
    tokenId: token.id,
    pendingToken: rawKey,
  });

  return request.clientName;
}

export async function denyDeviceAuthRequest(input: { userCode: string }) {
  const request = await GameTokenStore.findDeviceAuthRequestByUserCodeInDb(input.userCode);
  if (!request || request.status !== "PENDING") {
    throw new NotFoundError("Device request not found");
  }

  await GameTokenStore.denyDeviceAuthRequestInDb(request.id);
}

export type DevicePollResult =
  | { status: "authorization_pending" }
  | { status: "slow_down" }
  | { status: "denied" }
  | { status: "expired" }
  | { status: "approved"; token: string };

export async function pollDeviceAuthRequest(input: { deviceCode: string }): Promise<DevicePollResult> {
  const request = await GameTokenStore.findDeviceAuthRequestByRawDeviceCodeInDb(input.deviceCode);
  if (!request || request.expiresAt < new Date()) {
    return { status: "expired" };
  }

  if (request.status === "DENIED") {
    return { status: "denied" };
  }

  if (request.status === "PENDING") {
    const tooSoon =
      request.lastPolledAt &&
      Date.now() - request.lastPolledAt.getTime() < DEVICE_POLL_INTERVAL_SECONDS * 1000;

    await GameTokenStore.touchDeviceAuthRequestPolledInDb(request.id);
    return tooSoon ? { status: "slow_down" } : { status: "authorization_pending" };
  }

  const pendingToken = await GameTokenStore.consumeDeviceAuthRequestPendingTokenInDb(request.id);
  if (!pendingToken) {
    return { status: "expired" };
  }

  return { status: "approved", token: pendingToken };
}

export function cleanupExpiredDeviceAuthRequests() {
  return GameTokenStore.deleteExpiredDeviceAuthRequestsInDb();
}
