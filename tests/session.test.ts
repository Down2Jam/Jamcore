import { describe, expect, it, vi } from "vitest";

vi.mock("../config/env.js", () => ({
  env: {
    nodeEnv: "production",
    tokenSecret: "test-secret",
  },
}));

import {
  signAccessToken,
  signRefreshToken,
  verifySessionToken,
  writeSession,
} from "../auth/session.js";

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
