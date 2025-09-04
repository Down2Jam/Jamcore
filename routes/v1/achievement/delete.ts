import express from "express";
import authUser from "../../../middleware/authUser";
import getUser from "../../../middleware/getUser";
import getPostOrComment from "../../../middleware/getPostOrComment";
import db from "../../../helper/db";
import getGame from "@middleware/getGame";

var router = express.Router();

router.delete(
  "/",

  authUser,
  getUser,

  async function (req, res) {
    const { achievementId } = req.body;

    const achievement = await db.achievement.findFirst({
      where: {
        id: achievementId,
      },
    });

    if (!achievement) {
      res.status(404);
      res.send({ message: "No achievement exists with that id" });
      return;
    }

    await db.achievement.update({
      where: {
        id: achievementId,
      },
      data: {
        users: {
          disconnect: { id: res.locals.user.id },
        },
      },
    });

    res.send({ message: "Achievement connection deleted" });
  }
);

export default router;
