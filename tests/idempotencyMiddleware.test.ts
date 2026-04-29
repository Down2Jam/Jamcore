import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = {
  claimResult: { state: "claimed" } as
    | { state: "claimed" }
    | {
        state: "hash_mismatch" | "in_progress" | "replay";
        record: {
          key: string;
          requestHash: string;
          status: "in_progress" | "completed";
          responseBody?: unknown;
          responseKind?: "json" | "text" | "empty";
          responseStatus?: number;
          createdAt: string;
          updatedAt: string;
          expiresAt: string;
        };
      },
  completed: [] as Array<Record<string, unknown>>,
  deleted: [] as string[],
};

vi.mock("../infra/idempotencyStore.js", () => ({
  claimIdempotencyRecord: vi.fn(async () => state.claimResult),
  completeIdempotencyRecord: vi.fn(async (input) => {
    state.completed.push(input as Record<string, unknown>);
  }),
  deleteIdempotencyRecord: vi.fn(async (key) => {
    state.deleted.push(key as string);
  }),
}));

describe("idempotency middleware", () => {
  afterEach(() => {
    state.claimResult = { state: "claimed" };
    state.completed = [];
    state.deleted = [];
  });

  it("replays a completed response without running the handler", async () => {
    state.claimResult = {
      state: "replay",
      record: {
        key: "abc",
        requestHash: "hash",
        status: "completed",
        responseBody: { ok: true },
        responseKind: "json",
        responseStatus: 201,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
    };

    const { idempotencyMiddleware } = await import("../middleware/idempotency.js");
    const app = express();
    app.use(express.json());
    app.post("/test", idempotencyMiddleware, (_req, res) => {
      res.status(201).json({ shouldNotRun: true });
    });

    const server = await new Promise<import("node:http").Server>((resolve) => {
      const started = app.listen(0, () => resolve(started));
    });
    const address = server.address();
    const port =
      typeof address === "object" && address ? address.port : 0;

    const response = await fetch(`http://127.0.0.1:${port}/test`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "abc",
      },
      body: JSON.stringify({ hello: "world" }),
    });

    const payload = await response.json();

    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });

    expect(response.status).toBe(201);
    expect(response.headers.get("x-idempotent-replay")).toBe("true");
    expect(payload).toEqual({ ok: true });
    expect(state.completed).toHaveLength(0);
  });

  it("stores a successful first response on completion", async () => {
    const { idempotencyMiddleware } = await import("../middleware/idempotency.js");
    const app = express();
    app.use(express.json());
    app.post("/test", idempotencyMiddleware, (_req, res) => {
      res.status(202).json({ accepted: true });
    });

    const server = await new Promise<import("node:http").Server>((resolve) => {
      const started = app.listen(0, () => resolve(started));
    });
    const address = server.address();
    const port =
      typeof address === "object" && address ? address.port : 0;

    const response = await fetch(`http://127.0.0.1:${port}/test`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "first",
      },
      body: JSON.stringify({ hello: "world" }),
    });

    await response.json();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });

    expect(state.completed).toHaveLength(1);
    expect(state.completed[0]).toMatchObject({
      key: "first",
      responseStatus: 202,
      responseKind: "json",
      responseBody: { accepted: true },
    });
    expect(state.deleted).toHaveLength(0);
  });
});
