import { Router } from "express";
import rateLimit from "@middleware/rateLimit";
import { assertSessionOrigin, clearSession, getAuthorizationToken } from "../../../auth/session.js";
import { revokeSessionToken } from "../../../auth/tokenStore.js";
import { asyncHandler } from "../../../middleware/asyncHandler.js";

const router = Router();

/**
 * Route to delete a session from the database.
 * Used for logging out.
 */
router.delete(
  "/",
  rateLimit(),
  asyncHandler(async (req, res) => {
    assertSessionOrigin(req);
    await revokeSessionToken(req.cookies?.refreshToken ?? "", "refresh", res.locals.tenantId);
    await revokeSessionToken(getAuthorizationToken(req) ?? "", "access", res.locals.tenantId);
    clearSession(res);
    res.status(200);
    res.send({ message: "Logged out successfully" });
  })
);

export default router;
