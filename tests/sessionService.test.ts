import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock, passwordMock, sessionMock } = vi.hoisted(() => ({
  dbMock: {
    user: {
      findUnique: vi.fn(),
    },
  },
  passwordMock: {
    checkPasswordHash: vi.fn(),
  },
  sessionMock: {
    signAccessToken: vi.fn(),
    signRefreshToken: vi.fn(),
    writeSession: vi.fn(),
  },
}));

vi.mock("../src/infra/db.js", () => ({
  default: dbMock,
}));

vi.mock("../src/infra/password.js", () => ({
  checkPasswordHash: passwordMock.checkPasswordHash,
}));

vi.mock("../src/auth/session.js", () => ({
  signAccessToken: sessionMock.signAccessToken,
  signRefreshToken: sessionMock.signRefreshToken,
  writeSession: sessionMock.writeSession,
}));

import { UnauthorizedError } from "../src/lib/errors.js";
import { createSession } from "../src/features/session";

describe("session service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a session for valid credentials", async () => {
    dbMock.user.findUnique.mockResolvedValueOnce({
      id: 1,
      slug: "ben",
      password: "hash",
    });
    passwordMock.checkPasswordHash.mockResolvedValueOnce(true);
    sessionMock.signAccessToken.mockReturnValueOnce("access-token");
    sessionMock.signRefreshToken.mockReturnValueOnce("refresh-token");

    const res = {} as never;
    const result = await createSession({
      username: "Ben",
      password: "secret",
      res,
    });

    expect(dbMock.user.findUnique).toHaveBeenCalledWith({
      where: {
        slug: "ben",
      },
      select: {
        id: true,
        slug: true,
        password: true,
      },
    });
    expect(sessionMock.writeSession).toHaveBeenCalledWith(
      res,
      "refresh-token",
      "access-token",
    );
    expect(result).toEqual({
      user: { id: 1, slug: "ben", password: "hash" },
      token: "access-token",
    });
  });

  it("rejects invalid credentials", async () => {
    dbMock.user.findUnique.mockResolvedValueOnce(null);

    await expect(
      createSession({
        username: "ben",
        password: "secret",
        res: {} as never,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

