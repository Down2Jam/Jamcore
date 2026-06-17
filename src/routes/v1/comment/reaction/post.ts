import { Router } from "express";

import rateLimit from "@middleware/rateLimit";
import authUser from "@middleware/authUser";
import getUser from "@loaders/getUser";
import { asyncHandler } from "../../../../middleware/asyncHandler.js";
import {
  toggleCommentReaction,
  toggleCommentReactionSchema,
} from "@features/reactions";
import { requireRequestUser } from "@lib/locals";
import { parseBody } from "../../../../lib/request.js";

const router = Router();

router.post(
  "/",
  rateLimit(),
  authUser,
  getUser,
  asyncHandler(async (req, res) => {
    const input = parseBody(req, toggleCommentReactionSchema);
    const user = requireRequestUser(res);
    const reactions = await toggleCommentReaction({
      input,
      userId: user.id,
      tenantId: res.locals.tenantId,
    });

    res.json({ message: "Reaction updated", data: reactions });
  }),
);

export default router;

