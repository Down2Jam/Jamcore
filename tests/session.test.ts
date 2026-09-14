import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../src/config/env.js", () => ({ env: { nodeEnv: "production", clientOrigin: "https://d2jam.com" } }));
const { resolveGame, resolveAccess } = vi.hoisted(() => ({ resolveGame: vi.fn(), resolveAccess: vi.fn() }));
vi.mock("../src/auth/gameToken.js", () => ({ resolveUserByGameAccessToken: resolveGame }));
vi.mock("../src/auth/tokenStore.js", () => ({ resolveAccessToken: resolveAccess, ACCESS_TOKEN_TTL_MS: 900000, SESSION_TTL_MS: 2592000000, createSessionTokens: vi.fn() }));
import { authenticateRequest, writeSession, assertSessionOrigin } from "../src/auth/session.js";
const req = (authorization?: string) => ({ headers: { authorization }, cookies: { refreshToken: "ignored" }, originalUrl: "/api/v1/self", method: "GET" }) as never;
const res = () => ({ locals: {} as Record<string, unknown>, cookie: vi.fn().mockReturnThis(), header: vi.fn().mockReturnThis() });
beforeEach(() => vi.resetAllMocks());
describe("opaque authentication", () => {
  it("authenticates with an access token alone", async () => {
    resolveAccess.mockResolvedValue({ user: { slug: "alice" }, sessionId: "s", appId: null });
    const response = res();
    expect(await authenticateRequest(req("Bearer token"), response as never)).toBe("alice");
    expect(response.locals.authSessionId).toBe("s");
    expect(response.cookie).not.toHaveBeenCalled();
  });
  it("never refreshes an invalid access token from a cookie", async () => {
    resolveAccess.mockResolvedValue(null);
    await expect(authenticateRequest(req("Bearer expired"), res() as never)).rejects.toMatchObject({ statusCode: 401 });
  });
  it("returns 401 for expired optional auth so clients can refresh", async () => {
    resolveAccess.mockResolvedValue(null);
    await expect(authenticateRequest(req("Bearer expired"), res() as never, true)).rejects.toMatchObject({ statusCode: 401 });
    expect(await authenticateRequest(req(), res() as never, true)).toBeNull();
  });
  it("preserves legacy game tokens", async () => {
    resolveGame.mockResolvedValue({ user: { slug: "alice" }, tokenId: "g", gameId: 7 });
    const response = res();
    response.locals.gameTokenAllowed = true;
    expect(await authenticateRequest(req("Bearer d2j_old"), response as never)).toBe("alice");
    expect(response.locals.gameAccessTokenGameId).toBe(7);
  });
  it.each([false, true])("rejects game tokens outside the allowlist (optional=%s)", async optional => {
    resolveGame.mockResolvedValue({ user: { slug: "alice" }, tokenId: "g", gameId: 7 });
    await expect(authenticateRequest(req("Bearer d2j_token"), res() as never, optional)).rejects.toMatchObject({ statusCode: 403 });
  });
  it("rejects revoked game tokens even on optional reads", async () => {
    resolveGame.mockResolvedValue(null);
    await expect(authenticateRequest(req("Bearer d2j_revoked"), res() as never, true)).rejects.toMatchObject({ statusCode: 401 });
  });
  it("enforces app scope during authentication", async () => {
    resolveAccess.mockResolvedValue({ user: { slug: "alice" }, sessionId: "s", appId: "a", scopes: ["games:read"] });
    await expect(authenticateRequest(req("Bearer app"), res() as never)).rejects.toMatchObject({ statusCode: 403 });
  });
  it("uses separate secure cookies and rejects foreign or missing cookie origins", () => {
    const response = res(); writeSession(response as never, "refresh", "access");
    expect(response.cookie).toHaveBeenCalledWith("refreshToken", "refresh", expect.objectContaining({ httpOnly: true, secure: true, sameSite: "strict" }));
    expect(response.cookie).toHaveBeenCalledWith("mediaAccessToken", "access", expect.objectContaining({ maxAge: 900000 }));
    for (const origin of [undefined, "null", "https://evil.example"]) expect(() => assertSessionOrigin({ get: () => origin } as never)).toThrow();
    expect(() => assertSessionOrigin({ get: () => "https://d2jam.com" } as never)).not.toThrow();
  });
});
