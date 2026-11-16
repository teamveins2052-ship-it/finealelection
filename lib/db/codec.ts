/**
 * Shared (browser + server) document encoding for the Supabase document tables.
 *  - Timestamps are stored in jsonb as {"$ts": millis} so they sort and compare correctly
 *    (jsonb compares {"$ts": n} objects by n) and come back as Timestamp objects.
 *  - Write-time sentinels (server time, increment, array union, delete) travel as
 *    {"$sv": ...} and are resolved on the server only — the browser never supplies a time
 *    (AGENTS §5.9).
 */

export class Timestamp {
  constructor(
    public readonly seconds: number,
    public readonly nanoseconds: number,
  ) {}
  static now() {
    return Timestamp.fromMillis(Date.now());
  }
  static fromMillis(ms: number) {
    const s = Math.floor(ms / 1000);
    return new Timestamp(s, Math.round((ms - s * 1000) * 1e6));
  }
  static fromDate(d: Date) {
    return Timestamp.fromMillis(d.getTime());
  }
  toMillis() {
    return this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6);
  }
  toDate() {
    return new Date(this.toMillis());
  }
  isEqual(o: Timestamp) {
    return o instanceof Timestamp && o.toMillis() === this.toMillis();
  }
  valueOf() {
    return String(this.toMillis()).padStart(16, "0");
  }
  toJSON() {
    return { $ts: this.toMillis() };
  }
}

export type Sentinel =
  | { $sv: "ts" }
  | { $sv: "inc"; n: number }
  | { $sv: "union"; v: unknown[] }
  | { $sv: "remove"; v: unknown[] }
  | { $sv: "del" };

export class FieldSentinel {
  constructor(public readonly s: Sentinel) {}
  toJSON() {
    return this.s;
  }
}

export const FieldValue = {
  serverTimestamp: () => new FieldSentinel({ $sv: "ts" }),
  increment: (n: number) => new FieldSentinel({ $sv: "inc", n }),
  arrayUnion: (...v: unknown[]) => new FieldSentinel({ $sv: "union", v }),
  arrayRemove: (...v: unknown[]) => new FieldSentinel({ $sv: "remove", v }),
  delete: () => new FieldSentinel({ $sv: "del" }),
};

const isPlain = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Timestamp) && !(v instanceof Date) && !(v instanceof FieldSentinel);

/** JS value → JSON-safe value (Timestamp/Date → {$ts}, sentinels → {$sv}). */
export function encode(v: unknown): unknown {
  if (v instanceof Timestamp) return { $ts: v.toMillis() };
  if (v instanceof Date) return { $ts: v.getTime() };
  if (v instanceof FieldSentinel) return v.s;
  if (Array.isArray(v)) return v.map(encode);
  if (isPlain(v)) {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) if (x !== undefined) out[k] = encode(x);
    return out;
  }
  return v;
}

/** JSON value → JS value ({$ts} → Timestamp; {$sv} → FieldSentinel when allowed). */
export function decode(v: unknown, allowSentinels = false): unknown {
  if (Array.isArray(v)) return v.map((x) => decode(x, allowSentinels));
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    const keys = Object.keys(o);
    if (keys.length === 1 && keys[0] === "$ts" && typeof o.$ts === "number") return Timestamp.fromMillis(o.$ts);
    if ("$sv" in o) {
      if (!allowSentinels) throw new Error("sentinel not allowed here");
      return new FieldSentinel(o as unknown as Sentinel);
    }
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(o)) out[k] = decode(x, allowSentinels);
    return out;
  }
  return v;
}

/** Reads a dotted field path ("reactionCounts.fire"). */
export function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const part of path.split(".")) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}
