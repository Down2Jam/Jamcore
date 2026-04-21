import { Request, Response, NextFunction } from "express";

/**
 * Middleware that sends an error if the requesting user is not a mod and not a member of the target team and not the owner of the target score
 * Requires getUser and getTargetTeam to be used previously in the middleware chain.
 */
function assertUserModOrUserTeamMemberOrUserScoreOwner(
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!res.locals.user) {
    res.status(502).send("User not gotten.");
  }

  if (!res.locals.score) {
    res.status(502).send("Score not gotten.");
  }

  if (!res.locals.team) {
    res.status(502).send("Team not gotten.");
  }

  if (
    !res.locals.user.mod &&
    res.locals.team.users.filter((user: any) => user.id == res.locals.user.id)
      .length == 0 &&
    res.locals.score.userId != res.locals.user.id
  ) {
    res
      .status(401)
      .send("User is not in the team, not a mod, and not the score owner.");
    return;
  }

  next();
}

export default assertUserModOrUserTeamMemberOrUserScoreOwner;
