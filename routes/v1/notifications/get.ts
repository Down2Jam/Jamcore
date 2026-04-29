import express from "express";

import authUser from "../../../middleware/authUser";
import getUser from "../../../loaders/getUser.js";
import rateLimit from "@middleware/rateLimit";
import { asyncHandler } from "../../../middleware/asyncHandler.js";
import { listNotifications, listNotificationsQuerySchema } from "@features/notifications";
import { requireRequestUser } from "@lib/locals";
import { parseQuery } from "../../../lib/request.js";

const router = express.Router();

router.get(
  "/",
  rateLimit(),
  authUser,
  getUser,
  asyncHandler(async (req, res) => {
    const input = parseQuery(req, listNotificationsQuerySchema);
    const result = await listNotifications({
      actor: requireRequestUser(res),
      input,
    });
    res.json(result);
  }),
);

export default router;
