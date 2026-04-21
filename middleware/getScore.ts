import { Request, Response, NextFunction } from "express";
import db from "../helper/db";

async function getScore(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const { scoreId } = req.body;

  if (!scoreId) {
    res.status(400).json({ message: "No score provided" });
    return;
  }

  const score = await db.score.findUnique({
    where: {
      id: scoreId,
    },
  });

  if (!score) {
    res.status(404).send({ message: "Score missing." });
    return;
  }

  res.locals.score = score;
  next();
}

export default getScore;
