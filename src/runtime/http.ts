import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import type { Express, Request, Response } from "express";
import fs from "node:fs/promises";
import { pipeline } from "node:stream/promises";

import { appConfig } from "../config/app.js";
import { env } from "../config/env.js";
import { createFederationRouter } from "../features/federation/index.js";
import { errorHandler, notFoundHandler } from "../middleware/errorHandler.js";
import { requestContext } from "../middleware/requestContext.js";
import { responseEnvelope } from "../middleware/responseEnvelope.js";
import { createApiRouter } from "../routes/api.js";
import { createOperationalRouter } from "../routes/operational.js";
import { createV1Router } from "../routes/v1/v1.js";
import { resolveWebBuildAsset } from "../features/games/web-build.service.js";
import { GetS3FileStream, HeadS3File, IsUsingS3 } from "../infra/s3.js";
import { parseByteRange } from "../lib/byteRange.js";

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
  app.get("/game-builds/:buildId/{*assetPath}", async (req, res, next) => {
    try {
      const requestedPath = Array.isArray(req.params.assetPath)
        ? req.params.assetPath.join("/")
        : String(req.params.assetPath ?? "index.html");
      const asset = resolveWebBuildAsset(req.params.buildId, requestedPath);
      if (!asset) return next();
      res.setHeader("Content-Type", asset.contentType);
      if (asset.contentEncoding) res.setHeader("Content-Encoding", asset.contentEncoding);
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      res.setHeader("Content-Security-Policy", `sandbox allow-scripts allow-pointer-lock; default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'self' https: wss:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self' ${env.clientOrigin}`);
      res.removeHeader("X-Frame-Options");
      res.setHeader("Referrer-Policy", "no-referrer");
      res.setHeader(
        "Permissions-Policy",
        "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), clipboard-read=(), clipboard-write=()",
      );
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Accept-Ranges", "bytes");
      if (await IsUsingS3()) {
        const rangeHeader = req.headers.range;
        if (req.method === "HEAD" || rangeHeader) {
          const metadata = await HeadS3File(asset.storageFolder, asset.storageName);
          if (!metadata) return next();
          const size = metadata.contentLength;
          if (typeof size !== "number") return next();
          if (req.method === "HEAD") {
            res.setHeader("Content-Length", String(size));
            res.end();
            return;
          }
          const range = parseByteRange(rangeHeader!, size);
          if (!range) {
            res.setHeader("Content-Range", `bytes */${size}`);
            res.sendStatus(416);
            return;
          }
          const requestedRange = `bytes=${range.start}-${range.end}`;
          const file = await GetS3FileStream(
            asset.storageFolder,
            asset.storageName,
            requestedRange,
          );
          if (!file) return next();
          res.status(206);
          res.setHeader("Content-Range", `bytes ${range.start}-${range.end}/${size}`);
          res.setHeader("Content-Length", String(range.end - range.start + 1));
          await pipeline(file.body, res);
          return;
        }
        const file = await GetS3FileStream(asset.storageFolder, asset.storageName);
        if (!file) return next();
        if (typeof file.contentLength === "number") {
          res.setHeader("Content-Length", String(file.contentLength));
        }
        await pipeline(file.body, res);
        return;
      }
      await fs.access(asset.path);
      res.sendFile(asset.path);
    } catch {
      next();
    }
  });
  app.use(createOperationalRouter());
  app.use(createFederationRouter());
  app.use("/api/v1", responseEnvelope, await createV1Router());
  app.use("/api", createApiRouter());
}

export function configureHttpErrorHandling(app: Express) {
  app.use(notFoundHandler);
  app.use(errorHandler);
}
