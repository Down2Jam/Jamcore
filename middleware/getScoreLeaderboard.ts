import { Request, Response, NextFunction } from "express";
import db from "../helper/db";

async function getScoreLeaderboard(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!res.locals.score) {
    res.status(502).json({ message: "No score fetched" });
    return;
  }

  const leaderboard = await db.leaderboard.findUnique({
    where: {
      id: res.locals.score.leaderboardId,
    },
  });

  if (!leaderboard) {
    res.status(404).send({ message: "Leaderboard missing." });
    return;
  }

  res.locals.leaderboard = leaderboard;
  next();
}

export default getScoreLeaderboard;
