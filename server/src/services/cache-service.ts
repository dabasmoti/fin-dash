// ---------------------------------------------------------------------------
// Generic in-memory cache with TTL support
// ---------------------------------------------------------------------------

const DEFAULT_TTL_MS = 300_000; // 5 minutes

interface CacheRecord<T> {
  data: T;
  timestamp: number;
}

export class CacheService<T> {
  private cache: Map<string, CacheRecord<T>>;
  private ttlMs: number;

  constructor(ttlMs: number = DEFAULT_TTL_MS) {
    this.cache = new Map();
    this.ttlMs = ttlMs;
  }

  /**
   * Returns the cached value if it exists and has not expired, otherwise null.
   */
  get(key: string): T | null {
    const record = this.cache.get(key);
    if (!record) return null;

    if (this.isExpired(record)) {
      this.cache.delete(key);
      return null;
    }

    return record.data;
  }

  /**
   * Stores a value in the cache with the current timestamp.
   */
  set(key: string, data: T): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  /**
   * Returns true if the key exists and has not expired.
   */
  has(key: string): boolean {
    const record = this.cache.get(key);
    if (!record) return false;

    if (this.isExpired(record)) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Removes a single key from the cache.
   */
  invalidate(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Removes all entries from the cache.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Returns an object describing whether each known key is currently cached
   * and, if so, how old the entry is in milliseconds.
   */
  getStatus(): Record<string, { cached: boolean; ageMs?: number }> {
    const now = Date.now();
    const status: Record<string, { cached: boolean; ageMs?: number }> = {};

    for (const [key, record] of this.cache.entries()) {
      if (this.isExpired(record)) {
        this.cache.delete(key);
        status[key] = { cached: false };
      } else {
        status[key] = { cached: true, ageMs: now - record.timestamp };
      }
    }

    return status;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private isExpired(record: CacheRecord<T>): boolean {
    return Date.now() - record.timestamp > this.ttlMs;
  }
}
