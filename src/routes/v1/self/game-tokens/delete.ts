import { Router } from "express";

import authUser from "@middleware/authUser";
import getUser from "@loaders/getUser";
import rateLimit from "@middleware/rateLimit";
import { asyncHandler } from "@middleware/asyncHandler";
import { parseBody } from "@lib/request";
import { requireRequestUser } from "@lib/locals";
import { NotFoundError } from "@lib/errors";
import { revokeGameAccessToken, revokeGameAccessTokenSchema } from "../../../../auth/gameToken.js";

const router = Router();

router.delete(
  "/",
  rateLimit(60),
  authUser,
  getUser,
  asyncHandler(async (req, res) => {
    const { id } = parseBody(req, revokeGameAccessTokenSchema);
    const user = requireRequestUser(res);

    const revoked = await revokeGameAccessToken(id, user.id);
    if (!revoked) {
      throw new NotFoundError("Game token not found");
    }

    res.json({ message: "Game token revoked" });
  }),
);

export default router;
