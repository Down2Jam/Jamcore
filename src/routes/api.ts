import { Router } from "express";

import { appConfig } from "../config/app.js";
import { renderApiLandingPage } from "./docs.js";

const router = Router();

router.get("/", (_req, res) => {
  res.setHeader("Cache-Control", "public, max-age=300");
  res.type("html");
  res.send(
    renderApiLandingPage({
      appName: res.locals.tenant?.appName ?? appConfig.appName,
      currentVersion: appConfig.api.currentVersion,
      supportedVersions: appConfig.api.supportedVersions,
      deprecationPolicy: appConfig.api.deprecationPolicy,
      scriptNonce: res.locals.cspNonce,
    }),
  );
});

export function createApiRouter() {
  return router;
}
