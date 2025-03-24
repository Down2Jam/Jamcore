import { Request, Response, NextFunction } from "express";
import db from "../helper/db";

async function getLeaderboard(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const { leaderboardId } = req.body;

  if (!leaderboardId) {
    res.status(400).json({ message: "No leaderboard id provided" });
    return;
  }

  const leaderboard = await db.leaderboard.findUnique({
    where: {
      id: leaderboardId,
    },
  });

  if (!leaderboard) {
    res.status(404).send("Leaderboard missing.");
    return;
  }

  res.locals.leaderboard = leaderboard;
  next();
}

export default getLeaderboard;
