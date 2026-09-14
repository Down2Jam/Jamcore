import type { RequestHandler } from "express";
import { authenticateRequest } from "../auth/session.js";
import { resolveAccessToken } from "../auth/tokenStore.js";

// Native media cannot send Authorization headers. Only accept the short-lived website access cookie.
const authMediaUserOptional: RequestHandler = async (req, res, next) => {
  try {
    if (req.headers.authorization) {
      res.locals.userSlug = (await authenticateRequest(req, res, true)) ?? undefined;
    } else if (typeof req.cookies?.mediaAccessToken === "string") {
      const resolved = await resolveAccessToken(req.cookies.mediaAccessToken, res.locals.tenantId);
      if (resolved && !resolved.appId) {
        res.locals.userSlug = resolved.user.slug;
        res.locals.authMethod = "session";
      }
    }
    next();
  } catch (error) { next(error); }
};
export default authMediaUserOptional;
