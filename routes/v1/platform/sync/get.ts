import { Router } from "express";
import { z } from "zod";

import db from "../../../../infra/db.js";
import getUserOptional from "../../../../loaders/getUserOptional.js";
import { parseQuery } from "../../../../lib/request.js";
import authUserOptional from "../../../../middleware/authUserOptional.js";
import { authServiceOptional } from "../../../../middleware/authServiceOptional.js";
import { asyncHandler } from "../../../../middleware/asyncHandler.js";
import { requirePolicy } from "../../../../middleware/requirePolicy.js";
import { requirePermission } from "../../../../middleware/requirePermission.js";

const router = Router();

const syncQuerySchema = z.object({
  since: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(100),
});

router.get(
  "/",
  authServiceOptional,
  authUserOptional,
  getUserOptional,
  requirePolicy("events.consume"),
  requirePermission("events:read"),
  asyncHandler(async (req, res) => {
    const input = parseQuery(req, syncQuerySchema);
    const where = input.since
      ? {
          updatedAt: {
            gt: new Date(input.since),
          },
        }
      : {};

    const [games, posts, users] = await Promise.all([
      db.game.findMany({
        where,
        take: input.limit,
        orderBy: { updatedAt: "desc" },
        select: { id: true, slug: true, updatedAt: true, published: true },
      }),
      db.post.findMany({
        where,
        take: input.limit,
        orderBy: { updatedAt: "desc" },
        select: { id: true, slug: true, updatedAt: true, deletedAt: true, removedAt: true },
      }),
      db.user.findMany({
        where,
        take: input.limit,
        orderBy: { updatedAt: "desc" },
        select: { id: true, slug: true, updatedAt: true },
      }),
    ]);

    res.json({
      message: "Incremental sync fetched",
      checkpoint: new Date().toISOString(),
      tenantId: res.locals.tenantId,
      data: {
        games,
        posts,
        users,
      },
    });
  }),
);

export default router;
