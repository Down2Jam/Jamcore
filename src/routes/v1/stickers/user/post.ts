import { Router } from "express";
import rateLimit from "@middleware/rateLimit";
import authUser from "@middleware/authUser";
import getUser from "@loaders/getUser";
import { asyncHandler } from "@middleware/asyncHandler";
import { createEmojiSchema, createUserSticker } from "@features/emojis";
import { requireRequestUser } from "@lib/locals";
import { parseBody } from "../../../../lib/request.js";

const router = Router();

router.post(
  "/",
  rateLimit(),
  authUser,
  getUser,
  asyncHandler(async (req, res) => {
    const input = parseBody(req, createEmojiSchema);
    const user = requireRequestUser(res);
    const sticker = await createUserSticker({
      actorId: user.id,
      input,
      tenantId: res.locals.tenantId,
    });

    res.status(201).json({ message: "Sticker created", data: sticker });
  }),
);

export default router;
