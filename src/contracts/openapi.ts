import { createRequire } from "node:module";

import { getRouteAuthMetadata } from "./auth-metadata.js";
import type { RouteAuthMetadata } from "./auth-metadata.js";

import { appConfig } from "../config/app.js";

const require = createRequire(import.meta.url);

type ApiRegistryRoute = {
  method: string;
  path: string;
  tag: string;
  summary: string;
  parameters?: unknown[];
  requestBody?: boolean;
  requestExample?: unknown;
  headers?: boolean;
  auth?: Partial<RouteAuthMetadata>;
  visibility?: "public" | "internal";
  idempotency?: { supported?: boolean; header?: string };
  pagination?: { style?: string; response?: string };
  rateLimit?: { documented?: boolean; headers?: boolean };
  deprecated?: boolean;
};

const apiRegistry = require("./api-registry.json") as {
  tags: Array<{ name: string }>;
  routes: ApiRegistryRoute[];
};

function buildSuccessSchema() {
  return {
    type: "object",
    properties: {
      success: { type: "boolean", const: true },
      message: { type: "string" },
      data: {},
      meta: {
        type: "object",
        additionalProperties: true,
      },
    },
    required: ["success"],
  };
}

function buildResponseHeaders(includeIdempotency = false) {
  return {
    "X-Request-Id": {
      $ref: "#/components/headers/RequestId",
    },
    "RateLimit-Limit": {
      $ref: "#/components/headers/RateLimitLimit",
    },
    "RateLimit-Remaining": {
      $ref: "#/components/headers/RateLimitRemaining",
    },
    "RateLimit-Reset": {
      $ref: "#/components/headers/RateLimitReset",
    },
    "RateLimit-Policy": {
      $ref: "#/components/headers/RateLimitPolicy",
    },
    ...(includeIdempotency
      ? {
          "X-Idempotent-Replay": {
            $ref: "#/components/headers/IdempotentReplay",
          },
        }
      : {}),
  };
}

function inferSchemaFromExample(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) {
    return {
      type: "array",
      items: value.length > 0 ? inferSchemaFromExample(value[0]) : {},
    };
  }
  if (value === null) {
    return { type: "null" };
  }
  if (typeof value === "string") {
    return { type: "string" };
  }
  if (typeof value === "number") {
    return { type: Number.isInteger(value) ? "integer" : "number" };
  }
  if (typeof value === "boolean") {
    return { type: "boolean" };
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    return {
      type: "object",
      properties: Object.fromEntries(
        entries.map(([key, entryValue]) => [
          key,
          inferSchemaFromExample(entryValue),
        ]),
      ),
      additionalProperties: true,
    };
  }
  return {};
}

function buildRequestBody(route: ApiRegistryRoute) {
  if (!route.requestBody) return undefined;
  const isUpload = route.path === "/image" || route.path === "/music";
  const contentType = isUpload ? "multipart/form-data" : "application/json";
  return {
    required: true,
    content: {
      [contentType]: {
        schema:
          "requestExample" in route && route.requestExample !== undefined
            ? inferSchemaFromExample(route.requestExample)
            : {
                type: "object",
                additionalProperties: true,
                ...(isUpload
                  ? {
                      properties: {
                        file: { type: "string", format: "binary" },
                      },
                    }
                  : {}),
              },
        example: "requestExample" in route ? route.requestExample : undefined,
      },
    },
  };
}

function buildParameters(route: ApiRegistryRoute) {
  const parameters = [...(route.parameters ?? [])];
  if (route.idempotency?.supported) {
    parameters.push({
      name: route.idempotency.header ?? "Idempotency-Key",
      in: "header",
      required: false,
      schema: { type: "string" },
      description:
        "Optional key for replay-safe mutation retries. Reusing a key with a different request returns a conflict.",
    });
  }
  return parameters.length ? parameters : undefined;
}

