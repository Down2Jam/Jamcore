import { Router } from "express";

import rateLimit from "@middleware/rateLimit";
import { parseBody } from "@lib/request";
import { asyncHandler } from "../../../../middleware/asyncHandler.js";
import { startDeviceAuthRequest, startDeviceAuthRequestSchema } from "../../../../auth/gameToken.js";

const router = Router();

router.post(
  "/",
  rateLimit(),
  asyncHandler(async (req, res) => {
    const { clientName, gameSlug } = parseBody(req, startDeviceAuthRequestSchema);
    const request = await startDeviceAuthRequest({ clientName, gameSlug });

    res.status(200).send(request);
  }),
);

export default router;
