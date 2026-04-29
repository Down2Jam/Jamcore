import { Router } from "express";

import { deleteSearchSynonymSchema, deleteSearchSynonym } from "../../../../features/search/admin.service.js";
import { clearSearchCache } from "../../../../features/search/service.js";
import getUserOptional from "../../../../loaders/getUserOptional.js";
import { parseBody } from "../../../../lib/request.js";
import authUserOptional from "../../../../middleware/authUserOptional.js";
import { authServiceOptional } from "../../../../middleware/authServiceOptional.js";
import { asyncHandler } from "../../../../middleware/asyncHandler.js";
import { requirePermission } from "../../../../middleware/requirePermission.js";
import { requirePolicy } from "../../../../middleware/requirePolicy.js";

const router = Router();

router.delete(
  "/",
  authServiceOptional,
  authUserOptional,
  getUserOptional,
  requirePolicy("platform.write"),
  requirePermission("search:write"),
  asyncHandler(async (req, res) => {
    const input = parseBody(req, deleteSearchSynonymSchema);
    await deleteSearchSynonym(input.id, res.locals.tenantId);
    clearSearchCache();
    res.json({
      message: "Search synonym deleted",
    });
  }),
);

export default router;
