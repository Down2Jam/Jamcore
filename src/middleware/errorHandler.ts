import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";

import logger from "../infra/logger.js";
import { buildErrorEnvelope } from "../lib/apiResponse.js";
import { ApiError, fromZodError, NotFoundError } from "../lib/errors.js";

export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(new NotFoundError("Route not found"));
};

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const shouldExposeRequestId =
    !(error instanceof ApiError) && !(error instanceof ZodError);

  const normalizedError =
    error instanceof ZodError
      ? fromZodError(error)
      : error instanceof ApiError
        ? error
        : new ApiError(500, "Internal server error");

  if (shouldExposeRequestId) {
    logger.error("Unhandled request error", {
      requestId: res.locals.requestId,
      error,
    });
  }

  res.status(normalizedError.statusCode).json(
    buildErrorEnvelope({
      code: normalizedError.code,
      message: normalizedError.message,
      details: normalizedError.details,
      requestId: shouldExposeRequestId ? res.locals.requestId : undefined,
    }),
  );
};
