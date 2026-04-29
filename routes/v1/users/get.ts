import { Router } from "express";

import { listUsers, listUsersQuerySchema } from "@features/users";
import rateLimit from "@middleware/rateLimit";
import { asyncHandler } from "../../../middleware/asyncHandler.js";
import { parseQuery } from "../../../lib/request.js";

const router = Router();

router.get(
  "/",
  rateLimit(),
  asyncHandler(async (req, res) => {
    const input = parseQuery(req, listUsersQuerySchema);
    const users = await listUsers({
      ...input,
      tenantId: res.locals.tenantId,
    });

    res.send({ message: "Users fetched", data: users });
  }),
);

export default router;
