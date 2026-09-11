import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/config/env.js", () => ({
  env: {
    nodeEnv: "production",
    tokenSecret: "test-secret",
  },
}));

const { resolveUserByGameAccessTokenMock } = vi.hoisted(() => ({
  resolveUserByGameAccessTokenMock: vi.fn(),
}));

vi.mock("../src/auth/gameToken.js", () => ({
  resolveUserByGameAccessToken: resolveUserByGameAccessTokenMock,
}));

import {
  authenticateRequest,
  signAccessToken,
  signRefreshToken,
  verifySessionToken,
  writeSession,
} from "../src/auth/session.js";
import { UnauthorizedError } from "../src/lib/errors.js";

function makeReq(overrides: { authorization?: string; refreshToken?: string } = {}) {
  return {
    headers: { authorization: overrides.authorization },
    cookies: { refreshToken: overrides.refreshToken },
  } as never;
}

function makeRes() {
  return {
    locals: {} as Record<string, unknown>,
    cookie: vi.fn().mockReturnThis(),
    header: vi.fn().mockReturnThis(),
  };
}

describe("session tokens", () => {
  it("signs and verifies access tokens", () => {
    const token = signAccessToken("alice");
    expect(verifySessionToken(token)).toMatchObject({ user: "alice" });
  });

  it("signs and verifies refresh tokens", () => {
    const token = signRefreshToken("bob");
    expect(verifySessionToken(token)).toMatchObject({ user: "bob" });
  });

  it("marks refresh cookies secure in production", () => {
    const response = {
      cookie: vi.fn().mockReturnThis(),
      header: vi.fn().mockReturnThis(),
    };

    writeSession(response as never, "refresh-token", "access-token");

    expect(response.cookie).toHaveBeenCalledWith(
      "refreshToken",
      "refresh-token",
      expect.objectContaining({
        httpOnly: true,
        sameSite: "strict",
        secure: true,
      }),
    );
  });
});

describe("authenticateRequest", () => {
  beforeEach(() => vi.clearAllMocks());

  it("resolves a request bearing a valid game token, without needing a refresh cookie", async () => {
    resolveUserByGameAccessTokenMock.mockResolvedValue({
      user: { id: 1, slug: "ategon" },
      tokenId: "token-1",
    });
    const req = makeReq({ authorization: "Bearer d2j_abc123" });
    const res = makeRes();

    const userSlug = await authenticateRequest(req, res as never);

    expect(userSlug).toBe("ategon");
    expect(res.locals.authMethod).toBe("gameToken");
    expect(res.locals.gameAccessTokenId).toBe("token-1");
    expect(resolveUserByGameAccessTokenMock).toHaveBeenCalledWith("d2j_abc123");
  });

  it("rejects an invalid game token", async () => {
    resolveUserByGameAccessTokenMock.mockResolvedValue(null);
    const req = makeReq({ authorization: "Bearer d2j_bad" });
    const res = makeRes();

    await expect(authenticateRequest(req, res as never)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it("returns null for an invalid game token when auth is optional", async () => {
    resolveUserByGameAccessTokenMock.mockResolvedValue(null);
    const req = makeReq({ authorization: "Bearer d2j_bad" });
    const res = makeRes();

    const userSlug = await authenticateRequest(req, res as never, true);

    expect(userSlug).toBeNull();
  });

  it("falls through to session verification for a non-game-token bearer value", async () => {
    const access = signAccessToken("carol");
    const refresh = signRefreshToken("carol");
    const req = makeReq({ authorization: `Bearer ${access}`, refreshToken: refresh });
    const res = makeRes();

    const userSlug = await authenticateRequest(req, res as never);

    expect(userSlug).toBe("carol");
    expect(res.locals.authMethod).toBe("session");
    expect(resolveUserByGameAccessTokenMock).not.toHaveBeenCalled();
  });
});
