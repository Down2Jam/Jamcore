import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock } = vi.hoisted(() => ({ dbMock: {
  report: { create: vi.fn(), findUnique: vi.fn() },
  $queryRawUnsafe: vi.fn(),
  $executeRawUnsafe: vi.fn(),
} }));
vi.mock("../src/infra/db.js", () => ({ default: dbMock }));
vi.mock("../src/infra/coreTenantStore.js", () => ({ filterCoreEntityIdsByTenant: vi.fn() }));
import { createReport, createReportSchema, listReports, listReportsQuerySchema, updateReport } from "../src/features/reports/service.js";
import { ForbiddenError } from "../src/lib/errors.js";

const actor = { id: 12, slug: "reporter" };
const bug = { targetType: "bug", reason: "Reply button is broken", details: "Open a comment and click Reply. Nothing happens." };

describe("bug reports", () => {
  beforeEach(() => vi.clearAllMocks());

  it("accepts a bug without asking users for a content ID", async () => {
    dbMock.report.create.mockResolvedValue({ id: 42, kind: "bug" });
    const result = await createReport({ actor, input: createReportSchema.parse(bug) });
    expect(result.id).toBe(42);
    expect(dbMock.report.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      reporterId: 12, kind: "bug", reason: bug.reason, details: bug.details,
      priority: "normal", userId: null, postId: null, commentId: null, gameId: null,
    }) });
  });

  it("rejects empty or oversized bug reports and user-supplied urgency", () => {
    for (const override of [{ reason: " " }, { details: "short" }, { details: "a".repeat(2001) }, { priority: "urgent" }]) {
      expect(createReportSchema.safeParse({ ...bug, ...override }).success).toBe(false);
    }
  });

  it("continues requiring a target for moderation reports", () => {
    expect(createReportSchema.safeParse({ targetType: "post", reason: "Spam" }).success).toBe(false);
    expect(createReportSchema.safeParse({ targetType: "post", targetId: 2, reason: "Spam" }).success).toBe(true);
  });

  it("filters the bug queue explicitly and paginates by ID", async () => {
    await listReports({ input: listReportsQuerySchema.parse({ kind: "bug", status: "all", beforeId: 50, limit: 25 }) });
    expect(dbMock.$queryRawUnsafe).toHaveBeenCalledWith(expect.stringContaining("r.kind = $4"), "all", 25, null, "bug", 50);
    expect(dbMock.$queryRawUnsafe.mock.calls[0][0]).toContain("r.id < $5");
  });

  it("rejects report updates by ordinary users", async () => {
    await expect(updateReport({ reportId: 42, actor, input: { status: "resolved" } })).rejects.toBeInstanceOf(ForbiddenError);
    expect(dbMock.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it("clears resolution flags when staff reopen a report", async () => {
    dbMock.report.findUnique.mockResolvedValue({ id: 42, status: "resolved" });
    await updateReport({ reportId: 42, actor: { ...actor, admin: true }, input: { status: "open" } });
    expect(dbMock.$executeRawUnsafe).toHaveBeenCalledWith(expect.stringContaining("WHEN $8::boolean THEN NOW() ELSE NULL END"), 42, "open", null, false, null, false, null, false);
  });
});
