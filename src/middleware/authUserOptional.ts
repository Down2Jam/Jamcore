import { Request, Response, NextFunction } from "express";
import { authenticateRequest } from "../auth/session.js";
import { ApiError } from "../lib/errors.js";

/**
 * Middleware to check if the user is authenticated and that the authentication is valid
 */
async function authUserOptional(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userSlug = await authenticateRequest(req, res, true);
    if (userSlug) {
      res.locals.userSlug = userSlug;
    }
    next();
  } catch (error) {
    next(error instanceof ApiError ? error : error);
  }
}

export default authUserOptional;