function buildOperation(route: ApiRegistryRoute) {
  const auth = getRouteAuthMetadata(route);
  const idempotent = Boolean(route.idempotency?.supported);
  return {
    tags: [route.tag],
    summary: route.summary,
    deprecated: route.deprecated || undefined,
    security: auth.required
      ? auth.kind === "platform"
        ? [
            { bearerAuth: [], refreshCookie: [] },
            { serviceApiKey: [] },
            { serviceAuthorization: [] },
          ]
        : [{ bearerAuth: [], refreshCookie: [] }]
      : undefined,
    "x-jamcore-auth": auth,
    "x-jamcore-pagination": route.pagination,
    "x-jamcore-rate-limit": route.rateLimit,
    "x-jamcore-visibility": route.visibility ?? "public",
    parameters: buildParameters(route),
    requestBody: buildRequestBody(route),
    responses: {
      "200": {
        description: "Successful response",
        headers: buildResponseHeaders(idempotent),
        content: {
          "application/json": {
            schema: {
              $ref: route.pagination
                ? "#/components/schemas/PaginatedSuccessResponse"
                : "#/components/schemas/SuccessResponse",
            },
          },
        },
      },
      "429": {
        description: "Rate limited",
        headers: {
          "X-Request-Id": {
            $ref: "#/components/headers/RequestId",
          },
          "RateLimit-Limit": {
            $ref: "#/components/headers/RateLimitLimit",
          },
          "RateLimit-Remaining": {
            $ref: "#/components/headers/RateLimitRemaining",
          },
          "RateLimit-Reset": {
            $ref: "#/components/headers/RateLimitReset",
          },
          "RateLimit-Policy": {
            $ref: "#/components/headers/RateLimitPolicy",
          },
          "Retry-After": {
            schema: {
              type: "integer",
            },
            description: "Seconds until the rate limit window resets.",
          },
        },
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/ErrorResponse",
            },
          },
        },
      },
      default: {
        description: "Error response",
        headers: {
          "X-Request-Id": {
            $ref: "#/components/headers/RequestId",
          },
        },
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/ErrorResponse",
            },
          },
        },
      },
    },
  };
}

export function buildOpenApiDocument(input: {
  appName: string;
  tenant: unknown;
}) {
  const paths = apiRegistry.routes.reduce<
    Record<string, Record<string, unknown>>
  >((acc, route) => {
    const pathEntry = acc[route.path] ?? {};
    pathEntry[route.method.toLowerCase()] = buildOperation(route);
    acc[route.path] = pathEntry;
    return acc;
  }, {});

  return {
    openapi: "3.1.0",
    info: {
      title: `${input.appName} API`,
      version: "1.0.0",
      description: "Primary application API for Jamcore.",
    },
    servers: [{ url: "/api/v1" }],
    tags: apiRegistry.tags,
    "x-jamcore": {
      api: appConfig.api,
      tenant: input.tenant,
      capabilitiesPath: "/api/v1/capabilities",
      eventTypes: [
        "jam.joined",
        "post.created",
        "post.updated",
        "post.deleted",
        "post.restored",
        "session.created",
        "tenant.imported",
      ],
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description:
            "Access token returned by POST /api/v1/session in the Authorization response header.",
        },
        refreshCookie: {
          type: "apiKey",
          in: "cookie",
          name: "refreshToken",
          description:
            "HttpOnly refresh cookie set by POST /api/v1/session. Browser clients send it with credentials: include.",
        },
        serviceApiKey: {
          type: "apiKey",
          in: "header",
          name: "x-api-key",
          description: "Platform service key.",
        },
        serviceAuthorization: {
          type: "apiKey",
          in: "header",
          name: "Authorization",
          description: "Alternative platform service key format: ApiKey <key>.",
        },
      },
      headers: {
        RequestId: {
          schema: {
            type: "string",
          },
          description:
            "Request correlation id. Supply X-Request-Id to reuse your own id in logs and error responses.",
        },
        IdempotentReplay: {
          schema: {
            type: "string",
            enum: ["true"],
          },
          description:
            "Present when a completed idempotent request response is replayed.",
        },
        RateLimitLimit: {
          schema: {
            type: "integer",
          },
          description: "Configured request limit for the current window.",
        },
        RateLimitRemaining: {
          schema: {
            type: "integer",
          },
          description: "Remaining requests in the current window.",
        },
        RateLimitReset: {
          schema: {
            type: "integer",
          },
          description: "Seconds until the current rate-limit window resets.",
        },
        RateLimitPolicy: {
          schema: {
            type: "string",
          },
          description:
            "Applied rate-limit policy, formatted as limit and window.",
        },
      },
      schemas: {
        SuccessResponse: buildSuccessSchema(),
        PaginatedSuccessResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", const: true },
            message: { type: "string" },
            data: {
              type: "object",
              properties: {
                items: { type: "array", items: {} },
                pageInfo: {
                  type: "object",
                  properties: {
                    limit: { type: "integer" },
                    nextCursor: { type: ["string", "null"] },
                    hasMore: { type: "boolean" },
                  },
                  required: ["limit", "hasMore"],
                },
              },
            },
            meta: {
              type: "object",
              additionalProperties: true,
            },
          },
          required: ["success"],
        },
        ErrorResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", const: false },
            error: {
              type: "object",
              properties: {
                code: { type: "string" },
                message: { type: "string" },
                details: {},
                requestId: { type: "string" },
              },
              required: ["code", "message"],
              examples: [
                {
                  code: "ERR_VALIDATION",
                  message: "Validation failed",
                  requestId: "req_123",
                },
                {
                  code: "ERR_UNAUTHORIZED",
                  message: "Unauthorized",
                  requestId: "req_123",
                },
              ],
            },
          },
          required: ["success", "error"],
        },
      },
    },
    paths,
  };
}
