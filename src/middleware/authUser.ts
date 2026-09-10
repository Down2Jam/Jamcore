import { Request, Response, NextFunction } from "express";
import { authenticateRequest } from "../auth/session.js";
import { ApiError, UnauthorizedError } from "../lib/errors.js";

/**
 * Middleware to check if the user is authenticated and that the authentication is valid
 */
async function authUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userSlug = await authenticateRequest(req, res);

    if (res.locals.authMethod === "gameToken" && res.locals.gameTokenAllowed !== true) {
      throw new UnauthorizedError("Unauthorized: Game tokens are not allowed on this route.");
    }

    res.locals.userSlug = userSlug ?? undefined;
    next();
  } catch (error) {
    next(error instanceof ApiError ? error : error);
  }
}

export default authUser;
