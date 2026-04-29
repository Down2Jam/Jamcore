import express from "express";

import { listPosts, listPostsQuerySchema } from "@features/posts";
import { asyncHandler } from "../../../middleware/asyncHandler.js";
import authUserOptional from "../../../middleware/authUserOptional.js";
import getUserOptional from "../../../loaders/getUserOptional.js";
import { parseQuery } from "../../../lib/request.js";

const router = express.Router();

router.get(
  "/",
  authUserOptional,
  getUserOptional,
  asyncHandler(async (req, res) => {
    const input = parseQuery(req, listPostsQuerySchema);
    const posts = await listPosts({
      ...input,
      user: input.user ?? res.locals.user?.slug,
    }, res.locals.tenantId);
    res.send(posts);
  }),
);

export default router;
