import express from "express";
import authUser from "../../../middleware/authUser";
import getUser from "../../../middleware/getUser";
import getPostOrComment from "../../../middleware/getPostOrComment";
import db from "../../../helper/db";
import getGame from "@middleware/getGame";

var router = express.Router();

router.post(
  "/",

  authUser,
  getUser,
  getGame,

  async function (req, res) {
    const { categoryId, value } = req.body;

    const currentRating = await db.rating.findFirst({
      where: {
        gameId: res.locals.game.id,
        userId: res.locals.user.id,
        categoryId,
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
          userId: res.locals.user.id,
          categoryId,
        },
      });
    }

    res.send({ message: "Rating created" });
  }
);

export default router;
