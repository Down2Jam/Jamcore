import { describe, expect, it } from "vitest";

import { evaluatePolicy } from "../src/lib/policyEngine.js";

describe("policy engine", () => {
  it("allows admins to manage platform writes", () => {
    expect(
      evaluatePolicy({
        policy: "platform.write",
        user: { admin: true },
      }),
    ).toBe(true);
  });

  it("allows services with event scope to consume events", () => {
    expect(
      evaluatePolicy({
        policy: "events.consume",
        service: {
          name: "consumer",
          scopes: ["events:read"],
        },
      }),
    ).toBe(true);
  });

  it("denies platform writes for mods without admin rights", () => {
    expect(
      evaluatePolicy({
        policy: "platform.write",
        user: { mod: true },
      }),
    ).toBe(false);
  });
});
