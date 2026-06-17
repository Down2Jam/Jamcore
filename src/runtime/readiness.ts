import fs from "node:fs/promises";
import path from "node:path";

import { appConfig } from "../config/app.js";
import { listConfiguredServiceKeys } from "../auth/service.js";
import { env } from "../config/env.js";
import { pingRedis } from "../infra/redis.js";
import { getSearchReadinessStatus } from "../features/search/readiness.js";

async function canWriteFile(targetPath: string) {
  const resolvedPath = path.resolve(process.cwd(), targetPath);
  await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
  const handle = await fs.open(resolvedPath, "a");
  await handle.close();
  return resolvedPath;
}

export async function runReadinessChecks() {
  const checks = [];

  checks.push({
    name: "token-secret",
    ok: Boolean(env.tokenSecret),
    detail: env.tokenSecret ? "configured" : "missing TOKEN_SECRET",
  });

  checks.push({
    name: "service-api-keys",
    ok: true,
    detail: `${(await listConfiguredServiceKeys()).length} configured`,
  });

  if (env.cacheProvider === "redis" || env.rateLimitProvider === "redis") {
    const redis = await pingRedis();
    checks.push({
      name: "redis",
      ok: redis.available,
      detail: redis.available ? "connected" : "unavailable",
    });
  }

  checks.push({
    name: "audit-log",
    ok: true,
    detail: await canWriteFile(appConfig.platform.auditLogPath),
  });

  checks.push({
    name: "webhook-log",
    ok: true,
    detail: await canWriteFile(appConfig.platform.webhookLogPath),
  });

  checks.push({
    name: "webhook-endpoints",
    ok:
      !appConfig.platform.webhooks.enabled ||
      appConfig.platform.webhooks.endpoints.length > 0,
    detail: appConfig.platform.webhooks.enabled
      ? `${appConfig.platform.webhooks.endpoints.length} configured`
      : "disabled",
  });

  if (appConfig.federation.enabled && appConfig.federation.security.enabled) {
    const privateKeyPath = path.resolve(
      process.cwd(),
      appConfig.federation.security.privateKeyPath,
    );
    const publicKeyPath = path.resolve(
      process.cwd(),
      appConfig.federation.security.publicKeyPath,
    );

    checks.push({
      name: "federation-private-key",
      ok: await fs
        .access(privateKeyPath)
        .then(() => true)
        .catch(() => false),
      detail: privateKeyPath,
    });
    checks.push({
      name: "federation-public-key",
      ok: await fs
        .access(publicKeyPath)
        .then(() => true)
        .catch(() => false),
      detail: publicKeyPath,
    });
  }

  const searchReadiness = await getSearchReadinessStatus();
  checks.push({
    name: "search-index",
    ok: searchReadiness.ready,
    detail: searchReadiness.ready
      ? `${searchReadiness.documentCount} indexed documents`
      : searchReadiness.reason,
  });

  return {
    ok: checks.every((check) => check.ok),
    checks,
  };
}
