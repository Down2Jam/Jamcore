import { Router } from "express";
import rateLimit from "@middleware/rateLimit";
import { asyncHandler } from "../../../middleware/asyncHandler.js";
import { listTeamRoles } from "@features/taxonomies";

const router = Router();

/**
 * Route to get themes from the database.
 */
router.get(
  "/",
  rateLimit(),
  asyncHandler(async (_req, res) => {
    const roles = await listTeamRoles();

    res.send({ message: "Roles fetched", data: roles });
  }),
);

export default router;
