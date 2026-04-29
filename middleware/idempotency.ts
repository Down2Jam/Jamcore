import { createHash } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

import { appConfig } from "../config/app.js";
import {
  claimIdempotencyRecord,
  completeIdempotencyRecord,
  deleteIdempotencyRecord,
} from "../infra/idempotencyStore.js";
import { ConflictError } from "../lib/errors.js";

function buildRequestHash(req: Request) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        method: req.method,
        path: req.originalUrl,
        body: req.body ?? null,
      }),
    )
    .digest("hex");
}

export async function idempotencyMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (!appConfig.platform.idempotency.enabled) {
    next();
    return;
  }

  if (!["POST", "PUT", "DELETE"].includes(req.method)) {
    next();
    return;
  }

  const key = req.header("Idempotency-Key");
  if (!key) {
    next();
    return;
  }

  const requestHash = buildRequestHash(req);
  const claim = await claimIdempotencyRecord({
    key,
    requestHash,
    expiresAt: new Date(
      Date.now() + appConfig.platform.idempotency.ttlMs,
    ).toISOString(),
  });

  if (claim.state !== "claimed") {
    if (claim.state === "hash_mismatch") {
      next(new ConflictError("Idempotency key already used for a different request"));
      return;
    }

    if (claim.state === "in_progress") {
      next(new ConflictError("An identical request is already in progress"));
      return;
    }

    res.setHeader("X-Idempotent-Replay", "true");
    res.status(claim.record.responseStatus ?? 200);
    if (claim.record.responseKind === "json") {
      res.json(claim.record.responseBody ?? null);
      return;
    }
    if (claim.record.responseKind === "text") {
      res.send(String(claim.record.responseBody ?? ""));
      return;
    }
    res.end();
    return;
  }

  let responseBody: unknown;
  let responseKind: "json" | "text" | "empty" = "empty";

  const originalJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    responseBody = body;
    responseKind = "json";
    return originalJson(body);
  }) as Response["json"];

  const originalSend = res.send.bind(res);
  res.send = ((body?: unknown) => {
    if (responseKind === "empty") {
      responseBody = body;
      responseKind =
        body === undefined || body === null || body === ""
          ? "empty"
          : typeof body === "string"
            ? "text"
            : "json";
    }
    return originalSend(body as never);
  }) as Response["send"];

  res.on("finish", () => {
    if (res.statusCode >= 500) {
      void deleteIdempotencyRecord(key);
      return;
    }

    void (async () => {
      await completeIdempotencyRecord({
        key,
        requestHash,
        responseBody,
        responseKind,
        responseStatus: res.statusCode,
      });
    })();
  });

  next();
}
