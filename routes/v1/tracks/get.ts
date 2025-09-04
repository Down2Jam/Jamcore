import express from "express";
import { PostTime } from "../../../types/PostTimes";
import db from "@helper/db";

var router = express.Router();

router.get(
  "/",

  async function (req, res) {
    const tracks = await db.track.findMany({
      include: {
        composer: true,
        game: true,
      },
    });

    res.json({ message: "Fetched tracks", data: tracks });
  }
);

export default router;
