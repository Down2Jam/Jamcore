import type { NextFunction, Request, Response } from "express";

import { buildSuccessEnvelope } from "../lib/apiResponse.js";

const SKIP_ENVELOPE_FLAG = "__skipResponseEnvelope";

function shouldBypass(req: Request, res: Response, body: unknown) {
  if (res.locals.rawResponse) {
    return true;
  }

  if (res.locals[SKIP_ENVELOPE_FLAG]) {
    return true;
  }

  if (res.statusCode >= 400) {
    return true;
  }

  const contentType = String(res.getHeader("Content-Type") ?? "");
  if (
    contentType.includes("text/html") ||
    contentType.includes("text/event-stream") ||
    contentType.includes("application/octet-stream") ||
    contentType.includes("audio/") ||
    contentType.includes("image/")
  ) {
    return true;
  }

  if (typeof body === "number") {
    return true;
  }

  if (Buffer.isBuffer(body) || body instanceof Uint8Array) {
    return true;
  }

  if (
    typeof body === "string" &&
    (body.startsWith("<!DOCTYPE") || body.startsWith("<html"))
  ) {
    return true;
  }

  return false;
}

export function responseEnvelope(req: Request, res: Response, next: NextFunction) {
  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);

  function withSkipFlag<TValue>(callback: () => TValue): TValue {
    res.locals[SKIP_ENVELOPE_FLAG] = true;
    try {
      return callback();
    } finally {
      delete res.locals[SKIP_ENVELOPE_FLAG];
    }
  }

  function sendWrapped(body: unknown) {
    if (shouldBypass(req, res, body)) {
      return originalSend(body as any);
    }

    return withSkipFlag(() => originalJson(buildSuccessEnvelope(body)));
  }

  res.json = ((body: unknown) => {
    if (shouldBypass(req, res, body)) {
      return originalJson(body as any);
    }

    return withSkipFlag(() => originalJson(buildSuccessEnvelope(body)));
  }) as Response["json"];

  res.send = ((body?: unknown) => sendWrapped(body)) as Response["send"];

  next();
}
