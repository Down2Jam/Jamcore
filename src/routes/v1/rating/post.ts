import express from "express";

import getGame from "@loaders/getGame";
import authUser from "../../../middleware/authUser.js";
import getUser from "../../../loaders/getUser.js";
import { asyncHandler } from "../../../middleware/asyncHandler.js";
import {
  createGameRatingSchema,
  saveGameRating,
} from "@features/ratings";
import { requireRequestUser } from "@lib/locals";
import { parseBody } from "../../../lib/request.js";

var router = express.Router();

router.post(
  "/",

  authUser,
  getUser,
  getGame,
  asyncHandler(async (req, res) => {
    const input = parseBody(req, createGameRatingSchema);
    const user = requireRequestUser(res);
    await saveGameRating({
      gameId: res.locals.game.id,
      gamePageId: input.gamePageId,
      pageVersion: input.pageVersion,
      categoryId: input.categoryId,
      value: input.value,
      userId: user.id,
      tenantId: res.locals.tenantId,
    });

    res.send({ message: "Rating created" });
  }),
);

export default router;

