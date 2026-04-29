import express from "express";

import authUser from "../../../../middleware/authUser";
import getUser from "../../../../loaders/getUser.js";
import { asyncHandler } from "../../../../middleware/asyncHandler.js";
import { requireRequestUser } from "../../../../lib/locals.js";
import { getPostAutosaves } from "../../../../features/posts/autosave.service.js";

const router = express.Router();

router.get(
  "/",
  authUser,
  getUser,
  asyncHandler(async (_req, res) => {
    res.json(await getPostAutosaves({
      actor: requireRequestUser(res),
      tenantId: res.locals.tenantId,
    }));
  }),
);

export default router;
