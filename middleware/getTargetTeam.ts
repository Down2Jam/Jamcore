import { Request, Response, NextFunction } from "express";
import db from "../helper/db";

/**
 * Middleware to fetch the target team from the database.
 */
async function getTargetTeam(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const { targetTeamId } = req.body;
  const { targetTeamId: queryTargetTeamId } = req.query;

  // Use query parameters if available, otherwise fallback to body
  const teamId = targetTeamId || queryTargetTeamId;

  if (!teamId || isNaN(parseInt(teamId as string))) {
    res.status(502).send("Team id missing.");
    return;
  }

  let idnumber = parseInt(teamId as string);

  let team = await db.team.findUnique({
    where: {
      id: idnumber,
    },
    include: {
      users: true,
      invites: true,
      applications: true,
      game: {
        include: {
          leaderboards: {
            include: {
              scores: true,
            },
          },
          achievements: true,
        },
      },
    },
  });

  if (!team) {
    res.status(404).send("Team missing.");
    return;
  }

  res.locals.targetTeam = team;
  next();
}

export default getTargetTeam;
