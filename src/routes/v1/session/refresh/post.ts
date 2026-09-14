import { Router } from "express";
import rateLimit from "../../../../middleware/rateLimit.js";
import { asyncHandler } from "../../../../middleware/asyncHandler.js";
import { assertSessionOrigin, clearSession, writeSession } from "../../../../auth/session.js";
import { rotateSessionTokens } from "../../../../auth/tokenStore.js";
import { UnauthorizedError } from "../../../../lib/errors.js";
const router = Router();
router.post("/", rateLimit(60), asyncHandler(async (req, res) => {
  assertSessionOrigin(req);
  res.setHeader("Cache-Control", "no-store");
  try {
    const pair = await rotateSessionTokens(req.cookies?.refreshToken ?? "", res.locals.tenantId);
    writeSession(res, pair.refreshToken, pair.accessToken, pair.expiresAt);
    res.json({ token: pair.accessToken, expiresIn: Math.max(0, Math.floor((pair.accessExpiresAt.getTime() - Date.now()) / 1000)) });
  } catch (error) {
    if (error instanceof UnauthorizedError) clearSession(res);
    throw error;
  }
}));
export default router;
