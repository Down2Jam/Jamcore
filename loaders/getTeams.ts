import { Request, Response, NextFunction } from "express";

import db from "../infra/db.js";
import { BadRequestError, NotFoundError, UnauthorizedError } from "../lib/errors.js";

async function getTeams(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const rawTeamId = req.body?.teamId ?? req.params?.teamId ?? req.query?.teamId;
  const teamId = rawTeamId ? Number(rawTeamId) : null;

  if (!teamId) {
    if (!res.locals.jam) {
      next(new UnauthorizedError("Jam not loaded."));
      return;
    }

    if (!res.locals.user) {
      next(new UnauthorizedError("User not loaded."));
      return;
    }

    const teams = await db.team.findMany({
      where: {
        jamId: res.locals.jam.id,
        users: {
          some: {
            id: res.locals.user.id,
          },
        },
      },
    });

    if (!teams.length) {
      next(new NotFoundError("No team for the current jam found."));
      return;
    }

    res.locals.teams = teams;
    next();
    return;
  }

  if (!Number.isInteger(teamId) || teamId <= 0) {
    next(new BadRequestError("Invalid team id."));
    return;
  }

  const team = await db.team.findUnique({
    where: {
      id: teamId,
    },
  });

  if (!team) {
    next(new NotFoundError("Team missing."));
    return;
  }

  res.locals.teams = [team];
  next();
}

export default getTeams;
