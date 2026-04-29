import { Router } from "express";
import rateLimit from "@middleware/rateLimit";
import { asyncHandler } from "@middleware/asyncHandler";
import { resolveMention, resolveMentionQuerySchema } from "@features/mentions";
import { parseQuery } from "@lib/request";

const router = Router();

router.get(
  "/",
  rateLimit(),
  asyncHandler(async (req, res) => {
    const input = parseQuery(req, resolveMentionQuerySchema);
    const data = await resolveMention(input);

    res.json({ message: "Mention resolved", data });
  }),
);

export default router;
