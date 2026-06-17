import { Router } from "express";
import rateLimit from "@middleware/rateLimit";
import { asyncHandler } from "@middleware/asyncHandler";
import getJam from "@loaders/getJam";
import authUserOptional from "@middleware/authUserOptional";
import getUserOptional from "@loaders/getUserOptional";
import { getResults, resultsQuerySchema } from "@features/results";
import { requireLoadedJam } from "@lib/locals";
import { parseQuery } from "../../../lib/request.js";

const router = Router();

/**
 * Route to get the results
 */
router.get(
  "/",
  rateLimit(),
  authUserOptional,
  getUserOptional,
  getJam,
  asyncHandler(async (req, res) => {
    const input = parseQuery(req, resultsQuerySchema);
    const jam = requireLoadedJam(res);
    const result = await getResults({
      input,
      jam,
      viewer: res.locals.user,
    });

    res.json(result);
  }),
);

export default router;

