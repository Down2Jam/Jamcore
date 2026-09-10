import logger from "../../infra/logger.js";
import { cleanupExpiredWebBuilds } from "./web-build.service.js";

const CLEANUP_INTERVAL_MS = 15 * 60 * 1000;

export function startWebBuildCleanupRuntime() {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const deleted = await cleanupExpiredWebBuilds();
      if (deleted > 0) {
        logger.info("Deleted expired web builds", { count: deleted });
      }
    } catch (error) {
      logger.warn("Failed to clean up expired web builds", {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      running = false;
    }
  };

  const interval = setInterval(() => void run(), CLEANUP_INTERVAL_MS);
  void run();
  return {
    name: "web-build-cleanup",
    stop() {
      clearInterval(interval);
    },
  };
}
