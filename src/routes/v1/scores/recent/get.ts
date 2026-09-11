import { Router } from "express";
import { z } from "zod";

import { listRecentTopScores } from "@features/scores";
import { parseQuery } from "@lib/request";
import { asyncHandler } from "@middleware/asyncHandler";
import rateLimit from "@middleware/rateLimit";

const router = Router();
const querySchema = z.object({
  jamId: z.coerce.number().int().positive().optional(),
});

router.get(
  "/",
  rateLimit(),
  asyncHandler(async (req, res) => {
    const { jamId } = parseQuery(req, querySchema);
    const scores = await listRecentTopScores(
      res.locals.tenantId,
      undefined,
      jamId,
    );
    res.json({ message: "Recent top scores fetched", data: scores });
  }),
);

export default router;
