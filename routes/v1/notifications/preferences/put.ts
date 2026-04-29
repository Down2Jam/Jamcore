import express from "express";

import authUser from "../../../../middleware/authUser";
import getUser from "../../../../loaders/getUser.js";
import { asyncHandler } from "../../../../middleware/asyncHandler.js";
import {
  notificationPreferencesSchema,
  updateNotificationPreferences,
} from "@features/notifications";
import { requireRequestUser } from "@lib/locals";
import { parseBody } from "../../../../lib/request.js";

const router = express.Router();

router.put(
  "/",
  authUser,
  getUser,
  asyncHandler(async (req, res) => {
    const input = parseBody(req, notificationPreferencesSchema);
    res.json(await updateNotificationPreferences({
      actor: requireRequestUser(res),
      input,
    }));
  }),
);

export default router;
