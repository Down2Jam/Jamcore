import { createClient } from "redis";

import { env } from "../config/env.js";
import logger from "./logger.js";

let redisClientPromise: Promise<any | null> | null = null;

export async function getRedisClient() {
  if (!env.redisUrl) {
    return null;
  }

  if (!redisClientPromise) {
    redisClientPromise = (async () => {
      const client = createClient({
        url: env.redisUrl,
      });

      client.on("error", (error) => {
        logger.error("Redis client error", { error });
      });

      await client.connect();
      return client;
    })().catch((error) => {
      logger.error("Redis client initialization failed", { error });
      redisClientPromise = null;
      return null;
    });
  }

  return redisClientPromise;
}

export async function pingRedis() {
  const client = await getRedisClient();
  if (!client) {
    return {
      available: false,
      provider: "memory" as const,
    };
  }

  const result = await client.ping();
  return {
    available: result === "PONG",
    provider: "redis" as const,
  };
}
