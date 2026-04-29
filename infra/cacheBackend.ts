import { env } from "../config/env.js";
import { getRedisClient } from "./redis.js";

type MemoryEntry = {
  value: string;
  expiresAt: number;
};

type CacheBackend = {
  delete(key: string): Promise<void>;
  get(key: string): Promise<string | null>;
  ping(): Promise<{ available: boolean; provider: "memory" | "redis" }>;
  set(key: string, value: string, ttlMs: number): Promise<void>;
};

const memoryEntries = new Map<string, MemoryEntry>();

const memoryBackend: CacheBackend = {
  async get(key) {
    const entry = memoryEntries.get(key);
    if (!entry) {
      return null;
    }

    if (entry.expiresAt <= Date.now()) {
      memoryEntries.delete(key);
      return null;
    }

    return entry.value;
  },
  async set(key, value, ttlMs) {
    memoryEntries.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
  },
  async delete(key) {
    memoryEntries.delete(key);
  },
  async ping() {
    return { available: true, provider: "memory" as const };
  },
};

const redisBackend: CacheBackend = {
  async get(key) {
    const client = await getRedisClient();
    if (!client) {
      return null;
    }

    return client.get(key);
  },
  async set(key, value, ttlMs) {
    const client = await getRedisClient();
    if (!client) {
      await memoryBackend.set(key, value, ttlMs);
      return;
    }

    await client.set(key, value, {
      PX: ttlMs,
    });
  },
  async delete(key) {
    const client = await getRedisClient();
    if (!client) {
      await memoryBackend.delete(key);
      return;
    }

    await client.del(key);
  },
  async ping() {
    const client = await getRedisClient();
    if (!client) {
      return { available: false, provider: "redis" as const };
    }

    return {
      available: (await client.ping()) === "PONG",
      provider: "redis" as const,
    };
  },
};

export function getCacheBackend(): CacheBackend {
  return env.cacheProvider === "redis" ? redisBackend : memoryBackend;
}
