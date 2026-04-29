import express from "express";

import rateLimit from "@middleware/rateLimit";
import authUser from "@middleware/authUser";
import getJam from "@loaders/getJam";
import logger from "@infra/logger";
import { asyncHandler } from "@middleware/asyncHandler";
import { getRandomJam, hasUserJoinedJam } from "./service.js";
import { requireLoadedJam, requireUserSlug } from "../../lib/locals.js";

export function createJamsRouter() {
  const router = express.Router();

  router.get(
    "/random",
    rateLimit(),
    asyncHandler(async (_req, res) => {
      const jam = await getRandomJam(res.locals.tenantId);
      res.json({
        message: "Fetched random jam",
        data: jam,
      });
    }),
  );

  router.get(
    "/:jamSlug",
    rateLimit(),
    getJam,
    (_req, res) => {
      if (res.locals.jam) {
        logger.info(`Jam ${res.locals.jam.slug ?? res.locals.jam.id} fetched`);
      }

      res.send({
        message: "Jam fetched",
        data: {
          jam: res.locals.jam,
          nextJam: res.locals.nextJam ?? null,
          phase: res.locals.jamPhase,
        },
      });
    },
  );

  router.get(
    "/:jamSlug/participation",
    rateLimit(),
    getJam,
    authUser,
    asyncHandler(async (_req, res) => {
      const jam = requireLoadedJam(res);
      const userSlug = requireUserSlug(res);
      const hasJoined = await hasUserJoinedJam({
        jamId: jam.id,
        userSlug,
      });

      res.send({
        message: hasJoined
          ? "This user has joined the jam"
          : "This user has not joined the jam",
        data: hasJoined,
      });
    }),
  );

  return router;
}
