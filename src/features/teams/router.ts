import express from "express";
import { z } from "zod";

import getTargetTeam from "@loaders/getTargetTeam";
import getTargetUserOptional from "@loaders/getTargetUserOptional";
import authUser from "@middleware/authUser";
import getUser from "@loaders/getUser";
import getJam from "@loaders/getJam";
import rateLimit from "@middleware/rateLimit";
import assertUserModOrUserTargetTeamOwner from "@guards/assertUserModOrUserTargetTeamOwner";
import { asyncHandler } from "@middleware/asyncHandler";
import {
  listTeams,
  createTeam,
  deleteTeamById,
  updateTeamById,
  updateTeamSchema,
} from "./index.js";
import { requireLoadedJam, requireRequestUser, requireTargetTeam } from "../../lib/locals.js";
import { parseBody, parseParams, parseQuery } from "../../lib/request.js";

const teamListQuerySchema = z.object({
  cursor: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  targetUserId: z.coerce.number().int().positive().optional(),
  targetUserSlug: z.string().trim().min(1).optional(),
});

const teamParamsSchema = z.object({
  teamId: z.coerce.number().int().positive(),
});

export function createTeamsRouter() {
  const router = express.Router();

  router.get(
    "/",
    rateLimit(60),
    getTargetUserOptional,
    asyncHandler(async (req, res) => {
      const input = parseQuery(req, teamListQuerySchema);
      const teams = await listTeams({
        cursor: input.cursor,
        limit: input.limit,
        targetUserId: res.locals.targetUser?.id,
        tenantId: res.locals.tenantId,
      });

      res.send(teams);
    }),
  );

  router.post(
    "/",
    rateLimit(),
    authUser,
    getUser,
    getJam,
    asyncHandler(async (_req, res) => {
      const user = requireRequestUser(res);
      const jam = requireLoadedJam(res);
      const team = await createTeam({
        ownerId: user.id,
        jamId: jam.id,
        tenantId: res.locals.tenantId,
      });

      res.status(201).send({
        message: "Team created",
        data: team,
      });
    }),
  );

  router.get(
    "/:teamId",
    rateLimit(),
    authUser,
    getUser,
    getTargetTeam,
    asyncHandler(async (req, res) => {
      parseParams(req, teamParamsSchema);
      res.send({
        message: "Team found",
        data: res.locals.targetTeam,
      });
    }),
  );

  router.put(
    "/:teamId",
    rateLimit(),
    authUser,
    getUser,
    getTargetTeam,
    assertUserModOrUserTargetTeamOwner,
    asyncHandler(async (req, res) => {
      parseParams(req, teamParamsSchema);
      const input = parseBody(req, updateTeamSchema);
      const targetTeam = requireTargetTeam(res);

      await updateTeamById({
        teamId: targetTeam.id,
        input,
      });

      res.send({ message: "Team updated" });
    }),
  );

  router.delete(
    "/:teamId",
    rateLimit(),
    authUser,
    getUser,
    getTargetTeam,
    assertUserModOrUserTargetTeamOwner,
    asyncHandler(async (req, res) => {
      parseParams(req, teamParamsSchema);
      const targetTeam = requireTargetTeam(res);
      await deleteTeamById(targetTeam.id);

      res.send({ message: "Team deleted" });
    }),
  );

  return router;
}
