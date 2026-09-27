import { Router, type Response } from "express";
import db from "../../infra/db.js";
import { allowGameToken } from "../../middleware/allowGameToken.js";
import authUser from "../../middleware/authUser.js";
import authUserOptional from "../../middleware/authUserOptional.js";
import getUser from "../../loaders/getUser.js";
import getUserOptional from "../../loaders/getUserOptional.js";
import rateLimit from "../../middleware/rateLimit.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { ForbiddenError, NotFoundError } from "../../lib/errors.js";
import { clientGameQuery, clientAchievementsQuery, clientScoresQuery, getClientGame, getClientAchievements, getClientScores, type ClientActor } from "./client.service.js";

function actor(res: Response): ClientActor {
  if (res.locals.authMethod === "gameToken" && !res.locals.gameAccessTokenGameId) throw new ForbiddenError("Game token has no game scope.");
  return { user: res.locals.user, tenantId: res.locals.tenantId,
    tokenGameId: res.locals.authMethod === "gameToken" ? res.locals.gameAccessTokenGameId : undefined };
}

export function createPlayerReadsRouter() {
  const router = Router();
  const noStore = (_req: unknown, res: Response, next: () => void) => { res.setHeader("Cache-Control", "private, no-store"); next(); };
  const publicRead = [allowGameToken, rateLimit(), noStore, authUserOptional, getUserOptional];
  const playerRead = [allowGameToken, rateLimit(), noStore, authUser, getUser];
  async function gameId(slug: string) {
    const game = await db.game.findUnique({ where: { slug }, select: { id: true } });
    if (!game) throw new NotFoundError("Game not found.");
    return game.id;
  }
  router.get("/games/:gameSlug/leaderboards", ...publicRead, asyncHandler(async (req, res) => {
    const query = clientGameQuery.parse({ ...req.query, gameId: await gameId(String(req.params.gameSlug)) });
    const { user: _user, ...data } = await getClientGame(query, actor(res));
    res.json(data);
  }));
  router.get("/games/:gameSlug/achievements", ...publicRead, asyncHandler(async (req, res) => {
    const query = clientAchievementsQuery.parse({ ...req.query, gameId: await gameId(String(req.params.gameSlug)), owned: "false" });
    const data = await getClientAchievements(query, actor(res));
    // Definitions are public; ownership is only returned by /self/achievements.
    res.json({ ...data, achievements: data.achievements.map(item => ({ id: item.id, name: item.name, description: item.description, image: item.image })) });
  }));
  router.get("/leaderboards/:leaderboardId/scores", ...publicRead, asyncHandler(async (req, res) => {
    res.json(await getClientScores(clientScoresQuery.parse({ ...req.query, leaderboardId: req.params.leaderboardId, mine: "false" }), actor(res)));
  }));
  router.get("/self/game-context", ...playerRead, asyncHandler(async (req, res) => {
    res.json(await getClientGame(clientGameQuery.parse(req.query), actor(res)));
  }));
  router.get("/self/achievements", ...playerRead, asyncHandler(async (req, res) => {
    res.json(await getClientAchievements(clientAchievementsQuery.parse({ ...req.query, owned: "true" }), actor(res)));
  }));
  router.get("/self/scores", ...playerRead, asyncHandler(async (req, res) => {
    res.json(await getClientScores(clientScoresQuery.parse({ ...req.query, mine: "true" }), actor(res)));
  }));
  return router;
}
