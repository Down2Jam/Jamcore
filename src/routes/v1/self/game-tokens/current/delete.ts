import { Router } from "express";

import authUser from "@middleware/authUser";
import { allowGameToken } from "@middleware/allowGameToken";
import getUser from "@loaders/getUser";
import rateLimit from "@middleware/rateLimit";
import { asyncHandler } from "@middleware/asyncHandler";
import { requireRequestUser } from "@lib/locals";
import { ForbiddenError, NotFoundError } from "@lib/errors";
import { revokeGameAccessToken } from "../../../../../auth/gameToken.js";

const router = Router();

router.use(allowGameToken);

router.delete(
  "/",
  rateLimit(60),
  authUser,
  getUser,
  asyncHandler(async (_req, res) => {
    if (res.locals.authMethod !== "gameToken" || !res.locals.gameAccessTokenId) {
      throw new ForbiddenError(
        "This endpoint revokes the game token used to authenticate the request",
      );
    }

    const user = requireRequestUser(res);
    const revoked = await revokeGameAccessToken(res.locals.gameAccessTokenId, user.id);
    if (!revoked) {
      throw new NotFoundError("Game token not found");
    }

    res.json({ message: "Game token revoked" });
  }),
);

export default router;
