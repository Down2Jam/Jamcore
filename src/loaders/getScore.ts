import { Request, Response, NextFunction } from "express";

import db from "../infra/db.js";
import { BadRequestError, NotFoundError } from "../lib/errors.js";

async function getScore(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const rawScoreId = req.body?.scoreId ?? req.params?.scoreId ?? req.query?.scoreId;
  const scoreId = Number(rawScoreId);

  if (!scoreId) {
    next(new BadRequestError("No score provided."));
    return;
  }

  const score = await db.score.findUnique({
    where: {
      id: scoreId,
    },
  });

  if (!score) {
    next(new NotFoundError("Score missing."));
    return;
  }

  res.locals.score = score;
  next();
}

export default getScore;
