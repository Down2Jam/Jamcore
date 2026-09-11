import { Request, Response, NextFunction } from "express";
import { authenticateRequest } from "../auth/session.js";
import { ApiError, ForbiddenError } from "../lib/errors.js";

/**
 * Middleware to check if the user is authenticated and that the authentication is valid
 */
async function authUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userSlug = await authenticateRequest(req, res);

    if (res.locals.authMethod === "gameToken" && res.locals.gameTokenAllowed !== true) {
      // Forbidden, not Unauthorized: the token itself is valid, it just cannot use this route. A
      // 401 here would make clients treat a perfectly good token as if the whole session had been
      // rejected.
      throw new ForbiddenError("Game tokens are not allowed on this route.");
    }

    res.locals.userSlug = userSlug ?? undefined;
    next();
  } catch (error) {
    next(error instanceof ApiError ? error : error);
  }
}

export default authUser;
