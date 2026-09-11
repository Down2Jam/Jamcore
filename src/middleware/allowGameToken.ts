import type { NextFunction, Request, Response } from "express";

/**
 * Opts a route into accepting game tokens. Route files that need it call
 * `router.use(allowGameToken)` before `authUser`, so `grep -rl allowGameToken src/routes`
 * always shows the exact allowlist.
 */
export function allowGameToken(_req: Request, res: Response, next: NextFunction): void {
  res.locals.gameTokenAllowed = true;
  next();
}
