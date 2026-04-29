export const JAMCORE_ERROR_CODES = [
  "ERR_BAD_REQUEST",
  "ERR_UNAUTHORIZED",
  "ERR_FORBIDDEN",
  "ERR_CONFLICT",
  "ERR_NOT_FOUND",
  "ERR_CONFIGURATION",
  "ERR_VALIDATION",
] as const;

export type JamcoreErrorCode = (typeof JAMCORE_ERROR_CODES)[number];

export type JamcoreErrorResponse = {
  error: JamcoreErrorCode | string;
  message: string;
  details?: unknown;
};
