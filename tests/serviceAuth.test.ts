import { describe, expect, it, vi } from "vitest";

vi.mock("../src/config/env.js", () => ({
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
} from "../src/auth/service.js";
import { UnauthorizedError } from "../src/lib/errors.js";

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
