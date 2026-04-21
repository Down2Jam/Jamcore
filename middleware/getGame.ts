import { Request, Response, NextFunction } from "express";
import db from "../helper/db";

async function getGame(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const { gameId } = req.body;

  if (!gameId) {
    res.status(400).json({ message: "No game provided" });
    return;
  }

  const game = await db.game.findUnique({
    where: {
      id: gameId,
    },
  });

  if (!game) {
    res.status(404).send({ message: "Game missing." });
    return;
  }

  res.locals.game = game;
  next();
}

export default getGame;
