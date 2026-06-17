import type { Server } from "node:http";

import { createApp } from "../app.js";
import { env } from "../config/env.js";
import { ensureCoreTenantColumns } from "../infra/coreTenantStore.js";
import logger from "../infra/logger.js";
import { ensurePlatformTables } from "../infra/platformStore.js";
import { ensureSearchTables } from "../infra/searchStore.js";
import { ensureSearchBootstrap } from "../features/search/readiness.js";
import { startRuntimeModules, type RuntimeModules } from "./modules.js";

export type RuntimeBootstrapResult = {
  app: Awaited<ReturnType<typeof createApp>> | null;
  modules: RuntimeModules;
  server: Server | null;
};

function listen(app: Awaited<ReturnType<typeof createApp>>) {
  return new Promise<Server>((resolve) => {
    const server = app.listen(env.port, () => {
      logger.info(`Jamcore listening on port ${env.port}`);
      resolve(server);
    });
  });
}

export async function bootstrapApplication(): Promise<RuntimeBootstrapResult> {
  await ensurePlatformTables();
  await ensureCoreTenantColumns();
  await ensureSearchTables();
  await ensureSearchBootstrap();
  const shouldStartApi = env.runtimeRole === "api" || env.runtimeRole === "all";
  const shouldStartWorkers = env.runtimeRole === "worker" || env.runtimeRole === "all";

  const app = shouldStartApi ? await createApp() : null;
  const modules = shouldStartWorkers
    ? await startRuntimeModules()
    : { handles: [] };
  const server = app ? await listen(app) : null;

  return {
    app,
    modules,
    server,
  };
}
