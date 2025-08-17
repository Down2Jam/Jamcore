import { Router } from "express";
import db from "@helper/db";
import { hashPassword } from "@helper/password";
import jwt from "jsonwebtoken";
import { body } from "express-validator";
import checkUsernameConflict from "@middleware/checkUsernameConflict";
import assertTokenSecret from "@middleware/assertTokenSecret";
import rateLimit from "@middleware/rateLimit";
import logger from "@helper/logger";
import fs from "fs";
import path, { dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const router = Router();

function getRandomPfp(): string | null {
  const pfpsPath = path.join(
    __dirname,
    "..",
    "..",
    "..",
    "public",
    "images",
    "pfps"
  );

  if (!fs.existsSync(pfpsPath)) return null;

  const files = fs
    .readdirSync(pfpsPath)
    .filter((f) => /\.(png|jpe?g|gif|webp|svg)$/i.test(f));

  if (files.length === 0) return null;

  const randomIndex = Math.floor(Math.random() * files.length);
  return `${
    process.env.NODE_ENV === "production"
      ? "https://d2jam.com"
      : `http://localhost:${process.env.PORT || 3005}`
  }/api/v1/image/pfp/${files[randomIndex]}`;
}

/**
 * Route to add a user to the database.
 * Used for sign ups.
 */
router.post(
  "/",
  rateLimit(5),

  body("username").isString().withMessage({
    message: "Please enter a valid username",
  }),
  body("password").isStrongPassword().withMessage({
    message: "Please enter a valid password",
  }),

  checkUsernameConflict,
  assertTokenSecret,

  async (req, res) => {
    const { username, password, email } = req.body;

    try {
      const randomPfp = getRandomPfp();

      const user = await db.user.create({
        data: {
          slug: username.toLowerCase().replace(" ", "_"),
          name: username,
          password: await hashPassword(password),
          email: email ? email : null,
          profilePicture: randomPfp,
        },
      });

      logger.info(
        `Created user with username: ${username} (ID: ${user.id}, Slug: ${user.slug})`
      );

      const accessToken = jwt.sign(
        { name: user.slug },
        process.env.TOKEN_SECRET as string,
        {
          expiresIn: "1h",
        }
      );

      const refreshToken = jwt.sign(
        { name: user.slug },
        process.env.TOKEN_SECRET as string,
        {
          expiresIn: "1d",
        }
      );

      res
        .cookie("refreshToken", refreshToken, {
          httpOnly: true,
          sameSite: "strict",
        })
        .header("Authorization", accessToken)
        .send({
          user: user,
          token: accessToken,
        });
    } catch (error) {
      logger.error(
        `Failed to create user with username: ${username}. Error: `,
        error
      );
      res.status(500).send({ message: "Failed to create user" });
    }
  }
);

export default router;
