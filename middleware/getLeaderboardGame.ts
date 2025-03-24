import { Request, Response, NextFunction } from "express";
import db from "../helper/db";

async function getLeaderboardGame(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!res.locals.leaderboard) {
    res.status(502).json({ message: "No leaderboard fetched" });
    return;
  }

  const game = await db.game.findUnique({
    where: {
      id: res.locals.leaderboard.gameId,
    },
  });

  if (!game) {
    res.status(404).send("Game missing.");
    return;
  }

  res.locals.game = game;
  next();
}

export default getLeaderboardGame;
