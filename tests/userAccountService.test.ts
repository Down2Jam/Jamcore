import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  dbMock,
  envMock,
  hashPasswordMock,
  signAccessTokenMock,
  signRefreshTokenMock,
  writeSessionMock,
  loggerInfoMock,
} = vi.hoisted(() => ({
  dbMock: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
  },
  envMock: {
    clientOrigin: "http://localhost:3000",
    tokenSecret: "test-secret" as string | undefined,
  },
  hashPasswordMock: vi.fn(),
  signAccessTokenMock: vi.fn(),
  signRefreshTokenMock: vi.fn(),
  writeSessionMock: vi.fn(),
  loggerInfoMock: vi.fn(),
}));

vi.mock("fs", () => ({
  default: {
    existsSync: vi.fn(() => false),
    readdirSync: vi.fn(() => []),
  },
}));

vi.mock("../src/infra/db.js", () => ({
  default: dbMock,
}));

vi.mock("../src/infra/password.js", () => ({
  hashPassword: hashPasswordMock,
}));

vi.mock("../src/auth/session.js", () => ({
  signAccessToken: signAccessTokenMock,
  signRefreshToken: signRefreshTokenMock,
  writeSession: writeSessionMock,
}));

vi.mock("../src/infra/logger.js", () => ({
  default: {
    info: loggerInfoMock,
  },
}));

vi.mock("../src/config/env.js", () => ({
  env: envMock,
}));

import {
  ConfigurationError,
  ConflictError,
} from "../src/lib/errors.js";
import {
  buildUserSlug,
  createUserAccount,
  createUserAccountSchema,
  deleteUserAccount,
} from "../src/features/users/account.service.js";

describe("user account service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envMock.tokenSecret = "test-secret";
  });

  it("creates a user account and writes a session", async () => {
    dbMock.user.findUnique.mockResolvedValue(null);
    hashPasswordMock.mockResolvedValue("hashed-password");
    dbMock.user.create.mockResolvedValue({
      id: 7,
      slug: "test_user",
      name: "Test User",
    });
    signAccessTokenMock.mockReturnValue("access-token");
    signRefreshTokenMock.mockReturnValue("refresh-token");

    const result = await createUserAccount({
      username: "Test User",
      password: "password123",
      email: "test@example.com",
      res: {} as never,
    });

    expect(dbMock.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        slug: "test_user",
        name: "Test User",
        password: "hashed-password",
        email: "test@example.com",
        profilePicture: null,
      }),
    });
    expect(writeSessionMock).toHaveBeenCalledWith(
      {},
      "refresh-token",
      "access-token",
    );
    expect(result).toEqual({
      user: {
        id: 7,
        slug: "test_user",
        name: "Test User",
      },
      token: "access-token",
    });
  });

  it("rejects duplicate usernames", async () => {
    dbMock.user.findUnique.mockResolvedValue({ id: 1 });

    await expect(
      createUserAccount({
        username: "Taken",
        password: "password123",
        res: {} as never,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("rejects account creation when token secret is missing", async () => {
    envMock.tokenSecret = undefined;

    await expect(
      createUserAccount({
        username: "No Secret",
        password: "password123",
        res: {} as never,
      }),
    ).rejects.toBeInstanceOf(ConfigurationError);
  });

  it("deletes a user account", async () => {
    await deleteUserAccount({ userId: 8 });

    expect(dbMock.user.delete).toHaveBeenCalledWith({
      where: { id: 8 },
    });
  });

  it("validates the create user payload", () => {
    expect(
      createUserAccountSchema.safeParse({
        username: "Alice",
        password: "password123",
      }).success,
    ).toBe(true);
  });

  it("treats a blank signup email as no email", () => {
    const result = createUserAccountSchema.safeParse({
      username: "Alice",
      password: "password123",
      email: "",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBeNull();
    }
  });

  it("normalizes usernames to the login slug format", () => {
    expect(buildUserSlug("Test User")).toBe("test_user");
  });
});

