import { randomUUID } from "node:crypto";
import { z } from "zod";

import { filterCoreEntityIdsByTenant } from "../../infra/coreTenantStore.js";
import db from "../../infra/db.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../lib/errors.js";

type ReportActor = {
  id: number;
  slug: string;
  mod?: boolean | null;
  admin?: boolean | null;
};

export const createReportSchema = z
  .object({
    targetType: z.enum(["user", "post", "comment", "game", "collection_comment"]),
    targetId: z.union([z.coerce.number().int().positive(), z.string().trim().min(1)]),
    reason: z.string().trim().min(1).max(200).optional(),
    details: z.string().trim().max(2000).optional(),
    priority: z.enum(["low", "normal", "high", "urgent"]).optional().default("normal"),
  });

export const listReportsQuerySchema = z.object({
  status: z.enum(["open", "triaged", "resolved", "dismissed", "all"]).optional().default("open"),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  cursor: z.string().datetime().optional(),
});

export const reportParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const updateReportSchema = z.object({
  status: z.enum(["open", "triaged", "resolved", "dismissed"]).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  assignedToId: z.coerce.number().int().positive().nullable().optional(),
  resolution: z.string().trim().max(2000).nullable().optional(),
});

export const reportNoteSchema = z.object({
  note: z.string().trim().min(1).max(2000),
});

function numericTargetId(targetId: number | string) {
  const value = typeof targetId === "number" ? targetId : Number.parseInt(targetId, 10);
  if (!Number.isInteger(value) || value <= 0) throw new BadRequestError("Invalid report target");
  return value;
}

async function assertTargetBelongsToTenant(targetType: string, targetId: number | string, tenantId?: string | null) {
  if (targetType === "comment") return;
  if (targetType === "collection_comment") {
    const rows = (await db.$queryRawUnsafe(
      `
        SELECT id
        FROM "CollectionComment"
        WHERE id = $1::text AND deleted_at IS NULL
        LIMIT 1
      `,
      String(targetId),
    ).catch(() => [])) as Array<{ id: string }>;
    if (rows.length === 0) throw new NotFoundError("Report target not found");
    return;
  }
  const entityType =
    targetType === "user"
      ? "User"
      : targetType === "post"
        ? "Post"
        : targetType === "game"
          ? "Game"
          : null;
  if (!entityType) throw new BadRequestError("Unsupported report target");
  const allowed = await filterCoreEntityIdsByTenant({
    entityType,
    ids: [numericTargetId(targetId)],
    tenantId,
  });
  if (!allowed.includes(numericTargetId(targetId))) throw new NotFoundError("Report target not found");
}

function reportTargetData(targetType: string, targetId: number | string) {
  const numericId = targetType === "collection_comment" ? null : numericTargetId(targetId);
  return {
    userId: targetType === "user" ? numericId : null,
    postId: targetType === "post" ? numericId : null,
    commentId: targetType === "comment" ? numericId : null,
    gameId: targetType === "game" ? numericId : null,
    collectionCommentId: targetType === "collection_comment" ? String(targetId) : null,
  };
}

export async function createReport({
  actor,
  input,
  tenantId,
}: {
  actor: ReportActor;
  input: z.infer<typeof createReportSchema>;
  tenantId?: string | null;
}) {
  await assertTargetBelongsToTenant(input.targetType, input.targetId, tenantId);
  const target = reportTargetData(input.targetType, input.targetId);
  const rows = (await db.$queryRawUnsafe(
    `
      INSERT INTO "Report"
        ("reporterId", "userId", "postId", "commentId", "gameId", collection_comment_id, reason, details, priority)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id
    `,
    actor.id,
    target.userId,
    target.postId,
    target.commentId,
    target.gameId,
    target.collectionCommentId,
    input.reason ?? null,
    input.details ?? null,
    input.priority,
  )) as Array<{ id: number }>;
  return db.report.findUnique({ where: { id: rows[0].id } });
}

