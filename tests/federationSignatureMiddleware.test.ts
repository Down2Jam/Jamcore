import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";

import { appConfig } from "../src/config/app.js";
import { verifyFederationSignature } from "../src/features/federation/transport/middleware.js";

describe("federation signature middleware", () => {
  it("skips signature checks when federation security is disabled", async () => {
    expect(appConfig.federation.security.enabled).toBe(false);

    const next = vi.fn() as NextFunction;
    const req = {
      get: () => undefined,
      method: "POST",
      originalUrl: "/ap/actors/jam/inbox",
      rawBody: "{}",
    } as unknown as Request;

    await verifyFederationSignature(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith();
  });
});
