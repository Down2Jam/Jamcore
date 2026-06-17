import { Router } from "express";

import { asyncHandler } from "../../../middleware/asyncHandler.js";
import rateLimit from "@middleware/rateLimit";
import { createSession, createSessionSchema } from "@features/session";
import { parseBody } from "../../../lib/request.js";

const router = Router();

router.post(
  "/",
  rateLimit(),
  asyncHandler(async (req, res) => {
    const input = parseBody(req, createSessionSchema);
    const session = await createSession({
      ...input,
      res,
      tenantId: res.locals.tenantId,
    });
    res.send(session);
  }),
);

export default router;
