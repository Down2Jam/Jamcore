import { z } from "zod";

import { filterCoreEntityIdsByTenant } from "../../infra/coreTenantStore.js";
import db from "../../infra/db.js";
import { NotFoundError } from "../../lib/errors.js";

export const gameDevlogQuerySchema = z.object({
  relationType: z.enum(["devlog", "release", "postmortem", "announcement", "other"]).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  cursor: z.string().datetime().optional(),
});

export async function listGameDevlogPosts({
  gameSlug,
  input,
  tenantId,
}: {
  gameSlug: string;
  input: z.infer<typeof gameDevlogQuerySchema>;
  tenantId?: string | null;
}) {
  const game = await db.game.findUnique({
    where: { slug: gameSlug },
    select: { id: true, slug: true, published: true },
  });
  if (!game?.published) throw new NotFoundError("Game not found");
  const allowed = await filterCoreEntityIdsByTenant({
    entityType: "Game",
    ids: [game.id],
    tenantId,
  });
  if (!allowed.includes(game.id)) throw new NotFoundError("Game not found");

  return db.$queryRawUnsafe(
    `
      SELECT
        p.id,
        p.slug,
        p.title,
        p.content,
        p."createdAt",
        p."updatedAt",
        pg.relation_type AS "relationType",
        u.slug AS "authorSlug",
        u.name AS "authorName"
      FROM "PostGameLink" pg
      JOIN "Post" p ON p.id = pg.post_id
      JOIN "User" u ON u.id = p."authorId"
      WHERE pg.game_id = $1
        AND ($2::text IS NULL OR pg.relation_type = $2)
        AND p."deletedAt" IS NULL
        AND p."removedAt" IS NULL
        AND ($4::timestamptz IS NULL OR p."createdAt" < $4::timestamptz)
        AND (
          p.draft_status = 'published'
          OR (p.draft_status = 'scheduled' AND p.scheduled_publish_at <= NOW())
        )
      ORDER BY p."createdAt" DESC
      LIMIT $3
    `,
    game.id,
    input.relationType ?? null,
    input.limit ?? 20,
    input.cursor ?? null,
  );
}
