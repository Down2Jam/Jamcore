import { Router } from "express";
import rateLimit from "@middleware/rateLimit";
import authUser from "@middleware/authUser";
import getUser from "@loaders/getUser";
import { asyncHandler } from "../../../../middleware/asyncHandler.js";
import { ForbiddenError } from "@lib/errors";
import { listAdminImages } from "@features/admin-images";

const router = Router();

router.get(
  "/",
  rateLimit(20),
  authUser,
  getUser,
  asyncHandler(async (_req, res) => {
    if (!res.locals.user?.admin) {
      throw new ForbiddenError("Admin only.");
    }
    const data = await listAdminImages();

    res.status(200).send({
      message: "Images fetched",
      data,
    });
  }),
);

export default router;

