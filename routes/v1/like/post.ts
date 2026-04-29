import express from "express";
import authUser from "../../../middleware/authUser";
import getUser from "../../../loaders/getUser.js";
import getPostOrComment from "../../../loaders/getPostOrComment.js";
import { asyncHandler } from "../../../middleware/asyncHandler.js";
import { toggleLike } from "@features/reactions";
import { requireRequestUser } from "@lib/locals";

const router = express.Router();

router.post(
  "/",

  authUser,
  getUser,
  getPostOrComment,
  asyncHandler(async (_req, res) => {
    const user = requireRequestUser(res);
    const { post, comment } = res.locals;
    await toggleLike({
      userId: user.id,
      postId: post?.id,
      commentId: comment?.id,
    });

    res.send({ message: "Like created" });
  }),
);

export default router;
