import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();

vi.stubGlobal("fetch", fetchMock);

import { ApiError, ConfigurationError } from "../src/lib/errors.js";
import {
  resolveMention,
  resolveMentionQuerySchema,
} from "../src/features/mentions";

describe("mentions service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("validates mention lookup query input", () => {
    expect(
      resolveMentionQuerySchema.parse({
        type: "user",
        slug: "ben",
        domain: "example.com",
      }),
    ).toEqual({
      type: "user",
      slug: "ben",
      domain: "example.com",
    });

    expect(() =>
      resolveMentionQuerySchema.parse({
        type: "weird",
        slug: "ben",
        domain: "example.com",
      }),
    ).toThrow();
  });

  it("resolves remote mention data", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: vi.fn(async () => ({ id: 1 })),
    });

    await expect(
      resolveMention({
        type: "game",
        slug: "alpha",
        domain: "example.com",
      }),
    ).resolves.toEqual({ id: 1 });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/api/v1/games/alpha",
    );
  });

  it("uses the current user lookup route", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: vi.fn(async () => ({ id: 1 })),
    });

    await resolveMention({
      type: "user",
      slug: "ben",
      domain: "example.com",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/api/v1/users/ben",
    );
  });

  it("surfaces upstream failures with stable API errors", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    await expect(
      resolveMention({
        type: "user",
        slug: "ben",
        domain: "example.com",
      }),
    ).rejects.toEqual(expect.any(ApiError));

    fetchMock.mockRejectedValueOnce(new Error("network down"));

    await expect(
      resolveMention({
        type: "user",
        slug: "ben",
        domain: "example.com",
      }),
    ).rejects.toBeInstanceOf(ConfigurationError);
  });
});
