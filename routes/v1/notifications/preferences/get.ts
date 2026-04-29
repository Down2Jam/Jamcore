import express from "express";

import authUser from "../../../../middleware/authUser";
import getUser from "../../../../loaders/getUser.js";
import { asyncHandler } from "../../../../middleware/asyncHandler.js";
import { getNotificationPreferences } from "@features/notifications";
import { requireRequestUser } from "@lib/locals";

const router = express.Router();

router.get(
  "/",
  authUser,
  getUser,
  asyncHandler(async (_req, res) => {
    res.json(await getNotificationPreferences(requireRequestUser(res)));
  }),
);

export default router;
