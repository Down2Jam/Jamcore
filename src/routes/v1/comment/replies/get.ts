import { Router } from "express";
import authUserOptional from "../../../../middleware/authUserOptional.js";
import getUserOptional from "../../../../loaders/getUserOptional.js";
import { asyncHandler } from "../../../../middleware/asyncHandler.js";
import { parseQuery } from "../../../../lib/request.js";
import { commentRepliesQuerySchema, getCommentReplies } from "../../../../features/comments/read.service.js";

const router = Router();

router.get("/", authUserOptional, getUserOptional, asyncHandler(async (req, res) => {
  const { commentId } = parseQuery(req, commentRepliesQuerySchema);
  const data = await getCommentReplies({ commentId, user: res.locals.user, tenantId: res.locals.tenantId });
  res.send({ data });
}));

export default router;
