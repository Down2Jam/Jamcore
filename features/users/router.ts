import express from "express";

import getTargetUser from "@loaders/getTargetUser";
import authUser from "@middleware/authUser";
import authUserOptional from "@middleware/authUserOptional";
import getUser from "@loaders/getUser";
import getUserOptional from "@loaders/getUserOptional";
import assertUserModOrUserTargetUser from "@guards/assertUserModOrUserTargetUser";
import rateLimit from "@middleware/rateLimit";
import logger from "@infra/logger";
import db from "@infra/db";
import { asyncHandler } from "@middleware/asyncHandler";
import {
  followUserBodySchema,
  followUserBySlug,
} from "../social/index.js";
import {
  createUserAccount,
  createUserAccountSchema,
  deleteUserAccount,
  searchUsers,
  searchUsersQuerySchema,
  updateUserProfile,
  updateUserProfileSchema,
} from "./index.js";
import { requireRequestUser, requireTargetUser } from "../../lib/locals.js";
import { parseBody, parseQuery } from "../../lib/request.js";

export function createUsersRouter() {
  const router = express.Router();

  router.get(
    "/search",
    rateLimit(),
    asyncHandler(async (req, res) => {
      const { q } = parseQuery(req, searchUsersQuerySchema);
      const users = await searchUsers(q, res.locals.tenantId);
      res.json(users);
    }),
  );

  router.post(
    "/:userSlug/follow",
    rateLimit(),
    authUser,
    getUser,
    asyncHandler(async (req, res) => {
      const input = parseBody(req, followUserBodySchema);
      res.json(await followUserBySlug({
        actor: requireRequestUser(res),
        targetSlug: String(req.params.userSlug),
        follow: input.follow,
        tenantId: res.locals.tenantId,
      }));
    }),
  );

  router.get(
    "/:userSlug",
    rateLimit(),
    authUserOptional,
    getUserOptional,
    getTargetUser,
    asyncHandler(async (_req, res) => {
      const targetUser = requireTargetUser(res);
      const [followerCount, viewerFollow] = await Promise.all([
        db.userFollow.count({
          where: {
            followingId: targetUser.id,
            tenantId: res.locals.tenantId ?? null,
          },
        }),
        res.locals.user
          ? db.userFollow.findFirst({
              where: {
                followerId: res.locals.user.id,
                followingId: targetUser.id,
                tenantId: res.locals.tenantId ?? null,
              },
              select: { followerId: true },
            })
          : Promise.resolve(null),
      ]);
      logger.info(`User with id ${targetUser.id} fetched`);
      res.send({
        message: "User fetched",
        data: {
          ...targetUser,
          followerCount,
          viewerFollowing: Boolean(viewerFollow),
        },
      });
    }),
  );

  router.post(
    "/",
    rateLimit(5),
    asyncHandler(async (req, res) => {
      const input = parseBody(req, createUserAccountSchema);
      const session = await createUserAccount({
        ...input,
        res,
        tenantId: res.locals.tenantId,
      });

      res.send(session);
    }),
  );

  router.put(
    "/:userSlug",
    rateLimit(),
    authUser,
    getUser,
    getTargetUser,
    assertUserModOrUserTargetUser,
    asyncHandler(async (req, res) => {
      const input = updateUserProfileSchema.parse({
        ...req.body,
        targetUserSlug: req.params.userSlug,
      });
      const actorUser = requireRequestUser(res);
      const targetUser = requireTargetUser(res);
      const updatedUser = await updateUserProfile({
        actorUser,
        targetUser,
        input,
        tenantId: res.locals.tenantId,
      });

      res.status(200).send({ message: "User updated", data: updatedUser });
    }),
  );

  router.delete(
    "/:userSlug",
    rateLimit(),
    authUser,
    getUser,
    getTargetUser,
    assertUserModOrUserTargetUser,
    asyncHandler(async (_req, res) => {
      const targetUser = requireTargetUser(res);
      await deleteUserAccount({
        userId: targetUser.id,
        tenantId: res.locals.tenantId,
      });

      res.status(200).send({ message: "User deleted" });
    }),
  );

  return router;
}
