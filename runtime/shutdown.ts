import type { Server } from "node:http";

import logger from "../infra/logger.js";
import type { RuntimeBootstrapResult } from "./bootstrap.js";
import { stopRuntimeModules } from "./modules.js";

function closeServer(server: Server) {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

export function installRuntimeShutdown(runtime: RuntimeBootstrapResult) {
  let shuttingDown = false;

  async function shutdown(reason: string, exitCode = 0) {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    logger.info(`Shutting down Jamcore (${reason})`);

    try {
      await stopRuntimeModules(runtime.modules);
      if (runtime.server) {
        await closeServer(runtime.server);
      }
      logger.info("Jamcore shutdown complete");
      process.exit(exitCode);
    } catch (error) {
      logger.error("Jamcore shutdown failed", error);
      process.exit(1);
    }
  }

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  process.on("unhandledRejection", (error) => {
    logger.error("Unhandled promise rejection", error);
    void shutdown("unhandledRejection", 1);
  });

  process.on("uncaughtException", (error) => {
    logger.error("Uncaught exception", error);
    void shutdown("uncaughtException", 1);
  });
}
