import { Router } from "express";

import rateLimit from "@middleware/rateLimit";
import { parseBody } from "@lib/request";
import { ForbiddenError, NotFoundError } from "@lib/errors";
import { asyncHandler } from "../../../../middleware/asyncHandler.js";
import { deviceCodeSchema, pollDeviceAuthRequest } from "../../../../auth/gameToken.js";

const router = Router();

router.post(
  "/",
  rateLimit(),
  asyncHandler(async (req, res) => {
    const { deviceCode } = parseBody(req, deviceCodeSchema);
    const result = await pollDeviceAuthRequest({ deviceCode });

    if (result.status === "denied") {
      throw new ForbiddenError("Device authorization was denied");
    }

    if (result.status === "expired") {
      throw new NotFoundError("Device code not found or expired");
    }

    res.status(200).send(result);
  }),
);

export default router;
