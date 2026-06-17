import { Router } from "express";
import rateLimit from "@middleware/rateLimit";
import authUser from "@middleware/authUser";
import getUser from "@loaders/getUser";
import { asyncHandler } from "@middleware/asyncHandler";
import {
  createEmojiSchema,
  createGameEmoji,
  gameEmojiParamsSchema,
} from "@features/emojis";
import { requireRequestUser } from "@lib/locals";
import { parseBody, parseParams } from "../../../../lib/request.js";

const router = Router();

router.post(
  "/:gameSlug",
  rateLimit(),
  authUser,
  getUser,
  asyncHandler(async (req, res) => {
    const { gameSlug } = parseParams(req, gameEmojiParamsSchema);
    const input = parseBody(req, createEmojiSchema);
    const user = requireRequestUser(res);
    const emoji = await createGameEmoji({
      actorId: user.id,
      gameSlug,
      input,
      tenantId: res.locals.tenantId,
    });

    res.status(201).json({
      message: "Emoji created",
      data: emoji,
    });
  }),
);

export default router;

