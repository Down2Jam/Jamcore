import { Router } from "express";
import rateLimit from "@middleware/rateLimit";
import authenticateUser from "@middleware/authUser";
import getUser from "@loaders/getUser";
import getJam from "@loaders/getJam";
import { asyncHandler } from "@middleware/asyncHandler";
import { listThemesForJam, listThemesQuerySchema } from "@features/themes";
import { checkJamParticipation } from "@features/jams";
import { requireLoadedJam, requireRequestUser } from "@lib/locals";
import { parseQuery } from "../../../lib/request.js";

const router = Router();

/**
 * Route to get themes from the database.
 */
router.get(
  "/",
  rateLimit(),
  authenticateUser,
  getUser,
  getJam,
  checkJamParticipation,
  asyncHandler(async (req, res) => {
    const { isVoting } = parseQuery(req, listThemesQuerySchema);
    const jam = requireLoadedJam(res);
    const user = requireRequestUser(res);
    const themes = await listThemesForJam({
      jamId: jam.id,
      userId: user.id,
      isVoting: isVoting === "1",
    });

    res.send({ message: "Themes fetched", data: themes });
  }),
);

export default router;

