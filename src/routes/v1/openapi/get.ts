import { Router } from "express";

import { appConfig } from "../../../config/app.js";
import { buildOpenApiDocument } from "../../../contracts/openapi.js";

const router = Router();

router.get("/", (req, res) => {
  res.setHeader("Cache-Control", "public, max-age=300");
  res.locals.rawResponse = true;
  res.json(
    buildOpenApiDocument({
      appName: res.locals.tenant?.appName ?? appConfig.appName,
      tenant: res.locals.tenant,
    }),
  );
});

export default router;
