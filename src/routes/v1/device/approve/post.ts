import { Router } from "express";

import rateLimit from "@middleware/rateLimit";
import { parseBody } from "@lib/request";
import { requireRequestUser } from "@lib/locals";
import authUser from "../../../../middleware/authUser.js";
import getUser from "../../../../loaders/getUser.js";
import { asyncHandler } from "../../../../middleware/asyncHandler.js";
import { approveDeviceAuthRequest, deviceUserCodeSchema } from "../../../../auth/gameToken.js";

const router = Router();

router.post(
  "/",
  rateLimit(),
  authUser,
  getUser,
  asyncHandler(async (req, res) => {
    const { userCode } = parseBody(req, deviceUserCodeSchema);
    const user = requireRequestUser(res);

    const clientName = await approveDeviceAuthRequest({ userCode, userId: user.id });

    res.status(200).send({ message: "Device approved", clientName });
  }),
);

export default router;
