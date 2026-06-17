import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { appConfig } from "../../config/app.js";
import { authorizationContext } from "../../middleware/authorizationContext.js";
import { idempotencyMiddleware } from "../../middleware/idempotency.js";
import { mutationBodyGuard } from "../../middleware/mutationBodyGuard.js";
import { mutationCacheInvalidation } from "../../middleware/mutationCacheInvalidation.js";
import { renderVersionDocsPage } from "../docs.js";
import { loadRoutes } from "./loadRoutes.js";
import { getStaticV1Routes } from "./registry.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function createV1Router() {
  const router = express.Router();

  router.use((_req, res, next) => {
    res.setHeader("X-API-Version", "v1");
    res.setHeader(
      "X-API-Supported-Versions",
      appConfig.api.supportedVersions.join(","),
    );
    next();
  });
  router.get("/", (req, res) => {
    res.setHeader("Cache-Control", "public, max-age=300");
    res.type("html");
    const requestOrigin = `${req.protocol}://${req.get("host")}`;
    res.send(
      renderVersionDocsPage({
        appName: res.locals.tenant?.appName ?? appConfig.appName,
        version: "v1",
        tenant: res.locals.tenant,
        publicOrigin: requestOrigin,
        scriptNonce: res.locals.cspNonce,
      }),
    );
  });
  router.use(idempotencyMiddleware);
  router.use(mutationBodyGuard);
  router.use(mutationCacheInvalidation);
  router.use(authorizationContext);

  for (const route of getStaticV1Routes()) {
    router.use(route.path, route.router as express.Router);
  }

  await loadRoutes(router, __dirname);

  return router;
}
