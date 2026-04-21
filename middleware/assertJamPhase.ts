import { NextFunction, Response, Request } from "express";

/**
 * Middleware to assert that the jam is in a certain phase
 * Requires getJam to be used previously in the assert chain
 */
function assertJamPhase(
  phase:
    | "Upcoming Jam"
    | "Suggestion"
    | "Elimination"
    | "Voting"
    | "Jamming"
    | "Submission"
    | "Rating"
    | "Post-Jam Refinement"
    | "Post-Jam Rating"
    | "No Active Jams"
) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    if (!res.locals.jamPhase) {
      res.status(502).send("Jam not gotten.");
    }

    if (res.locals.jamPhase != phase) {
      res.status(401).send(`Jam is not in ${phase} phase.`);
      return;
    }

    next();
  };
}

export default assertJamPhase;
