import { randomBytes, timingSafeEqual } from "node:crypto";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../../config/env.js";
import db from "../../infra/db.js";
import { BadRequestError, ConfigurationError, ConflictError } from "../../lib/errors.js";

const audience = "twitch-account-link";
export const twitchCookieName = "twitch-link";
export const twitchCookieOptions = {
  httpOnly: true,
  secure: env.nodeEnv === "production",
  sameSite: "strict" as const,
  path: "/api/v1/connections/twitch",
};

export function twitchConfiguration() {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  const redirectUri = new URL("/settings/twitch-callback", env.clientOrigin).href;
  return { clientId, clientSecret, redirectUri, configured: Boolean(clientId && clientSecret && env.tokenSecret) };
}

function requireConfiguration() {
  const config = twitchConfiguration();
  if (!config.clientId || !config.clientSecret || !env.tokenSecret) {
    throw new ConfigurationError("Twitch connection is not configured yet.");
  }
  return { ...config, clientId: config.clientId, clientSecret: config.clientSecret, secret: env.tokenSecret };
}

export function beginTwitchConnection(userId: number, tenantId?: string | null) {
  const config = requireConfiguration();
  const nonce = randomBytes(32).toString("hex");
  const state = jwt.sign({ nonce, tenant: tenantId ?? null }, config.secret, {
    subject: String(userId), audience, expiresIn: "10m", algorithm: "HS256",
  });
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: "",
    force_verify: "true",
    state,
  });
  return { nonce, url: `https://id.twitch.tv/oauth2/authorize?${params}` };
}

export function verifyTwitchState(state: string, nonce: unknown, userId: number, tenantId?: string | null) {
  const config = requireConfiguration();
  try {
    const payload = jwt.verify(state, config.secret, { algorithms: ["HS256"], audience, subject: String(userId) });
    if (typeof payload === "string" || typeof payload.nonce !== "string" || typeof nonce !== "string" ||
      payload.tenant !== (tenantId ?? null) || payload.nonce.length !== nonce.length ||
      !timingSafeEqual(Buffer.from(payload.nonce), Buffer.from(nonce))) throw new Error("Invalid state");
  } catch {
    throw new BadRequestError("This Twitch connection expired or belongs to another session. Please try again from Settings.");
  }
}

export async function readTwitchUsername(code: string) {
  const config = requireConfiguration();
  const response = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST", signal: AbortSignal.timeout(10_000),
    body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret,
      code, grant_type: "authorization_code", redirect_uri: config.redirectUri }),
  });
  if (!response.ok) throw new BadRequestError("Twitch could not verify the connection. Please try again.");
  const tokenResult = z.object({ access_token: z.string().min(1) }).safeParse(await response.json());
  if (!tokenResult.success) throw new BadRequestError("Twitch did not return a valid access token. Please reconnect from Settings.");
  const token = tokenResult.data;
  try {
    const validation = await fetch("https://id.twitch.tv/oauth2/validate", {
      headers: { Authorization: `OAuth ${token.access_token}` }, signal: AbortSignal.timeout(10_000),
    });
    if (!validation.ok) throw new BadRequestError("Twitch could not verify your username.");
    const identityResult = z.object({ client_id: z.string(), login: z.string().regex(/^[a-z0-9_]{1,25}$/),
      scopes: z.array(z.string()).nullable().transform((scopes) => scopes ?? []),
      expires_in: z.number().positive() }).safeParse(await validation.json());
    if (!identityResult.success) {
      const fields = [...new Set(identityResult.error.issues.map((issue) => issue.path.join(".")))].join(", ");
      throw new BadRequestError(`Twitch returned invalid account information (${fields}). Please reconnect from Settings.`);
    }
    const identity = identityResult.data;
    if (identity.client_id !== config.clientId || identity.scopes.length !== 0) {
      throw new BadRequestError("Twitch returned unexpected permissions. Remove this app from Twitch Connections and try again.");
    }
    return identity.login;
  } finally {
    // This is a one-time username verification, not an ongoing Twitch session.
    // Tokens (including any refresh token) are never stored or sent to the browser.
    await fetch("https://id.twitch.tv/oauth2/revoke", {
      method: "POST", signal: AbortSignal.timeout(10_000),
      body: new URLSearchParams({ client_id: config.clientId, token: token.access_token }),
    }).catch(() => undefined);
  }
}

export async function linkTwitchUsername(userId: number, username: string) {
  return db.$transaction(async (tx) => {
    // Serialize attempts to claim a channel, including connections on other API workers.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`twitch:${username}`}))`;
    const existing = await tx.user.findFirst({ where: { twitch: { equals: username, mode: "insensitive" }, id: { not: userId } }, select: { id: true } });
    if (existing) throw new ConflictError("This Twitch channel is already connected to another account.");
    return tx.user.update({ where: { id: userId }, data: { twitch: username }, select: { twitch: true } });
  });
}

export function disconnectTwitch(userId: number) {
  return db.user.update({ where: { id: userId }, data: { twitch: null, autoHideRatingsWhileStreaming: false }, select: { twitch: true } });
}
