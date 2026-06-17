import { beforeEach, describe, expect, it, vi } from "vitest";

const incrementRateLimit = vi.fn(async () => ({ count: 1, resetMs: 60_000 }));

vi.mock("../src/infra/rateLimitStore.js", () => ({
  incrementRateLimit,
}));

const { default: rateLimit } = await import("../src/middleware/rateLimit.js");

function createRequest(method: string, baseUrl: string, routePath: string) {
  return {
    method,
    baseUrl,
    route: { path: routePath },
    path: routePath,
    ip: "127.0.0.1",
    socket: {},
  } as any;
}

function createResponse() {
  return {
    locals: { requestId: "request-1" },
    setHeader: vi.fn(),
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  } as any;
}

describe("rateLimit middleware", () => {
  beforeEach(() => {
    incrementRateLimit.mockClear();
  });

  it("keys limits by mounted route instead of every slash route sharing a bucket", async () => {
    const middleware = rateLimit();
    const next = vi.fn();

    await middleware(createRequest("GET", "/api/v1/self", "/"), createResponse(), next);
    await middleware(createRequest("GET", "/api/v1/emojis", "/"), createResponse(), next);

    expect(incrementRateLimit).toHaveBeenNthCalledWith(
      1,
      "ratelimit:GET:/api/v1/self:127.0.0.1",
      60_000,
    );
    expect(incrementRateLimit).toHaveBeenNthCalledWith(
      2,
      "ratelimit:GET:/api/v1/emojis:127.0.0.1",
      60_000,
    );
    expect(next).toHaveBeenCalledTimes(2);
  });

  it("does not count CORS preflight requests", async () => {
    const middleware = rateLimit();
    const next = vi.fn();

    await middleware(createRequest("OPTIONS", "/api/v1/self", "/"), createResponse(), next);

    expect(incrementRateLimit).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
  });
});
