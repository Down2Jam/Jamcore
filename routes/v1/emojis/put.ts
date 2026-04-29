import { Router } from "express";
import authUser from "@middleware/authUser";
import getUser from "@loaders/getUser";
import rateLimit from "@middleware/rateLimit";
import { asyncHandler } from "@middleware/asyncHandler";
import {
  updateEmoji,
  updateEmojiParamsSchema,
  updateEmojiSchema,
} from "@features/emojis";
import { requireRequestUser } from "@lib/locals";
import { parseBody, parseParams } from "../../../lib/request.js";

const router = Router();

router.put(
  "/:id",
  rateLimit(),
  authUser,
  getUser,
  asyncHandler(async (req, res) => {
    const { id } = parseParams(req, updateEmojiParamsSchema);
    const input = parseBody(req, updateEmojiSchema);
    const user = requireRequestUser(res);
    const emoji = await updateEmoji({
      emojiId: id,
      actor: user,
      input,
      tenantId: res.locals.tenantId,
    });

    res.json({ message: "Emoji updated", data: emoji });
  }),
);

export default router;

