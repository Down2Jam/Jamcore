import type { Request, Response } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";

import {
  REFRESH_TOKEN_EXPIRES_IN,
  SESSION_DURATION_MS,
} from "./constants.js";
import { env } from "../config/env.js";
import {
  ConfigurationError,
  UnauthorizedError,
} from "../lib/errors.js";

const ACCESS_TOKEN_EXPIRES_IN = "1h";

export type SessionPayload = {
  user: string;
};

function getTokenSecret() {
  if (!env.tokenSecret) {
    throw new ConfigurationError("Token secret not set up");
  }

  return env.tokenSecret;
}

function toSessionPayload(decoded: string | JwtPayload): SessionPayload {
  if (typeof decoded === "string") {
    throw new UnauthorizedError("Invalid token payload");
  }

  const user =
    typeof decoded.user === "string"
      ? decoded.user
      : typeof decoded.name === "string"
        ? decoded.name
        : null;

  if (!user) {
    throw new UnauthorizedError("Token missing user identity");
  }

  return { user };
}

function getAuthorizationToken(req: Request) {
  const authHeader = req.headers.authorization;
  return authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : undefined;
}

function getRefreshToken(req: Request) {
  const headerToken = req.headers.refresh;
  return typeof headerToken === "string" ? req.cookies.refreshToken || headerToken : req.cookies.refreshToken;
}

export function signAccessToken(userSlug: string) {
  return jwt.sign({ user: userSlug }, getTokenSecret(), {
    expiresIn: ACCESS_TOKEN_EXPIRES_IN,
  });
}

export function signRefreshToken(userSlug: string) {
  return jwt.sign({ user: userSlug }, getTokenSecret(), {
    expiresIn: REFRESH_TOKEN_EXPIRES_IN,
  });
}

export function verifySessionToken(token: string) {
  return toSessionPayload(jwt.verify(token, getTokenSecret()));
}

export function writeSession(res: Response, refreshToken: string, accessToken: string) {
  res
    .cookie("refreshToken", refreshToken, {
      httpOnly: true,
      sameSite: "strict",
      secure: env.nodeEnv === "production",
      maxAge: SESSION_DURATION_MS,
    })
    .header("Authorization", accessToken);
}

export function clearSession(res: Response) {
  res.clearCookie("refreshToken", {
    httpOnly: true,
    sameSite: "strict",
    secure: env.nodeEnv === "production",
  });
}

export function authenticateRequest(req: Request, res: Response, optional = false) {
  const accessToken = getAuthorizationToken(req);
  const refreshToken = getRefreshToken(req);

  if (!accessToken || !refreshToken || accessToken === "null") {
    if (optional) {
      return null;
    }

    throw new UnauthorizedError("Unauthorized: Missing tokens.");
  }

  try {
    return verifySessionToken(accessToken).user;
  } catch (accessError) {
    try {
      const payload = verifySessionToken(refreshToken);
      const newAccessToken = signAccessToken(payload.user);
      writeSession(res, refreshToken, newAccessToken);
      return payload.user;
    } catch (_refreshError) {
      if (optional) {
        throw new UnauthorizedError("Unauthorized: Invalid tokens.");
      }

      throw new UnauthorizedError("Unauthorized: Missing tokens.");
    }
  }
}
