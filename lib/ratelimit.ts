import { Ratelimit } from "@upstash/ratelimit";
import { redis } from "./redis";

type Window = `${number} ${"s" | "m" | "h"}`;
const limiters = new Map<string, Ratelimit>();
const memory = new Map<string, { count: number; resetAt: number }>();

function windowMs(w: Window): number {
  const [n, unit] = w.split(" ") as [string, "s" | "m" | "h"];
  return Number(n) * { s: 1000, m: 60_000, h: 3_600_000 }[unit];
}

/**
 * Sliding-window limit via Upstash in prod (shared across edge locations). Locally,
 * without Upstash, a per-process fixed window keeps the same behaviour for testing.
 */
export async function limit(name: string, id: string, max: number, window: Window): Promise<boolean> {
  if (redis) {
    let rl = limiters.get(`${name}:${max}:${window}`);
    if (!rl) {
      rl = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(max, window), prefix: `rl:${name}` });
      limiters.set(`${name}:${max}:${window}`, rl);
    }
    return (await rl.limit(id)).success;
  }
  const key = `${name}:${id}`;
  const now = Date.now();
  const cur = memory.get(key);
  if (!cur || cur.resetAt < now) {
    memory.set(key, { count: 1, resetAt: now + windowMs(window) });
    return true;
  }
  cur.count++;
  return cur.count <= max;
}

export function clientIp(req: Request): string {
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}
