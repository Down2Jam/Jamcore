import { Router } from "express";
import authUser from "@middleware/authUser";
import getUser from "@loaders/getUser";
import rateLimit from "@middleware/rateLimit";
import { asyncHandler } from "@middleware/asyncHandler";
import {
  updateRecapVisibility,
  updateRecapVisibilitySchema,
} from "@features/recap";
import { parseBody } from "../../../lib/request.js";

const router = Router();

router.put(
  "/",
  rateLimit(),
  authUser,
  getUser,
  asyncHandler(async (req, res) => {
    const input = parseBody(req, updateRecapVisibilitySchema);
    const data = await updateRecapVisibility({
      jamId: input.jamId,
      jamSlug: input.jamSlug,
      isPublic: input.isPublic,
      actor: res.locals.user,
      tenantId: res.locals.tenantId,
    });

    return res.json({
      message: "Recap visibility updated",
      data,
    });
  }),
);

export default router;

