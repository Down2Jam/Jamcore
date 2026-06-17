import { describe, expect, it } from "vitest";

import { hasPermission } from "../src/lib/permissions.js";

describe("secret export permissions", () => {
  it("does not let moderators or platform readers export secrets", () => {
    expect(
      hasPermission({
        permission: "exports:secrets:read",
        user: { mod: true },
      }),
    ).toBe(false);
    expect(
      hasPermission({
        grants: [{ role: "platform.reader" }],
        permission: "exports:secrets:read",
      }),
    ).toBe(false);
  });

  it("allows admins, platform admins, and explicit service scopes", () => {
    expect(
      hasPermission({
        permission: "exports:secrets:read",
        user: { admin: true },
      }),
    ).toBe(true);
    expect(
      hasPermission({
        grants: [{ role: "platform.admin" }],
        permission: "exports:secrets:read",
      }),
    ).toBe(true);
    expect(
      hasPermission({
        permission: "exports:secrets:read",
        service: { name: "exporter", scopes: ["exports:secrets:read"] },
      }),
    ).toBe(true);
  });
});
