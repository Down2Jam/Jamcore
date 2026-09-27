import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
// Requires a disposable database with the token migration and User(id, slug) fixture applied.
// Never runs against DATABASE_URL by default.
const testUrl = process.env.TOKEN_TEST_DATABASE_URL;
vi.mock("../src/infra/coreTenantStore.js", () => ({ doesCoreEntityBelongToTenant: async () => true }));
vi.mock("../src/infra/rateLimitStore.js", () => ({ incrementRateLimit: async () => ({ count: 1, resetMs: 60000 }) }));
describe.skipIf(!testUrl)("token storage on PostgreSQL", () => {
  let db: typeof import("../src/infra/db.js").default;
  let tokens: typeof import("../src/auth/tokenStore.js");
  let oauth: typeof import("../src/auth/oauth.js");
  let server: Server;
  let base: string;
  let origin: string;
  beforeAll(async () => {
    process.env.DATABASE_URL = testUrl!;
    db = (await import("../src/infra/db.js")).default;
    tokens = await import("../src/auth/tokenStore.js");
    oauth = await import("../src/auth/oauth.js");
    origin = new URL((await import("../src/config/env.js")).env.clientOrigin).origin;
    const app = express();
    app.use((await import("../src/middleware/apiCors.js")).createApiCors(origin));
    app.use(express.json());
    app.use((await import("../src/middleware/responseEnvelope.js")).responseEnvelope);
    app.use("/api/v1/oauth", (await import("../src/routes/v1/oauth/get.js")).default);
    app.get("/api/v1/self", (await import("../src/middleware/authUser.js")).default, (_req, res) => res.json({ ok: true }));
    app.use((error: { statusCode?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(error.statusCode ?? 500).json({ error: "Request rejected" }));
    server = await new Promise<Server>(resolve => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
  });
  beforeEach(async () => {
    await db.authSession.deleteMany({ where: { userId: 1 } });
    await db.oAuthApp.deleteMany({ where: { ownerId: 1 } });
  });
  afterAll(async () => {
    if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await db?.$disconnect();
  });
  it("stores only hashes and separates access from refresh tokens", async () => {
    const pair = await tokens.createSessionTokens(1);
    expect(pair.accessToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(pair.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(pair.accessToken).not.toBe(pair.refreshToken);
    expect((await tokens.resolveAccessToken(pair.accessToken))?.user.slug).toBe("token-test");
    expect(await tokens.resolveAccessToken(pair.refreshToken)).toBeNull();
    await expect(tokens.rotateSessionTokens(pair.accessToken)).rejects.toThrow();
    const stored = await db.accessToken.findUniqueOrThrow({ where: { hash: tokens.hashToken(pair.accessToken) } });
    expect(stored.hash).toBe(tokens.hashToken(pair.accessToken));
    expect(stored.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 900000);
  });
  it("enforces expiry and tenant isolation", async () => {
    const pair = await tokens.createSessionTokens(1, "tenant-a");
    expect(await tokens.resolveAccessToken(pair.accessToken, "tenant-b")).toBeNull();
    await expect(tokens.rotateSessionTokens(pair.refreshToken, "tenant-b")).rejects.toThrow();
    expect(await tokens.resolveAccessToken(pair.accessToken, "tenant-a")).not.toBeNull();
    await db.accessToken.update({ where: { hash: tokens.hashToken(pair.accessToken) }, data: { expiresAt: new Date(0) } });
    expect(await tokens.resolveAccessToken(pair.accessToken, "tenant-a")).toBeNull();
  });
  it("rotates refresh tokens and commits family revocation on replay", async () => {
    const first = await tokens.createSessionTokens(1);
    const second = await tokens.rotateSessionTokens(first.refreshToken);
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(second.expiresAt).toEqual(first.expiresAt);
    await expect(tokens.rotateSessionTokens(first.refreshToken)).rejects.toThrow();
    expect(await tokens.resolveAccessToken(second.accessToken)).toBeNull();
    await expect(tokens.rotateSessionTokens(second.refreshToken)).rejects.toThrow();
  });
  it("serializes concurrent rotations and revokes the raced family", async () => {
    const first = await tokens.createSessionTokens(1);
    const results = await Promise.allSettled([tokens.rotateSessionTokens(first.refreshToken), tokens.rotateSessionTokens(first.refreshToken)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
    expect((await db.authSession.findUniqueOrThrow({ where: { id: first.sessionId } })).revokedAt).not.toBeNull();
  });
  it("revokes the entire session on logout", async () => {
    const pair = await tokens.createSessionTokens(1);
    await tokens.revokeSessionToken(pair.accessToken, "access");
    expect(await tokens.resolveAccessToken(pair.accessToken)).toBeNull();
    await expect(tokens.rotateSessionTokens(pair.refreshToken)).rejects.toThrow();
  });
  async function authorization() {
    const app = await db.oAuthApp.create({ data: { id: crypto.randomUUID(), ownerId: 1, name: "Alternate frontend", redirectUris: ["https://client.example/callback"] } });
    const verifier = "a".repeat(64);
    const request = oauth.authorizeSchema.parse({ client_id: app.id, redirect_uri: app.redirectUris[0], response_type: "code", scope: "profile:read games:write",
      state: "unpredictable-state", code_challenge_method: "S256", code_challenge: createHash("sha256").update(verifier).digest("base64url") });
    const redirect = await oauth.approveAuthorization(request, 1, undefined, true);
    return { app, request, input: oauth.exchangeCodeSchema.parse({ grant_type: "authorization_code", client_id: app.id, redirect_uri: app.redirectUris[0],
      code_verifier: verifier, code: new URL(redirect.redirectUri).searchParams.get("code") }) };
  }
  it("exchanges PKCE codes and binds refresh tokens to the app", async () => {
    const { app, input } = await authorization();
    await expect(oauth.exchangeCode({ ...input, code_verifier: "b".repeat(64) })).rejects.toThrow();
    await expect(oauth.exchangeCode({ ...input, redirect_uri: "https://evil.example/callback" })).rejects.toThrow();
    const pair = await oauth.exchangeCode(input);
    expect((await tokens.resolveAccessToken(pair.accessToken))?.scopes).toEqual(["profile:read", "games:write"]);
    await expect(tokens.rotateSessionTokens(pair.refreshToken)).rejects.toThrow();
    const refreshed = await tokens.rotateSessionTokens(pair.refreshToken, undefined, app.id);
    expect(await tokens.resolveAccessToken(refreshed.accessToken)).not.toBeNull();
    await expect(oauth.exchangeCode(input)).rejects.toThrow();
    expect(await tokens.resolveAccessToken(refreshed.accessToken)).toBeNull();
  });
  it("denial issues no code and disabling an app invalidates its tokens", async () => {
    const { app, input, request } = await authorization();
    const denial = new URL((await oauth.approveAuthorization(request, 1, undefined, false)).redirectUri);
    expect(denial.searchParams.get("error")).toBe("access_denied");
    expect(denial.searchParams.has("code")).toBe(false);
    const pair = await oauth.exchangeCode(input);
    await db.oAuthApp.update({ where: { id: app.id }, data: { disabledAt: new Date() } });
    expect(await tokens.resolveAccessToken(pair.accessToken)).toBeNull();
    await expect(tokens.rotateSessionTokens(pair.refreshToken, undefined, app.id)).rejects.toThrow();
  });
  it("completes registration, consent, code exchange and revocation through HTTP", async () => {
    const website = await tokens.createSessionTokens(1);
    const headers = { Authorization: `Bearer ${website.accessToken}`, Origin: origin, "Content-Type": "application/json" };
    const registration = await fetch(base + "/oauth/apps", { method: "POST", headers, body: JSON.stringify({ name: "Browser client", redirectUris: ["https://client.example/callback"] }) });
    expect(registration.status).toBe(201);
    const { data: app } = await registration.json();
    const verifier = "v".repeat(64);
    const request = { response_type: "code", client_id: app.id, redirect_uri: app.redirectUris[0], scope: "profile:read", state: "s".repeat(32),
      code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256" };
    const foreign = await fetch(base + "/oauth/authorize", { method: "POST", headers: { ...headers, Origin: "https://evil.example" }, body: JSON.stringify({ ...request, approved: true }) });
    expect(foreign.status).toBe(403);
    const approval = await fetch(base + "/oauth/authorize", { method: "POST", headers, body: JSON.stringify({ ...request, approved: true }) });
    expect(approval.status).toBe(200);
    const callback = new URL((await approval.json()).data.redirectUri);
    expect(callback.searchParams.get("state")).toBe(request.state);
    const tokenResponse = await fetch(base + "/oauth/token", { method: "POST", headers: { Origin: "https://client.example", "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", code: callback.searchParams.get("code")!, client_id: app.id, redirect_uri: app.redirectUris[0], code_verifier: verifier }) });
    expect(tokenResponse.status).toBe(200);
    expect(tokenResponse.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(tokenResponse.headers.get("Set-Cookie")).toBeNull();
    const pair = await tokenResponse.json();
    expect(pair.access_token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(pair.data).toBeUndefined();
    expect((await fetch(base + "/self", { headers: { Authorization: `Bearer ${pair.access_token}` } })).status).toBe(200);
    expect((await fetch(base + "/oauth/apps", { headers: { Authorization: `Bearer ${pair.access_token}` } })).status).toBe(403);
    const connections = await fetch(base + "/oauth/connections", { headers });
    const connection = (await connections.json()).data[0];
    expect((await fetch(base + "/oauth/connections", { method: "DELETE", headers, body: JSON.stringify({ id: connection.id }) })).status).toBe(200);
    expect((await fetch(base + "/self", { headers: { Authorization: `Bearer ${pair.access_token}` } })).status).toBe(401);
    const expiredRefresh = await fetch(base + "/oauth/token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ grant_type: "refresh_token", client_id: app.id, refresh_token: pair.refresh_token }) });
    expect(expiredRefresh.status).toBe(400);
    expect((await expiredRefresh.json()).error).toBe("invalid_grant");
  });
});
