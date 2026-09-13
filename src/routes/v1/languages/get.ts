import { Router } from "express";
import rateLimit from "@middleware/rateLimit";
import { asyncHandler } from "@middleware/asyncHandler";
import { listLanguageUsage } from "@features/languages/service";

const router = Router();
router.get("/", rateLimit(), asyncHandler(async (_req, res) => {
  res.send({ message: "Languages fetched", data: await listLanguageUsage(res.locals.tenantId) });
}));
export default router;
