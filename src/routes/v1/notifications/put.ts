import express from "express";
import { z } from "zod";

import authUser from "../../../middleware/authUser";
import getUser from "../../../loaders/getUser.js";
import rateLimit from "@middleware/rateLimit";
import { asyncHandler } from "../../../middleware/asyncHandler.js";
import {
  archiveNotification,
  markAllNotificationsRead,
  markNotificationRead,
  notificationIdParamsSchema,
} from "@features/notifications";
import { requireRequestUser } from "@lib/locals";
import { parseBody, parseParams } from "../../../lib/request.js";

const router = express.Router();

const actionSchema = z.object({
  action: z.enum(["read", "unread", "archive"]),
});

router.put(
  "/read-all",
  rateLimit(),
  authUser,
  getUser,
  asyncHandler(async (_req, res) => {
    const result = await markAllNotificationsRead(requireRequestUser(res));
    res.json(result);
  }),
);

router.put(
  "/:id",
  rateLimit(),
  authUser,
  getUser,
  asyncHandler(async (req, res) => {
    const { id } = parseParams(req, notificationIdParamsSchema);
    const { action } = parseBody(req, actionSchema);
    const actor = requireRequestUser(res);
    const result =
      action === "archive"
        ? await archiveNotification({ notificationId: id, actor })
        : await markNotificationRead({
            notificationId: id,
            actor,
            read: action === "read",
          });
    res.json(result);
  }),
);

export default router;
