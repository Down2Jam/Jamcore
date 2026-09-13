import type { RequestHandler } from "express";
import { authenticateRequest, verifySessionToken } from "../auth/session.js";

// Native audio elements send same-origin cookies, but cannot set Bearer headers.
// Use this only on read-only media routes.
const authMediaUserOptional: RequestHandler = async (req, res, next) => {
  try {
    if (req.headers.authorization) {
      res.locals.userSlug = (await authenticateRequest(req, res, true)) ?? undefined;
    } else {
      const refreshToken = req.cookies?.refreshToken;
      if (typeof refreshToken === "string") {
        try {
          res.locals.userSlug = verifySessionToken(refreshToken).user;
          res.locals.authMethod = "session";
        } catch {
          // An expired cookie should not prevent public audio playback.
        }
      }
    }
    next();
  } catch (error) {
    next(error);
  }
};

export default authMediaUserOptional;
