import { Router } from "express";

import authUser from "@middleware/authUser";
import getUser from "@loaders/getUser";
import rateLimit from "@middleware/rateLimit";
import { asyncHandler } from "@middleware/asyncHandler";
import { requireRequestUser } from "@lib/locals";
import { listGameAccessTokens } from "../../../../auth/gameToken.js";

const router = Router();

router.get(
  "/",
  rateLimit(60),
  authUser,
  getUser,
  asyncHandler(async (_req, res) => {
    const user = requireRequestUser(res);
    const tokens = await listGameAccessTokens(user.id);

    res.json(tokens);
  }),
);

export default router;
