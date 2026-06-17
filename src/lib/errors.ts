import { ZodError } from "zod";

export class ApiError extends Error {
  statusCode: number;
  code: string;
  details?: unknown;

  constructor(statusCode: number, message: string, details?: unknown, code?: string) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code ?? this.constructor.name;
    this.details = details;
  }
}

export class BadRequestError extends ApiError {
  constructor(message = "Bad request", details?: unknown) {
    super(400, message, details, "ERR_BAD_REQUEST");
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = "Unauthorized", details?: unknown) {
    super(401, message, details, "ERR_UNAUTHORIZED");
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = "Forbidden", details?: unknown) {
    super(403, message, details, "ERR_FORBIDDEN");
  }
}

export class ConflictError extends ApiError {
  constructor(message = "Conflict", details?: unknown) {
    super(409, message, details, "ERR_CONFLICT");
  }
}

export class ServiceUnavailableError extends ApiError {
  constructor(message = "Service unavailable", details?: unknown, code = "ERR_SERVICE_UNAVAILABLE") {
    super(503, message, details, code);
  }
}

export class NotFoundError extends ApiError {
  constructor(message = "Not found", details?: unknown) {
    super(404, message, details, "ERR_NOT_FOUND");
  }
}

export class ConfigurationError extends ApiError {
  constructor(message = "Server misconfigured", details?: unknown) {
    super(502, message, details, "ERR_CONFIGURATION");
  }
}

export class ValidationError extends ApiError {
  constructor(message = "Validation failed", details?: unknown) {
    super(400, message, details, "ERR_VALIDATION");
  }
}

export function fromZodError(error: ZodError) {
  return new ValidationError("Validation failed", error.flatten());
}
