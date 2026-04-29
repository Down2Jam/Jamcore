import "dotenv/config";

import { z } from "zod";

function expandEnvValue(
  value: string,
  source: NodeJS.ProcessEnv,
  stack: Set<string> = new Set(),
): string {
  return value.replace(/\$\{([A-Z0-9_]+)\}/gi, (_match, key: string) => {
    if (stack.has(key)) {
      return "";
    }

    const replacement = source[key];
    if (typeof replacement !== "string") {
      return "";
    }

    const nextStack = new Set(stack);
    nextStack.add(key);
    return expandEnvValue(replacement, source, nextStack);
  });
}

for (const [key, value] of Object.entries(process.env)) {
  if (typeof value === "string" && value.includes("${")) {
    process.env[key] = expandEnvValue(value, process.env);
  }
}

const optionalString = (schema: z.ZodString) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim().length === 0
        ? undefined
        : value,
    schema.optional(),
  );

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3005),
  FRONT_DEV_PORT: z.coerce.number().int().positive().default(3000),
  CLIENT_ORIGIN: optionalString(z.string().url()),
  FEDERATION_ORIGIN: optionalString(z.string().url()),
  APP_CONFIG_PATH: optionalString(z.string()),
  FEATURED_STREAMERS_CRON: z.string().default("*/5 * * * *"),
  CACHE_PROVIDER: z.enum(["memory", "redis"]).default("memory"),
  RATE_LIMIT_PROVIDER: z.enum(["memory", "redis"]).default("memory"),
  REDIS_URL: optionalString(z.string().url()),
  RUNTIME_ROLE: z.enum(["api", "worker", "all"]).default("all"),
  SERVICE_API_KEYS: optionalString(z.string()),
  TOKEN_SECRET: optionalString(z.string().min(1)),
});

const parsed = envSchema.parse(process.env);

if (parsed.NODE_ENV === "production") {
  const missing = [
    !parsed.CLIENT_ORIGIN ? "CLIENT_ORIGIN" : null,
    !parsed.FEDERATION_ORIGIN ? "FEDERATION_ORIGIN" : null,
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(
      `Missing required production environment variables: ${missing.join(", ")}`,
    );
  }
}

export const env = {
  nodeEnv: parsed.NODE_ENV,
  port: parsed.PORT,
  frontDevPort: parsed.FRONT_DEV_PORT,
  clientOrigin:
    parsed.CLIENT_ORIGIN ??
    (parsed.NODE_ENV === "production"
      ? "https://example.com"
      : `http://localhost:${parsed.FRONT_DEV_PORT}`),
  federationOrigin:
    parsed.FEDERATION_ORIGIN ??
    parsed.CLIENT_ORIGIN ??
    (parsed.NODE_ENV === "production"
      ? "https://example.com"
      : `http://localhost:${parsed.PORT}`),
  appConfigPath: parsed.APP_CONFIG_PATH,
  featuredStreamersCron: parsed.FEATURED_STREAMERS_CRON,
  cacheProvider: parsed.CACHE_PROVIDER,
  rateLimitProvider: parsed.RATE_LIMIT_PROVIDER,
  redisUrl: parsed.REDIS_URL,
  runtimeRole: parsed.RUNTIME_ROLE,
  serviceApiKeys: parsed.SERVICE_API_KEYS,
  tokenSecret: parsed.TOKEN_SECRET,
} as const;
