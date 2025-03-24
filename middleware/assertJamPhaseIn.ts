import { NextFunction, Response, Request } from "express";

/**
 * Middleware to assert that the jam is in an array of phases
 * Requires getJam to be used previously in the assert chain
 */
function assertJamPhaseIn(
  phases: (
    | "Upcoming Jam"
    | "Suggestion"
    | "Elimination"
    | "Voting"
    | "Jamming"
    | "Submission"
    | "Rating"
  )[]
) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    if (!res.locals.jamPhase) {
      res.status(502).send("Jam not gotten.");
    }

    if (!phases.includes(res.locals.jamPhase)) {
      res.status(401).send(`Jam is not in the requested phases.`);
      return;
    }

    next();
  };
}

export default assertJamPhaseIn;
