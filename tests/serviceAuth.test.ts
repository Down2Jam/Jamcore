import { describe, expect, it, vi } from "vitest";

vi.mock("../config/env.js", () => ({
  env: {
    serviceApiKeys: JSON.stringify([
      {
        name: "supporting-app",
        key: "secret-key",
        scopes: ["events:read", "webhooks:read"],
      },
    ]),
  },
}));

import {
  assertServiceScope,
  authenticateServiceRequest,
} from "../auth/service.js";
import { UnauthorizedError } from "../lib/errors.js";

describe("service auth", () => {
  it("authenticates configured service keys", async () => {
    const request = {
      header(name: string) {
        return name.toLowerCase() === "x-api-key" ? "secret-key" : undefined;
      },
    } as any;

    const service = await authenticateServiceRequest(request);

    expect(service).toEqual({
      name: "supporting-app",
      scopes: ["events:read", "webhooks:read"],
      source: "env",
    });
  });

  it("rejects missing scopes", () => {
    expect(() =>
      assertServiceScope(
        {
          name: "supporting-app",
          scopes: ["events:read"],
        },
        "webhooks:read",
      ),
    ).toThrow(UnauthorizedError);
  });
});
