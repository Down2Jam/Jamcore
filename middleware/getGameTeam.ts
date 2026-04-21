import { Request, Response, NextFunction } from "express";
import db from "../helper/db";

async function getGameTeam(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!res.locals.game) {
    res.status(502).json({ message: "No game fetched" });
    return;
  }

  const team = await db.team.findUnique({
    where: {
      id: res.locals.game.teamId,
    },
    include: {
      users: true,
    },
  });

  if (!team) {
    res.status(404).send("Team missing.");
    return;
  }

  res.locals.team = team;
  next();
}

export default getGameTeam;
