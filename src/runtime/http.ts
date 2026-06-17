import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import type { Express, Request, Response } from "express";

import { appConfig } from "../config/app.js";
import { env } from "../config/env.js";
import { createFederationRouter } from "../features/federation/index.js";
import { errorHandler, notFoundHandler } from "../middleware/errorHandler.js";
import { requestContext } from "../middleware/requestContext.js";
import { responseEnvelope } from "../middleware/responseEnvelope.js";
import { createApiRouter } from "../routes/api.js";
import { createOperationalRouter } from "../routes/operational.js";
import { createV1Router } from "../routes/v1/v1.js";

export function createHttpApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("etag", "strong");
  app.set("trust proxy", 1);
  return app;
}

export function configureHttpMiddleware(app: Express) {
  app.use(requestContext);
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          "script-src": [
            "'self'",
            (_req, res) => `'nonce-${(res as Response).locals.cspNonce}'`,
          ],
        },
      },
    }),
  );
  app.use(
    cors({
      origin: env.clientOrigin,
      credentials: true,
      allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key"],
      exposedHeaders: [
        "Authorization",
        "Content-Disposition",
        "Content-Type",
        "X-Idempotent-Replay",
        "X-Request-Id",
      ],
    }),
  );
  app.use(cookieParser());
  app.use(
    express.json({
      limit: appConfig.api.limits.jsonBody,
      type: [
        "application/json",
        "application/activity+json",
        'application/ld+json; profile="https://www.w3.org/ns/activitystreams"',
      ],
      verify: (req, _res, buffer) => {
        (req as Request).rawBody = buffer.toString("utf8");
      },
    }),
  );
}

export async function mountHttpRoutes(app: Express) {
  app.use(createOperationalRouter());
  app.use(createFederationRouter());
  app.use("/api/v1", responseEnvelope, await createV1Router());
  app.use("/api", createApiRouter());
}

export function configureHttpErrorHandling(app: Express) {
  app.use(notFoundHandler);
  app.use(errorHandler);
}
