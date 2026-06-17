import { Router } from "express";
import rateLimit from "@middleware/rateLimit";
import authUser from "@middleware/authUser";
import getUser from "@loaders/getUser";
import { asyncHandler } from "@middleware/asyncHandler";
import { deleteEmoji, deleteEmojiParamsSchema } from "@features/emojis";
import { requireRequestUser } from "@lib/locals";
import { parseParams } from "../../../lib/request.js";

const router = Router();

router.delete(
  "/:id",
  rateLimit(),
  authUser,
  getUser,
  asyncHandler(async (req, res) => {
    const { id } = parseParams(req, deleteEmojiParamsSchema);
    const user = requireRequestUser(res);
    await deleteEmoji({
      emojiId: id,
      actor: user,
      tenantId: res.locals.tenantId,
    });

    res.json({ message: "Emoji deleted" });
  }),
);

export default router;

