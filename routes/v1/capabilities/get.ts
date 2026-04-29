import { Router } from "express";

import { appConfig } from "../../../config/app.js";
import { env } from "../../../config/env.js";
import { asyncHandler } from "../../../middleware/asyncHandler.js";

const router = Router();

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json({
      api: {
        currentVersion: appConfig.api.currentVersion,
        supportedVersions: appConfig.api.supportedVersions,
        deprecationPolicy: appConfig.api.deprecationPolicy,
      },
      auth: {
        userSession: {
          loginPath: `/api/${appConfig.api.currentVersion}/session`,
          accessTokenHeader: "Authorization",
          refreshCookie: "refreshToken",
        },
        serviceKeys: {
          supported: true,
          headers: ["x-api-key", "Authorization: ApiKey <key>"],
        },
      },
      limits: appConfig.api.limits,
      uploads: appConfig.uploads,
      features: {
        federation: appConfig.federation.enabled,
        webhooks: appConfig.platform.webhooks.enabled,
        idempotency: appConfig.platform.idempotency.enabled,
        multiTenant: appConfig.platform.multiTenant.strictIsolation,
        cacheProvider: env.cacheProvider,
        rateLimitProvider: env.rateLimitProvider,
      },
    });
  }),
);

export default router;
