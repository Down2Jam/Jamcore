import { Request, Response, NextFunction } from "express";
import db from "../helper/db";
import { getCurrentActiveJam } from "services/jamService";

async function getJam(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const { jamId } = req.body;

  // If no jam id provided gets the current jam
  if (!jamId) {
    const activeJam = await getCurrentActiveJam();

    if (!activeJam) {
      res.status(404).json({ message: "No active jams found" });
      return;
    }

    res.locals.jam = activeJam.futureJam;
    res.locals.jamPhase = activeJam.phase;
    next();
    return;
  }

  const jam = await db.jam.findUnique({
    where: {
      id: jamId,
    },
    include: {
      users: true,
      games: {
        include: {
          ratings: true,
          tracks: true,
          ratingCategories: true,
        },
      },
    },
  });

  if (!jam) {
    res.status(404).send("Jam missing.");
    return;
  }

  res.locals.jam = jam;
  next();
}

export default getJam;
