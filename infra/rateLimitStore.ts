import { env } from "../config/env.js";
import { getRedisClient } from "./redis.js";

type RateLimitResult = {
  count: number;
  resetMs: number;
};

type MemoryEntry = {
  count: number;
  expiresAt: number;
};

const memoryEntries = new Map<string, MemoryEntry>();

async function incrementMemory(key: string, windowMs: number): Promise<RateLimitResult> {
  const now = Date.now();
  const current = memoryEntries.get(key);
  if (!current || current.expiresAt <= now) {
    memoryEntries.set(key, {
      count: 1,
      expiresAt: now + windowMs,
    });
    return { count: 1, resetMs: windowMs };
  }

  current.count += 1;
  memoryEntries.set(key, current);
  return {
    count: current.count,
    resetMs: Math.max(0, current.expiresAt - now),
  };
}

async function incrementRedis(key: string, windowMs: number): Promise<RateLimitResult> {
  const client = await getRedisClient();
  if (!client) {
    return incrementMemory(key, windowMs);
  }

  const count = await client.incr(key);
  if (count === 1) {
    await client.pExpire(key, windowMs);
  }

  const ttl = await client.pTTL(key);
  return {
    count,
    resetMs: ttl > 0 ? ttl : windowMs,
  };
}

export async function incrementRateLimit(
  key: string,
  windowMs: number,
): Promise<RateLimitResult> {
  return env.rateLimitProvider === "redis"
    ? incrementRedis(key, windowMs)
    : incrementMemory(key, windowMs);
}
