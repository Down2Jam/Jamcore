import express from "express";
import authUser from "../../../middleware/authUser";
import getUser from "../../../middleware/getUser";
import db from "../../../helper/db";

var router = express.Router();

router.post(
  "/",

  authUser,
  getUser,

  async function (req, res) {
    const { achievementId } = req.body;

    const achievement = await db.gamePageAchievement.findFirst({
      where: {
        id: achievementId,
      },
    });

    if (!achievement) {
      res.status(404);
      res.send({ message: "No achievement exists with that id" });
      return;
    }

    await db.gamePageAchievement.update({
      where: {
        id: achievementId,
      },
      data: {
        users: {
          connect: { id: res.locals.user.id },
        },
      },
    });

    res.send({ message: "Achievement connection created" });
  }
);

export default router;
