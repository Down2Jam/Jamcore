import express from "express";

import authUser from "../../../../middleware/authUser";
import getUser from "../../../../loaders/getUser.js";
import { asyncHandler } from "../../../../middleware/asyncHandler.js";
import { requireRequestUser } from "../../../../lib/locals.js";
import {
  autosavePostSchema,
  savePostAutosave,
} from "../../../../features/posts/autosave.service.js";
import { parseBody } from "../../../../lib/request.js";

const router = express.Router();

router.post(
  "/",
  authUser,
  getUser,
  asyncHandler(async (req, res) => {
    const input = parseBody(req, autosavePostSchema);
    res.json(await savePostAutosave({
      actor: requireRequestUser(res),
      input,
      tenantId: res.locals.tenantId,
    }));
  }),
);

export default router;
