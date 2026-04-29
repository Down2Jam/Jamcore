import { Router } from "express";
import authUser from "@middleware/authUser";
import getUser from "@loaders/getUser";
import assertUserAdmin from "@guards/assertUserAdmin";
import rateLimit from "@middleware/rateLimit";
import { asyncHandler } from "@middleware/asyncHandler";
import { createEmojiSchema, createGlobalEmoji } from "@features/emojis";
import { requireRequestUser } from "@lib/locals";
import { parseBody } from "../../../lib/request.js";

const router = Router();

router.post(
  "/",
  rateLimit(),
  authUser,
  getUser,
  assertUserAdmin,
  asyncHandler(async (req, res) => {
    const input = parseBody(req, createEmojiSchema);
    const user = requireRequestUser(res);
    const emoji = await createGlobalEmoji({
      actorId: user.id,
      input,
      tenantId: res.locals.tenantId,
    });

    res.status(201).json({ message: "Emoji created", data: emoji });
  }),
);

export default router;

