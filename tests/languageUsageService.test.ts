import { beforeEach, describe, expect, it, vi } from "vitest";

const { groupBy, update } = vi.hoisted(() => ({ groupBy: vi.fn(), update: vi.fn() }));
vi.mock("../src/infra/db.js", () => ({ default: { user: { groupBy, update } } }));
import { listLanguageUsage, setUserLanguage } from "../src/features/languages/service.js";

describe("language usage", () => {
  beforeEach(() => vi.clearAllMocks());
  it("counts current account preferences within the requested tenant", async () => {
    groupBy.mockResolvedValue([{ locale: "it", _count: { _all: 12 } }]);
    const languages = await listLanguageUsage("tenant-one");
    expect(groupBy).toHaveBeenCalledWith({
      by: ["locale"], where: { tenantId: "tenant-one", locale: { not: null } }, _count: { _all: true },
    });
    expect(languages).toContainEqual({ key: "it", usageCount: 12 });
    expect(languages).toContainEqual({ key: "en", usageCount: 0 });
  });
  it("replaces the user's preference instead of incrementing a click counter", async () => {
    update.mockResolvedValue({});
    await expect(setUserLanguage(42, "PT-BR")).resolves.toEqual({ locale: "pt-br" });
    expect(update).toHaveBeenCalledWith({ where: { id: 42 }, data: { locale: "pt-br" } });
  });
  it("rejects unsupported languages without writing to the account", async () => {
    await expect(setUserLanguage(42, "invalid")).rejects.toThrow("Unknown language");
    expect(update).not.toHaveBeenCalled();
  });
});
