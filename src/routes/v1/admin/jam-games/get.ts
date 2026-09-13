import { Router } from "express";
import authUser from "../../../../middleware/authUser.js";
import getUser from "../../../../loaders/getUser.js";
import { requireRequestUser } from "../../../../lib/locals.js";
import { asyncHandler } from "../../../../middleware/asyncHandler.js";
import { listCurrentJamGames } from "../../../../features/games/inspection.service.js";

const router = Router();
router.get("/", authUser, getUser, asyncHandler(async (_req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.json({ data: await listCurrentJamGames(requireRequestUser(res), res.locals.tenantId) });
}));
export default router;
