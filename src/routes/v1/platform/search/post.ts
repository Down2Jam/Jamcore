import { Router } from "express";
import { z } from "zod";

import {
  createSearchSynonym,
  createSearchSynonymGroup,
  createSearchSynonymGroupSchema,
  createSearchSynonymSchema,
  enqueueSearchReindex,
  searchReindexSchema,
} from "../../../../features/search/admin.service.js";
import { clearSearchCache } from "../../../../features/search/service.js";
import getUserOptional from "../../../../loaders/getUserOptional.js";
import { parseBody } from "../../../../lib/request.js";
import authUserOptional from "../../../../middleware/authUserOptional.js";
import { authServiceOptional } from "../../../../middleware/authServiceOptional.js";
import { asyncHandler } from "../../../../middleware/asyncHandler.js";
import { requirePermission } from "../../../../middleware/requirePermission.js";
import { requirePolicy } from "../../../../middleware/requirePolicy.js";

const router = Router();

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("synonym.create"),
    payload: createSearchSynonymSchema,
  }),
  z.object({
    action: z.literal("synonym-group.create"),
    payload: createSearchSynonymGroupSchema,
  }),
  z.object({
    action: z.literal("reindex"),
    payload: searchReindexSchema.optional(),
  }),
]);

router.post(
  "/",
  authServiceOptional,
  authUserOptional,
  getUserOptional,
  requirePolicy("platform.write"),
  requirePermission("search:write"),
  asyncHandler(async (req, res) => {
    const input = parseBody(req, bodySchema);

    if (input.action === "synonym.create") {
      await createSearchSynonym(input.payload, res.locals.tenantId);
      clearSearchCache();
      res.status(201).json({
        message: "Search synonym created",
      });
      return;
    }

    if (input.action === "synonym-group.create") {
      const groupKey = await createSearchSynonymGroup(
        input.payload,
        res.locals.tenantId,
      );
      clearSearchCache();
      res.status(201).json({
        message: "Search synonym group created",
        data: { groupKey },
      });
      return;
    }

    const runId = await enqueueSearchReindex({
      tenantId: res.locals.tenantId,
      scope: input.payload?.scope,
      batchSize: input.payload?.batchSize,
    });
    clearSearchCache();
    res.status(202).json({
      message: "Search reindex queued",
      data: { runId },
    });
  }),
);

export default router;
