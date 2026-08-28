import { Router } from "express";
import rateLimit from "@middleware/rateLimit";
import authUserOptional from "@middleware/authUserOptional";
import getUserOptional from "@loaders/getUserOptional";
import getJam from "@loaders/getJam";
import { asyncHandler } from "@middleware/asyncHandler";
import { listThemesForJam, listThemesQuerySchema } from "@features/themes";
import { requireLoadedJam } from "@lib/locals";
import { parseQuery } from "../../../lib/request.js";

const router = Router();

/**
 * Route to get themes from the database.
 */
router.get(
  "/",
  rateLimit(),
  authUserOptional,
  getUserOptional,
  getJam,
  asyncHandler(async (req, res) => {
    const { isVoting } = parseQuery(req, listThemesQuerySchema);
    const jam = requireLoadedJam(res);
    const themes = await listThemesForJam({
      jamId: jam.id,
      userId: res.locals.user?.id,
      isVoting: isVoting === "1",
    });

    res.send({ message: "Themes fetched", data: themes });
  }),
);

export default router;

