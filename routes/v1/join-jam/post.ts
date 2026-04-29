import express from "express";
import authUser from "../../../middleware/authUser";
import getUser from "../../../loaders/getUser.js";
import getJam from "../../../loaders/getJam.js";
import rateLimit from "@middleware/rateLimit";
import { asyncHandler } from "../../../middleware/asyncHandler.js";
import { joinJam, userIsInJam } from "@features/jams";
import { requireLoadedJam, requireRequestUser } from "@lib/locals";

const router = express.Router();

router.post(
  "/",
  rateLimit(),

  authUser,
  getUser,
  getJam,
  asyncHandler(async (_req, res) => {
    const user = requireRequestUser(res);
    const jam = requireLoadedJam<{ users: Array<{ id: number }> }>(res);
    await joinJam({
      jamId: jam.id,
      userId: user.id,
      alreadyJoined: userIsInJam(user, jam),
    });

    res.send({ message: "Joined jam" });
  }),
);

export default router;
