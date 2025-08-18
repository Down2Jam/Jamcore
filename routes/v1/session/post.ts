import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
import { checkPasswordHash } from "../../../helper/password";
import rateLimit from "@middleware/rateLimit";
import db from "@helper/db";

const router = Router();

/**
 * Route to add a session to the database.
 * Used for logging in.
 */
router.post(
  "/",
  rateLimit(),

  async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400);
      res.send();
      return;
    }

    const user = await db.user.findUnique({
      where: {
        slug: (username as string).toLowerCase(),
      },
      select: {
        slug: true,
        password: true,
      },
    });

    if (!user) {
      res.status(401);
      res.send();
      return;
    }

    if (!(await checkPasswordHash(password, user.password))) {
      res.status(401);
      res.send();
      return;
    }

    if (!process.env.TOKEN_SECRET) {
      res.status(500);
      res.send();
      return;
    }

    const accessToken = jwt.sign(
      { name: user.slug },
      process.env.TOKEN_SECRET,
      {
        expiresIn: "1h",
      }
    );

    const refreshToken = jwt.sign(
      { name: user.slug },
      process.env.TOKEN_SECRET,
      {
        expiresIn: "7d",
      }
    );

    res
      .cookie("refreshToken", refreshToken, {
        httpOnly: true,
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      })
      .header("Authorization", accessToken)
      .send({
        user: user,
        token: accessToken,
      });
  }
);

export default router;
