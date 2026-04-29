import type { Request, Response } from "express";
import express from "express";

import authUser from "@middleware/authUser";
import authUserOptional from "@middleware/authUserOptional";
import assertJamPhaseIn from "@guards/assertJamPhaseIn";
import assertTargetTeamDoesNotHaveGame from "@guards/assertTargetTeamDoesNotHaveGame";
import assertUserIsInTargetTeam from "@guards/assertUserIsInTargetTeam";
import rateLimit from "@middleware/rateLimit";
import getJam from "@loaders/getJam";
import getTargetTeam from "@loaders/getTargetTeam";
import { asyncHandler } from "@middleware/asyncHandler";
import getUser from "@loaders/getUser";
import getUserOptional from "@loaders/getUserOptional";
import { loadAuthorizationGrants } from "../../middleware/authorizationContext.js";
import { JAM_PHASES } from "../../domain/jamTimeline.js";
import {
  createGame,
  createGameSchema,
  createPostJamPage,
  gameDetailParamsSchema,
  gameDetailQuerySchema,
  gameDevlogQuerySchema,
  gameListingQuerySchema,
  getRandomPublishedGame,
  listGameDevlogPosts,
  listGames,
  loadGameDetailResponse,
  parseListingPageVersion,
  updateGameBySlug,
  updateGameSchema,
} from "./index.js";
import { NotFoundError } from "@lib/errors";
import { parseBody, parseParams, parseQuery } from "../../lib/request.js";

export function createGamesRouter() {
  const router = express.Router();

  router.post(
    "/",
    rateLimit(),
    authUser,
    getUser,
    getJam,
    getTargetTeam,
    assertJamPhaseIn([
      JAM_PHASES.jamming,
      JAM_PHASES.submission,
      JAM_PHASES.rating,
    ]),
    assertUserIsInTargetTeam,
    assertTargetTeamDoesNotHaveGame,
    asyncHandler(async (req, res) => {
      const input = parseBody(req, createGameSchema);
      const game = await createGame({
        actorUser: res.locals.user,
        jam: res.locals.jam,
        targetTeam: res.locals.targetTeam,
        input,
        tenantId: res.locals.tenantId,
      });

      res.status(201).json(game);
    }),
  );

  router.put(
    "/:gameSlug",
    authUser,
    getUser,
    getJam,
    asyncHandler(async (req, res) => {
      const { gameSlug } = parseParams(req, gameDetailParamsSchema);
      const body = parseBody(req, updateGameSchema);
      const grants = await loadAuthorizationGrants(res);
      const updatedGame = await updateGameBySlug({
        gameSlug,
        body,
        jamPhase: res.locals.jamPhase,
        actor: res.locals.user,
        grants,
      });

      res.json(updatedGame);
    }),
  );

  router.post(
    "/:gameSlug/post-jam",
    authUser,
    getUser,
    getJam,
    asyncHandler(async (req, res) => {
      const { gameSlug } = parseParams(req, gameDetailParamsSchema);
      const grants = await loadAuthorizationGrants(res);
      const game = await createPostJamPage(
        gameSlug,
        res.locals.user,
        grants,
      );
      res.json(game);
    }),
  );

  router.get(
    "/random",
    asyncHandler(async (_req: Request, res: Response) => {
      const game = await getRandomPublishedGame(res.locals.tenantId);
      res.json({
        message:
          "Fetched random published game (active jam if exists, else any game)",
        data: game,
      });
    }),
  );

  router.get(
    "/:gameSlug/devlog",
    authUserOptional,
    getUserOptional,
    asyncHandler(async (req: Request, res: Response) => {
      const { gameSlug } = parseParams(req, gameDetailParamsSchema);
      const query = parseQuery(req, gameDevlogQuerySchema);
      res.json(await listGameDevlogPosts({
        gameSlug,
        input: query,
        tenantId: res.locals.tenantId,
      }));
    }),
  );

  router.get(
    "/:gameSlug",
    authUserOptional,
    getUserOptional,
    getJam,
    asyncHandler(async (req: Request, res: Response) => {
      const { gameSlug } = parseParams(req, gameDetailParamsSchema);
      const query = parseQuery(req, gameDetailQuerySchema);
      const game = await loadGameDetailResponse({
        gameSlug,
        jam: res.locals.jam,
        viewer: res.locals.user,
        tenantId: res.locals.tenantId,
        recap: query.recap,
        preview: query.preview,
      });

      if (!game) {
        throw new NotFoundError("Game not found");
      }

      res.json(game);
    }),
  );

  router.get(
    "/",
    asyncHandler(async (req: Request, res: Response) => {
      const query = parseQuery(req, gameListingQuerySchema);
      const games = await listGames({
        sort: query.sort,
        jamId: query.jamId,
        jamSlug: query.jamSlug,
        pageVersion: parseListingPageVersion(query.pageVersion),
        cursor: query.cursor,
        limit: query.limit,
        tenantId: res.locals.tenantId,
      });

      res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=120");
      const isPaginated =
        typeof req.query.cursor !== "undefined" || typeof req.query.limit !== "undefined";
      res.json(isPaginated ? games : games.items);
    }),
  );

  return router;
}
