import { Router } from "express";
import authUser from "@middleware/authUser";
import getUser from "@loaders/getUser";
import rateLimit from "@middleware/rateLimit";
import db from "@infra/db";
import { UnauthorizedError } from "@lib/errors";

var router = Router();

router.get(
  "/",
  rateLimit(60),

  authUser,
  getUser,

  async (_req, res) => {
    if (!res.locals.user) {
      throw new UnauthorizedError("Authentication required");
    }

    const followingCount = await db.userFollow.count({
      where: {
        followerId: res.locals.user.id,
        tenantId: res.locals.tenantId ?? null,
      },
    });

    res.json({
      ...res.locals.user,
      followingCount,
    });
  }
);

export default router;