export async function listReports({
  input,
}: {
  input: z.infer<typeof listReportsQuerySchema>;
}) {
  return db.$queryRawUnsafe(
    `
      SELECT
        r.*,
        reporter.slug AS "reporterSlug",
        reporter.name AS "reporterName",
        target_user.slug AS "targetUserSlug",
        target_user.name AS "targetUserName",
        p.slug AS "postSlug",
        p.title AS "postTitle",
        g.slug AS "gameSlug"
      FROM "Report" r
      JOIN "User" reporter ON reporter.id = r."reporterId"
      LEFT JOIN "User" target_user ON target_user.id = r."userId"
      LEFT JOIN "Post" p ON p.id = r."postId"
      LEFT JOIN "Game" g ON g.id = r."gameId"
      WHERE ($1::text = 'all' OR r.status = $1)
        AND ($3::timestamptz IS NULL OR r."createdAt" < $3::timestamptz)
      ORDER BY
        CASE r.priority
          WHEN 'urgent' THEN 4
          WHEN 'high' THEN 3
          WHEN 'normal' THEN 2
          ELSE 1
        END DESC,
        r."createdAt" DESC
      LIMIT $2
    `,
    input.status,
    input.limit,
    input.cursor ?? null,
  );
}

export async function updateReport({
  reportId,
  actor,
  input,
}: {
  reportId: number;
  actor: ReportActor;
  input: z.infer<typeof updateReportSchema>;
}) {
  if (!actor.mod && !actor.admin) throw new ForbiddenError("Not allowed");
  const existing = await db.report.findUnique({ where: { id: reportId } });
  if (!existing) throw new NotFoundError("Report not found");
  const resolved = input.status === "resolved" || input.status === "dismissed";
  await db.$executeRawUnsafe(
    `
      UPDATE "Report"
      SET
        status = COALESCE($2, status),
        priority = COALESCE($3, priority),
        assigned_to_id = CASE WHEN $4::boolean THEN $5::int ELSE assigned_to_id END,
        resolution = CASE WHEN $6::boolean THEN $7 ELSE resolution END,
        resolved = CASE WHEN $8::boolean THEN TRUE ELSE resolved END,
        resolved_at = CASE WHEN $8::boolean THEN NOW() ELSE resolved_at END
      WHERE id = $1
    `,
    reportId,
    input.status ?? null,
    input.priority ?? null,
    input.assignedToId !== undefined,
    input.assignedToId ?? null,
    input.resolution !== undefined,
    input.resolution ?? null,
    resolved,
  );
  return db.report.findUnique({ where: { id: reportId } });
}

export async function addReportNote({
  reportId,
  actor,
  input,
}: {
  reportId: number;
  actor: ReportActor;
  input: z.infer<typeof reportNoteSchema>;
}) {
  if (!actor.mod && !actor.admin) throw new ForbiddenError("Not allowed");
  const report = await db.report.findUnique({ where: { id: reportId }, select: { id: true } });
  if (!report) throw new NotFoundError("Report not found");
  await db.reportNote.create({
    data: {
      id: randomUUID(),
      reportId,
      authorId: actor.id,
      note: input.note,
    },
  });
  return listReportNotes(reportId);
}

export async function listReportNotes(reportId: number) {
  const notes = await db.reportNote.findMany({
    where: { reportId },
    orderBy: { createdAt: "desc" },
  });
  const authors = await db.user.findMany({
    where: { id: { in: [...new Set(notes.map((note) => note.authorId))] } },
    select: { id: true, slug: true, name: true },
  });
  const authorsById = new Map(authors.map((author) => [author.id, author]));
  return notes.map((note) => {
    const author = authorsById.get(note.authorId);
    return {
      id: note.id,
      reportId: note.reportId,
      authorId: note.authorId,
      authorSlug: author?.slug ?? null,
      authorName: author?.name ?? null,
      note: note.note,
      createdAt: note.createdAt,
    };
  });
}
