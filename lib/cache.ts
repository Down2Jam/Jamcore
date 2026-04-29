import { getCacheBackend } from "../infra/cacheBackend.js";
import { recordCacheRequest } from "../infra/metrics.js";

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

export class TTLCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();
  private readonly knownKeys = new Set<string>();

  constructor(
    private readonly ttlMs: number,
    private readonly name = "default",
  ) {}

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) {
      return undefined;
    }

    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }

    return entry.value;
  }

  set(key: string, value: T): T {
    this.entries.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs,
    });
    this.knownKeys.add(key);
    return value;
  }

  delete(key: string) {
    this.entries.delete(key);
    this.knownKeys.delete(key);
    void getCacheBackend().delete(`cache:${this.name}:${key}`);
  }

  clear() {
    this.entries.clear();
    for (const key of this.knownKeys) {
      void getCacheBackend().delete(`cache:${this.name}:${key}`);
    }
    this.knownKeys.clear();
  }

  async getOrSet(key: string, load: () => Promise<T>): Promise<T> {
    const cached = this.get(key);
    if (cached !== undefined) {
      recordCacheRequest({ cacheName: this.name, hit: true });
      return cached;
    }

    const backendKey = `cache:${this.name}:${key}`;
    const backend = getCacheBackend();
    const backendValue = await backend.get(backendKey);
    if (backendValue !== null) {
      const parsed = JSON.parse(backendValue) as T;
      this.set(key, parsed);
      recordCacheRequest({ cacheName: this.name, hit: true });
      return parsed;
    }

    const value = await load();
    this.set(key, value);
    await backend.set(backendKey, JSON.stringify(value), this.ttlMs);
    recordCacheRequest({ cacheName: this.name, hit: false });
    return value;
  }
}
