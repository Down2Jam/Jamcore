import { Router } from "express";

import rateLimit from "@middleware/rateLimit";
import { parseBody } from "@lib/request";
import authUser from "../../../../middleware/authUser.js";
import getUser from "../../../../loaders/getUser.js";
import { asyncHandler } from "../../../../middleware/asyncHandler.js";
import { denyDeviceAuthRequest, deviceUserCodeSchema } from "../../../../auth/gameToken.js";

const router = Router();

router.post(
  "/",
  rateLimit(),
  authUser,
  getUser,
  asyncHandler(async (req, res) => {
    const { userCode } = parseBody(req, deviceUserCodeSchema);

    await denyDeviceAuthRequest({ userCode });

    res.status(200).send({ message: "Device request denied" });
  }),
);

export default router;
