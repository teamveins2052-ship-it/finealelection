import { Redis } from "@upstash/redis";

/** Upstash over HTTP (edge-safe). Null when not configured → callers skip caching. */
export const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN })
    : null;

/** Cache-aside helper (DATAMODEL §9). */
export async function cached<T>(key: string, ttlSec: number, load: () => Promise<T>): Promise<T> {
  if (!redis) return load();
  const hit = await redis.get<T>(key);
  if (hit !== null && hit !== undefined) return hit;
  const value = await load();
  if (value !== null && value !== undefined) await redis.set(key, value, { ex: ttlSec });
  return value;
}
