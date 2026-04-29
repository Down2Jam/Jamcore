export type ApiSuccessEnvelope = {
  success: true;
  data?: unknown;
  message?: string;
  meta?: Record<string, unknown>;
};

export type ApiErrorEnvelope = {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function buildSuccessEnvelope(body: unknown): ApiSuccessEnvelope {
  if (isPlainObject(body) && body.success === true) {
    return body as ApiSuccessEnvelope;
  }

  if (typeof body === "string") {
    return {
      success: true,
      message: body,
    };
  }

  if (Array.isArray(body) || body === null) {
    return {
      success: true,
      data: body,
    };
  }

  if (isPlainObject(body)) {
    if ("items" in body && "pageInfo" in body) {
      const { items, pageInfo, ...rest } = body;
      const meta = Object.keys(rest).length > 0
        ? { pageInfo, ...rest }
        : { pageInfo };
      return {
        success: true,
        data: items,
        meta,
      };
    }

    if ("data" in body) {
      const { data, message, meta, ...rest } = body;
      const mergedMeta =
        isPlainObject(meta) && Object.keys(rest).length > 0
          ? { ...meta, ...rest }
          : isPlainObject(meta)
            ? meta
            : Object.keys(rest).length > 0
              ? rest
              : undefined;
      return {
        success: true,
        ...(data !== undefined ? { data } : {}),
        ...(typeof message === "string" ? { message } : {}),
        ...(mergedMeta ? { meta: mergedMeta } : {}),
      };
    }

    if ("message" in body && Object.keys(body).length === 1) {
      return {
        success: true,
        message:
          typeof body.message === "string"
            ? body.message
            : String(body.message),
      };
    }

    return {
      success: true,
      data: body,
    };
  }

  return {
    success: true,
    data: body,
  };
}

export function buildErrorEnvelope(input: {
  code: string;
  message: string;
  details?: unknown;
  requestId?: string;
}): ApiErrorEnvelope {
  return {
    success: false,
    error: {
      code: input.code,
      message: input.message,
      ...(input.details !== undefined ? { details: input.details } : {}),
      ...(input.requestId ? { requestId: input.requestId } : {}),
    },
  };
}
