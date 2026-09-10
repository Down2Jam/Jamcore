import { beforeEach, describe, expect, it, vi } from "vitest";

const { groupByMock, listSiteThemesMock, updateMock } = vi.hoisted(() => ({
  groupByMock: vi.fn(),
  listSiteThemesMock: vi.fn(),
  updateMock: vi.fn(),
}));

vi.mock("../src/infra/db.js", () => ({
  default: {
    user: {
      groupBy: groupByMock,
      update: updateMock,
    },
  },
}));

vi.mock("../src/features/site-themes/service.js", () => ({
  listSiteThemes: listSiteThemesMock,
}));

import {
  listSiteThemesWithUsage,
  setUserSiteTheme,
} from "../src/features/site-themes/usage.service.js";

describe("site theme usage service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listSiteThemesMock.mockResolvedValue([
      { name: "Obsidian", type: "Dark", colors: {} },
      { name: "Dracula", type: "Dark", colors: {} },
      { name: "Nord", type: "Dark", colors: {} },
    ]);
  });

  it("adds current account usage counts to themes", async () => {
    groupByMock.mockResolvedValue([
      { siteTheme: "Dracula", _count: { _all: 12 } },
      { siteTheme: "Nord", _count: { _all: 4 } },
    ]);

    await expect(listSiteThemesWithUsage(null)).resolves.toEqual([
      { name: "Obsidian", type: "Dark", colors: {}, usageCount: 0 },
      { name: "Dracula", type: "Dark", colors: {}, usageCount: 12 },
      { name: "Nord", type: "Dark", colors: {}, usageCount: 4 },
    ]);
  });

  it("stores the canonical theme name on the account", async () => {
    updateMock.mockResolvedValue({});

    await expect(setUserSiteTheme(42, "dracula")).resolves.toEqual({
      siteTheme: "Dracula",
    });
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: 42 },
      data: { siteTheme: "Dracula" },
    });
  });
});
