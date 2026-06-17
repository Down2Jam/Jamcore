import type { RequestHandler } from "express";

import { appConfig } from "../../../config/app.js";
import { verifyIncomingSignature } from "./http-signature.service.js";
import { UnauthorizedError } from "../../../lib/errors.js";

export const verifyFederationSignature: RequestHandler = async (req, _res, next) => {
  if (!appConfig.federation.security.enabled) {
    next();
    return;
  }

  const signatureHeader = req.get("signature");
  if (!signatureHeader) {
    if (appConfig.federation.security.requireHttpSignatures) {
      next(new UnauthorizedError("Federation signature required"));
      return;
    }

    next();
    return;
  }

  try {
    const isValid = await verifyIncomingSignature({
      method: req.method,
      path: req.originalUrl,
      host: req.get("host") ?? "",
      date: req.get("date") ?? null,
      digest: req.get("digest") ?? null,
      rawBody: req.rawBody ?? "",
      signatureHeader,
    });

    if (!isValid) {
      next(new UnauthorizedError("Invalid federation signature"));
      return;
    }

    next();
  } catch (error) {
    next(
      error instanceof Error
        ? new UnauthorizedError(error.message)
        : new UnauthorizedError("Invalid federation signature"),
    );
  }
};

