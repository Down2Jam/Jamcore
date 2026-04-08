import type { Request, Response } from "express";
import jwt from "jsonwebtoken";
import db from "@helper/db";
import { SESSION_DURATION_MS } from "@helper/authCookies";

export async function getAdminUserFromRequest(
  req: Request,
  res: Response,
  username: string,
) {
  const authHeader = req.headers["authorization"];
  const refreshToken = req.cookies["refreshToken"];
  const accessToken = authHeader && authHeader.split(" ")[1];

  if (accessToken == null || refreshToken == null) {
    res.status(401).send();
    return null;
  }

  if (!process.env.TOKEN_SECRET) {
    res.status(500).send();
    return null;
  }

  try {
    jwt.verify(accessToken, process.env.TOKEN_SECRET);
  } catch (_error) {
    try {
      jwt.verify(refreshToken, process.env.TOKEN_SECRET);
      const nextAccessToken = jwt.sign(
        { user: username },
        process.env.TOKEN_SECRET,
        { expiresIn: "1h" },
      );

      res
        .cookie("refreshToken", refreshToken, {
          httpOnly: true,
          sameSite: "strict",
          maxAge: SESSION_DURATION_MS,
        })
        .header("Authorization", nextAccessToken);
    } catch (_refreshError) {
      res.status(400).send("Invalid Token.");
      return null;
    }
  }

  const user = await db.user.findUnique({
    where: {
      slug: username,
    },
  });

  if (!user) {
    res.status(401).send();
    return null;
  }

  if (!user.admin) {
    res.status(403).send("Admin access required.");
    return null;
  }

  return user;
}
