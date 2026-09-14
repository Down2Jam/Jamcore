import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
vi.mock("../src/auth/session.js", () => ({ authenticateRequest: vi.fn() }));
vi.mock("../src/auth/tokenStore.js", () => ({ resolveAccessToken: vi.fn() }));
import { authenticateRequest } from "../src/auth/session.js";
import { resolveAccessToken } from "../src/auth/tokenStore.js";
import authMediaUserOptional from "../src/middleware/authMediaUserOptional.js";
async function authenticate(cookies = {}, headers = {}) {
  const res = { locals: {} } as Response; const next = vi.fn();
  await authMediaUserOptional({ cookies, headers } as Request, res, next); return { res, next };
}
describe("media access cookies", () => {
  beforeEach(() => vi.resetAllMocks());
  it("accepts an unexpired website access cookie", async () => {
    vi.mocked(resolveAccessToken).mockResolvedValue({ user: { id: 1, slug: "composer" }, appId: null, sessionId: "s", scopes: [] });
    expect((await authenticate({ mediaAccessToken: "access" })).res.locals.userSlug).toBe("composer");
  });
  it("never authenticates with refresh cookies", async () => {
    expect((await authenticate({ refreshToken: "refresh" })).res.locals.userSlug).toBeUndefined();
    expect(resolveAccessToken).not.toHaveBeenCalled();
  });
  it("allows public playback when access is expired", async () => {
    vi.mocked(resolveAccessToken).mockResolvedValue(null);
    const { res, next } = await authenticate({ mediaAccessToken: "expired" });
    expect(res.locals.userSlug).toBeUndefined(); expect(next).toHaveBeenCalledWith();
  });
  it("uses explicit authorization when present", async () => {
    vi.mocked(authenticateRequest).mockResolvedValue("composer");
    expect((await authenticate({}, { authorization: "Bearer access" })).res.locals.userSlug).toBe("composer");
    expect(resolveAccessToken).not.toHaveBeenCalled();
  });
});
