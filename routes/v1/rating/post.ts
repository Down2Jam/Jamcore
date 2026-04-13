import express from "express";
import authUser from "../../../middleware/authUser";
import getUser from "../../../middleware/getUser";
import getPostOrComment from "../../../middleware/getPostOrComment";
import db from "../../../helper/db";
import getGame from "@middleware/getGame";
import { PageVersion } from "@prisma/client";

var router = express.Router();

router.post(
  "/",

  authUser,
  getUser,
  getGame,

  async function (req, res) {
    const { categoryId, value, gamePageId, pageVersion } = req.body;
    let targetGamePageId = Number(gamePageId);

    if (!Number.isInteger(targetGamePageId)) {
      const targetPageVersion =
        pageVersion === "POST_JAM" ? PageVersion.POST_JAM : PageVersion.JAM;
      const targetGamePage = await db.gamePage.findFirst({
        where: {
          gameId: res.locals.game.id,
          version: targetPageVersion,
        },
        select: {
          id: true,
        },
      });

      if (!targetGamePage) {
        return res.status(404).send({ message: "Game page missing." });
      }

      targetGamePageId = targetGamePage.id;
    }

    const currentRating = await db.rating.findUnique({
      where: {
        gamePageId_categoryId_userId: {
          gamePageId: targetGamePageId,
          userId: res.locals.user.id,
          categoryId,
        },
      },
    });

    if (currentRating) {
      await db.rating.update({
        where: {
          id: currentRating.id,
        },
        data: {
          value: value,
        },
      });
    } else {
      await db.rating.create({
        data: {
          value: value,
          gameId: res.locals.game.id,
          gamePageId: targetGamePageId,
          userId: res.locals.user.id,
          categoryId,
        },
      });
    }

    res.send({ message: "Rating created" });
  }
);

export default router;
