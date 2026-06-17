import { Router } from "express";

import { asyncHandler } from "../../../middleware/asyncHandler.js";
import rateLimit from "@middleware/rateLimit";
import { searchContent, searchQuerySchema } from "@features/search";
import { parseQuery } from "../../../lib/request.js";

const router = Router();

router.get(
  "/",
  rateLimit(),
  asyncHandler(async (req, res) => {
    const input = parseQuery(req, searchQuerySchema);
    const result = await searchContent({
      ...input,
      tenantId: res.locals.tenantId,
    });

    res.setHeader("Cache-Control", "private, max-age=15");
    res.send(result);
  }),
);

export default router;
