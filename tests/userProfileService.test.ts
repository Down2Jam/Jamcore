import { describe, expect, it, vi } from "vitest";

vi.mock("../config/env.js", () => ({
  env: {
    nodeEnv: "development",
  },
}));

vi.mock("../infra/db.js", () => ({
  default: {},
}));

vi.mock("../features/games/page.helpers.js", () => ({
  materializeGamePage: (value: unknown) => value,
}));

vi.mock("../features/tracks/page.js", () => ({
  materializeTrackPage: (value: unknown) => value,
}));

vi.mock("../features/mentions/notifications.service.js", () => ({
  notifyNewMentions: vi.fn(),
}));

import {
  isAllowedAssetUrl,
  updateUserProfileSchema,
} from "../features/users/index.js";

describe("user profile service", () => {
  it("accepts local asset urls in development", () => {
    expect(
      isAllowedAssetUrl("http://localhost:3000/api/v1/pfp/avatar.png"),
    ).toBe(true);
    expect(isAllowedAssetUrl("/images/banner.png")).toBe(true);
    expect(isAllowedAssetUrl("https://example.com/avatar.png")).toBe(false);
  });

  it("rejects mismatched links and labels", () => {
    const result = updateUserProfileSchema.safeParse({
      name: "Alice",
      links: ["https://example.com"],
      linkLabels: ["one", "two"],
    });

    expect(result.success).toBe(false);
  });

  it("accepts a minimal profile update payload", () => {
    const result = updateUserProfileSchema.safeParse({
      name: "Alice",
    });

    expect(result.success).toBe(true);
  });
});

