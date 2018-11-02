import { Logger } from 'winston';
import { Cache } from './cache';
import Timer = NodeJS.Timer;

export interface InMemoryCacheEntry {
  timestamp: number;
  data: any;
}

/**
 * This cache implementation stores entries in a map in memory (not efficient for large caches)
 * @example
 * const cache = new InMemoryCache<{bar: string}>({expireAfterSeconds: 600}); // cached entries expire after 10 minutes
 * cache.put('foo', { bar: 'baz' });
 */
export class InMemoryCache<T = any> implements Cache<T> {
  private readonly keyValueStore = new Map<string, InMemoryCacheEntry>();
  private readonly expireAfterSeconds: number;
  private readonly logger?: Logger;
  private cleanupIntervalRef?: Timer;

  constructor({ expireAfterSeconds, logger }: { expireAfterSeconds: number, logger?: Logger }) {
    this.expireAfterSeconds = parseFloat((expireAfterSeconds || 0).toString());
    this.logger = logger;

    // start the cleanup schedule
    if (this.expireAfterSeconds > 0) {
      this.scheduleCleanup();
    }
  }

  async get(key: string): Promise<T> {
    const entry = this.keyValueStore.get(key);

    if (!entry) {
      throw new Error('InMemoryCache: entry not found in cache');
    }

    // clean up the entry if it has expired
    if (this.expireAfterSeconds && Date.now() > entry.timestamp + this.expireAfterSeconds * 1000) {
      await this.remove(key);
      throw new Error('InMemoryCache: entry expired');
    }

    return entry.data;
  }

  async put(key: string, value: T): Promise<void> {
    this.keyValueStore.set(key, { timestamp: Date.now(), data: value });
  }

  async remove(key: string): Promise<void> {
    this.keyValueStore.delete(key);
  }

  async quit(): Promise<void> {
    this.keyValueStore.clear();

    // cancel the cleanup schedule
    if (this.cleanupIntervalRef) {
      clearInterval(this.cleanupIntervalRef);
    }

    if (this.logger) {
      this.logger.info(`InMemoryCache: destroyed`);
    }
  }

  private scheduleCleanup() {
    this.cleanupIntervalRef = setInterval(async () => {
      if (this.logger) {
        this.logger.info(`InMemoryCache: periodic cleanup after ${this.expireAfterSeconds} seconds`);
      }

      for (const key of Object.keys(this.keyValueStore)) {
        try {
          await this.get(key);
        } catch {
          // the entry has expired; it will clean itself up
        }
      }
    }, this.expireAfterSeconds * 1000);
  }
}
