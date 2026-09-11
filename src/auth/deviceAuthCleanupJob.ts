import cron, { type ScheduledTask } from "node-cron";

import logger from "../infra/logger.js";
import { cleanupExpiredDeviceAuthRequests } from "./gameToken.js";

const DEVICE_AUTH_CLEANUP_CRON = "*/10 * * * *";

export function startDeviceAuthCleanupJob(): ScheduledTask {
  return cron.schedule(DEVICE_AUTH_CLEANUP_CRON, async () => {
    try {
      const deleted = await cleanupExpiredDeviceAuthRequests();
      if (deleted > 0) {
        logger.info(`Cleaned up ${deleted} stale device auth request(s).`);
      }
    } catch (error) {
      logger.error("Error cleaning up device auth requests:", error);
    }
  });
}
