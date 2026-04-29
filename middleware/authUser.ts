import { Request, Response, NextFunction } from "express";
import { authenticateRequest } from "../auth/session.js";
import { ApiError } from "../lib/errors.js";

/**
 * Middleware to check if the user is authenticated and that the authentication is valid
 */
function authUser(req: Request, res: Response, next: NextFunction): void {
  try {
    res.locals.userSlug = authenticateRequest(req, res) ?? undefined;
    next();
  } catch (error) {
    next(error instanceof ApiError ? error : error);
  }
}

export default authUser;
