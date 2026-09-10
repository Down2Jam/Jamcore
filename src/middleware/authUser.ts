import { Request, Response, NextFunction } from "express";
import { authenticateRequest } from "../auth/session.js";
import { ApiError } from "../lib/errors.js";

/**
 * Middleware to check if the user is authenticated and that the authentication is valid
 */
async function authUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.locals.userSlug = (await authenticateRequest(req, res)) ?? undefined;
    next();
  } catch (error) {
    next(error instanceof ApiError ? error : error);
  }
}

export default authUser;
