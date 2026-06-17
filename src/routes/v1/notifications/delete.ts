import express from "express";
import authUser from "../../../middleware/authUser";
import getUser from "../../../loaders/getUser.js";
import rateLimit from "@middleware/rateLimit";
import { asyncHandler } from "../../../middleware/asyncHandler.js";
import {
  deleteNotificationById,
  deleteNotificationParamsSchema,
} from "@features/notifications";
import { requireRequestUser } from "@lib/locals";
import { parseParams } from "../../../lib/request.js";

const router = express.Router();

router.delete(
  "/:id",
  rateLimit(),
  authUser,
  getUser,
  asyncHandler(async (req, res) => {
    const { id } = parseParams(req, deleteNotificationParamsSchema);
    const user = requireRequestUser(res);

    await deleteNotificationById({
      notificationId: id,
      actor: user,
    });

    res.status(200).send({ message: "Notification deleted" });
  }),
);

export default router;
