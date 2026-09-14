import cron from "node-cron";
import db from "../infra/db.js";
import logger from "../infra/logger.js";

export function startTokenCleanupJob() {
  return cron.schedule("17 * * * *", async () => {
    try {
      const now = new Date();
      // Retain consumed refresh tokens while the family is alive for replay detection.
      await db.authSession.deleteMany({ where: { expiresAt: { lt: now } } });
      await db.accessToken.deleteMany({ where: { expiresAt: { lt: now } } });
      await db.oAuthCode.deleteMany({ where: { expiresAt: { lt: now } } });
    } catch (error) { logger.error("Token cleanup failed", { error }); }
  });
}
