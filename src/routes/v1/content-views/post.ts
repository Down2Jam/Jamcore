import express from "express";
import { createHash } from "node:crypto";
import { z } from "zod";
import authUserOptional from "@middleware/authUserOptional";
import getUserOptional from "@loaders/getUserOptional";
import rateLimit from "@middleware/rateLimit";
import { asyncHandler } from "@middleware/asyncHandler";
import { parseBody } from "../../../lib/request.js";
import { isHumanView, recordContentView } from "../../../features/views/service.js";
import { env } from "../../../config/env.js";
import { incrementRateLimit } from "../../../infra/rateLimitStore.js";

const router = express.Router();
const schema = z.object({
  kind: z.enum(["game", "track"]), id: z.number().int().positive(), anonymousId: z.string().uuid(),
  trigger: z.enum(["page", "playback"]), dwellMs: z.number().int().min(2000).max(120000).optional(),
}).strict().refine(value => value.trigger === "page" ? value.dwellMs !== undefined : value.kind === "track");

router.post("/", rateLimit(120), authUserOptional, getUserOptional, asyncHandler(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const origin = req.get("Origin");
  const expectedOrigin = new URL(res.locals.tenant?.publicOrigin ?? env.clientOrigin).origin;
  if ((!origin || origin === expectedOrigin) && isHumanView(req)) {
    const input = parseBody(req, schema);
    const identity = res.locals.user ? `account:${res.locals.user.id}` : `anon:${input.anonymousId}`;
    const key = createHash("sha256").update(JSON.stringify([res.locals.tenantId ?? "", identity])).digest("hex");
    const limit = await incrementRateLimit(`content-views:${key}`, 60_000);
    if (limit.count > 20) { res.setHeader("Retry-After", "60"); res.status(429).end(); return; }
    await recordContentView({ ...input, userId: res.locals.user?.id, tenantId: res.locals.tenantId });
  }
  // Deliberately reveal neither totals nor whether this visitor was counted.
  res.status(204).end();
}));
export default router;
