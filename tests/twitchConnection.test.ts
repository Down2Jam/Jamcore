import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
const { tx } = vi.hoisted(() => ({ tx: { $executeRaw: vi.fn(), user: { findFirst: vi.fn(), update: vi.fn() } } }));
vi.mock("../src/infra/db.js", () => ({ default: { $transaction: (fn: (value: typeof tx) => unknown) => fn(tx), user: tx.user } }));
vi.mock("../src/config/env.js", () => ({ env: { tokenSecret: "test-secret", nodeEnv: "test", clientOrigin: "http://localhost:3000" } }));
import { beginTwitchConnection, verifyTwitchState, readTwitchUsername, linkTwitchUsername, disconnectTwitch } from "../src/features/users/twitch.connection.js";

describe("Twitch username linking", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("TWITCH_CLIENT_ID", "test-client"); vi.stubEnv("TWITCH_CLIENT_SECRET", "test-client-secret"); });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it("requests no scopes and uses the registered frontend callback", () => {
    const connection = beginTwitchConnection(12, "tenant");
    const url = new URL(connection.url);
    expect(url.origin).toBe("https://id.twitch.tv");
    expect(url.searchParams.get("scope")).toBe("");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:3000/settings/twitch-callback");
    expect(url.searchParams.has("client_secret")).toBe(false);
    expect(() => verifyTwitchState(url.searchParams.get("state")!, connection.nonce, 12, "tenant")).not.toThrow();
  });

  it("rejects missing, tampered, wrong-account and wrong-tenant state", () => {
    const { nonce, url } = beginTwitchConnection(12, "tenant");
    const state = new URL(url).searchParams.get("state")!;
    for (const [candidate, cookie, user, tenant] of [
      [state, undefined, 12, "tenant"], [state, "x".repeat(64), 12, "tenant"],
      [state + "x", nonce, 12, "tenant"], [state, nonce, 13, "tenant"], [state, nonce, 12, "other"],
    ] as const) expect(() => verifyTwitchState(candidate, cookie, user, tenant)).toThrow();
  });

  it("rejects expired state", () => {
    const state = jwt.sign({ nonce: "nonce", tenant: null }, "test-secret", { subject: "12", audience: "twitch-account-link", expiresIn: -1 });
    expect(() => verifyTwitchState(state, "nonce", 12)).toThrow();
  });

  it("returns only the verified username and revokes the temporary token", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "temporary", refresh_token: "discard" })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ client_id: "test-client", login: "channel_name", user_id: "123", scopes: [], expires_in: 3600 })))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await readTwitchUsername("code")).toBe("channel_name");
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://id.twitch.tv/oauth2/token", "https://id.twitch.tv/oauth2/validate", "https://id.twitch.tv/oauth2/revoke",
    ]);
    expect(fetchMock.mock.calls[2][1].body.get("token")).toBe("temporary");
  });

  it("accepts null scopes for a verified user without permissions", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "temporary" })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ client_id: "test-client", login: "channel_name", scopes: null, expires_in: 3600 })))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await readTwitchUsername("code")).toBe("channel_name");
    expect(fetchMock.mock.calls[2][0]).toBe("https://id.twitch.tv/oauth2/revoke");
  });

  it.each([
    { login: null, scopes: null },
    { login: "channel_name", scopes: "invalid" },
    { login: "channel_name" },
  ])("rejects invalid account information and still revokes the token", async (identity) => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "temporary" })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ client_id: "test-client", expires_in: 3600, ...identity })))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(readTwitchUsername("code")).rejects.toThrow("Twitch returned invalid account information");
    expect(fetchMock.mock.calls[2][0]).toBe("https://id.twitch.tv/oauth2/revoke");
  });

  it.each([{ scopes: ["user:read:email"], client_id: "test-client" }, { scopes: [], client_id: "other-client" }])("rejects unexpected token grants or clients", async (overrides) => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "temporary" })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ login: "channel_name", expires_in: 3600, ...overrides })))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(readTwitchUsername("code")).rejects.toThrow("unexpected permissions");
    expect(fetchMock.mock.calls[2][0]).toBe("https://id.twitch.tv/oauth2/revoke");
  });

  it("prevents claiming a channel already linked to another user", async () => {
    tx.user.findFirst.mockResolvedValue({ id: 99 });
    await expect(linkTwitchUsername(12, "channel_name")).rejects.toThrow("already connected");
    expect(tx.$executeRaw).toHaveBeenCalled();
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it("stores only the username", async () => {
    tx.user.findFirst.mockResolvedValue(null);
    await linkTwitchUsername(12, "channel_name");
    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: 12 }, data: { twitch: "channel_name" }, select: { twitch: true } });
  });

  it("disconnects only the signed-in user and disables automatic stream hiding", async () => {
    await disconnectTwitch(12);
    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: 12 }, data: { twitch: null, autoHideRatingsWhileStreaming: false }, select: { twitch: true } });
  });
});
