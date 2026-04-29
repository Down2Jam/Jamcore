import { Router } from "express";

import { listCurrentUserGames } from "@features/games";
import { requireLoadedJam, requireRequestUser } from "@lib/locals";
import getJam from "@loaders/getJam";
import getUser from "@loaders/getUser";
import authUser from "@middleware/authUser";
import rateLimit from "@middleware/rateLimit";
import { asyncHandler } from "../../../../middleware/asyncHandler.js";

const router = Router();

router.get(
  "/",
  rateLimit(),
  authUser,
  getUser,
  getJam,
  asyncHandler(async (_req, res) => {
    const user = requireRequestUser(res);
    const jam = requireLoadedJam(res);
    const games = await listCurrentUserGames({
      userId: user.id,
      jamId: jam.id,
    });

    res.send({
      message: "Games found",
      data: games,
    });
  }),
);

export default router;
