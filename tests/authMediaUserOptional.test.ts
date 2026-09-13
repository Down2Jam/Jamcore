import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

vi.mock("../src/auth/session.js", () => ({
  authenticateRequest: vi.fn(),
  verifySessionToken: vi.fn(),
}));

import { authenticateRequest, verifySessionToken } from "../src/auth/session.js";
import authMediaUserOptional from "../src/middleware/authMediaUserOptional.js";

async function authenticate(cookies = {}, headers = {}) {
  const req = { cookies, headers } as Request;
  const res = { locals: {} } as Response;
  const next = vi.fn();
  await authMediaUserOptional(req, res, next);
  return { res, next };
}

describe("native media authentication", () => {
  beforeEach(() => vi.resetAllMocks());

  it("authenticates a native audio request using its verified session cookie", async () => {
    vi.mocked(verifySessionToken).mockReturnValue({ user: "composer" });
    const { res, next } = await authenticate({ refreshToken: "signed-session" });
    expect(verifySessionToken).toHaveBeenCalledWith("signed-session");
    expect(res.locals.userSlug).toBe("composer");
    expect(next).toHaveBeenCalledWith();
  });

  it("allows anonymous public requests", async () => {
    const { res, next } = await authenticate();
    expect(res.locals.userSlug).toBeUndefined();
    expect(verifySessionToken).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith();
  });

  it("does not authenticate an invalid session cookie", async () => {
    vi.mocked(verifySessionToken).mockImplementation(() => { throw new Error("Invalid signature"); });
    const { res, next } = await authenticate({ refreshToken: "invalid" });
    expect(res.locals.userSlug).toBeUndefined();
    expect(next).toHaveBeenCalledWith();
  });

  it("preserves authentication for requests with explicit authorization", async () => {
    vi.mocked(authenticateRequest).mockResolvedValue("composer");
    const { res, next } = await authenticate({}, { authorization: "Bearer access" });
    expect(res.locals.userSlug).toBe("composer");
    expect(verifySessionToken).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith();
  });
});
