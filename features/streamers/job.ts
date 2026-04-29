import cron, { type ScheduledTask } from "node-cron";

import { env } from "../../config/env.js";
import logger from "../../infra/logger.js";
import { updateFeaturedStreamers } from "./service.js";

export function startFeaturedStreamersJob(): ScheduledTask {
  return cron.schedule(env.featuredStreamersCron, async () => {
    logger.info("Running updateFeaturedStreamers...");

    try {
      await updateFeaturedStreamers();
      logger.info("Successfully updated featured streamers.");
    } catch (error) {
      logger.error("Error updating featured streamers:", error);
    }
  });
}
