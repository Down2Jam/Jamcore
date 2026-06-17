import { Router } from "express";
import { z } from "zod";

import {
  updateSearchSynonymGroup,
  updateSearchSynonymGroupSchema,
  updateSearchSettings,
  updateSearchSettingsSchema,
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
    action: z.literal("settings.update"),
    payload: updateSearchSettingsSchema,
  }),
  z.object({
    action: z.literal("synonym-group.update"),
    payload: updateSearchSynonymGroupSchema,
  }),
]);

router.put(
  "/",
  authServiceOptional,
  authUserOptional,
  getUserOptional,
  requirePolicy("platform.write"),
  requirePermission("search:write"),
  asyncHandler(async (req, res) => {
    const input = parseBody(req, bodySchema);
    if (input.action === "settings.update") {
      await updateSearchSettings(input.payload, res.locals.tenantId);
      clearSearchCache();
      res.json({
        message: "Search settings updated",
      });
      return;
    }

    await updateSearchSynonymGroup(input.payload, res.locals.tenantId);
    clearSearchCache();
    res.json({
      message: "Search synonym group updated",
    });
  }),
);

export default router;
