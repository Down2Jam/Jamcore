import { Request, Response, NextFunction } from "express";

import { appConfig } from "../config/app.js";
import db from "../infra/db.js";
import { doesCoreEntityBelongToTenant } from "../infra/coreTenantStore.js";
import { BadRequestError, NotFoundError } from "../lib/errors.js";

async function getGame(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const rawGameId = req.body?.gameId ?? req.params?.gameId ?? req.query?.gameId;
  const gameId = Number(rawGameId);

  if (!gameId) {
    next(new BadRequestError("No game provided."));
    return;
  }

  const game = await db.game.findUnique({
    where: {
      id: gameId,
    },
  });

  if (!game) {
    next(new NotFoundError("Game missing."));
    return;
  }

  const belongsToTenant = await doesCoreEntityBelongToTenant({
    entityType: "Game",
    entityId: game.id,
    tenantId: res.locals.tenantId,
    strictIsolation: appConfig.platform.multiTenant.strictIsolation,
  });
  if (!belongsToTenant) {
    next(new NotFoundError("Game missing."));
    return;
  }

  res.locals.game = game;
  next();
}

export default getGame;
