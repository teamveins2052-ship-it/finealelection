import { z } from "zod";
import { HttpsError, type AuthToken } from "./lib/callable";
import { db, tableOf, type DocumentData, type DocumentSnapshot, type Query } from "./lib/store";
import { FieldSentinel, Timestamp, decode, encode } from "../../lib/db/codec";
import { MEDIA_BASE_URL } from "./schema";

/**
 * Browser reads and writes (POST /api/db). The browser has NO direct table access (RLS on,
 * no policies), so this file IS the security boundary — a line-for-line port of the old
 * firestore.rules. Policy IDs refer to docs/RLSPOLICIES.md. Anything not listed is denied.
 */

// ------------------------------------------------------------------ request shapes

const Path = z.string().regex(/^[A-Za-z_]+\/[A-Za-z0-9_\-.@+]{1,200}$/);
const Coll = z.string().regex(/^[A-Za-z_]{2,40}$/);
const WhereOp = z.enum(["==", "!=", "<", "<=", ">", ">=", "in", "array-contains"]);
const FieldName = z.string().regex(/^[A-Za-z_][A-Za-z0-9_.]{0,60}$/);

export const DbRequest = z.discriminatedUnion("op", [
  z.object({ op: z.literal("get"), path: Path }),
  z.object({
    op: z.literal("query"),
    collection: Coll,
    where: z.array(z.tuple([FieldName, WhereOp, z.unknown()])).max(6).default([]),
    orderBy: z.array(z.tuple([FieldName, z.enum(["asc", "desc"])])).max(3).default([]),
    limit: z.number().int().min(1).max(5000).optional(),
  }),
  z.object({ op: z.literal("set"), path: Path, data: z.record(z.string(), z.unknown()), merge: z.boolean().optional() }),
  z.object({ op: z.literal("update"), path: Path, data: z.record(z.string(), z.unknown()) }),
  z.object({ op: z.literal("add"), collection: Coll, data: z.record(z.string(), z.unknown()) }),
  z.object({ op: z.literal("delete"), path: Path }),
]);
export type DbRequest = z.infer<typeof DbRequest>;

// ------------------------------------------------------------------ caller context

class Ctx {
  private cache = new Map<string, Promise<DocumentSnapshot>>();
  constructor(public readonly token: AuthToken | null) {}
  get signedIn() {
    return !!this.token?.email && this.token.email_verified === true;
  }
  get email() {
    return this.token?.email ?? "";
  }
  get mfaOk() {
    return !!this.token && typeof this.token.mfa === "number" && this.token.mfa === this.token.auth_time;
  }
  doc(path: string) {
    let p = this.cache.get(path);
    if (!p) this.cache.set(path, (p = db.doc(path).get()));
    return p;
  }
  async election(): Promise<DocumentData> {
    return (await this.doc("settings/election")).data() ?? {};
  }
  async isAdmin() {
    if (!this.signedIn) return false;
    const a = await this.doc(`admins/${this.email}`);
    if (!a.exists) return false;
    return this.mfaOk || (await this.election()).requireAdminMfa !== true;
  }
  async isVoterAdmin() {
    return (await this.isAdmin()) && (await this.doc(`admins/${this.email}`)).get("canViewVoters") === true;
  }
  /** P-STU core: verified, active owner of student id (+ 2-step when required, P-MFA-05). */
  async isStudent(id: unknown) {
    if (!this.signedIn || typeof id !== "string" || !id) return false;
    const s = await this.doc(`students/${id}`);
    if (!s.exists || s.get("email") !== this.email || s.get("status") !== "active") return false;
    if (this.mfaOk) return true;
    return (await this.election()).requireStudentMfa === false && s.get("mfaEnabled") !== true;
  }
  async myNiatId(): Promise<string | null> {
    if (!this.signedIn) return null;
    const q = await db.collection("students").where("email", "==", this.email).limit(2).get();
    return q.size === 1 ? q.docs[0]!.id : null;
  }
  async votingOpen() {
    const e = await this.election();
    const now = Date.now();
    return e.paused === false && ms(e.opensAt) <= now && now < ms(e.closesAt);
  }
  async campaignOpen() {
    return Date.now() < ms((await this.election()).closesAt);
  }
}

const ms = (t: unknown) => (t instanceof Timestamp ? t.toMillis() : NaN);
const isServerTime = (v: unknown) => v instanceof FieldSentinel && v.s.$sv === "ts";
const str = (v: unknown, max: number) => typeof v === "string" && v.length <= max;
const keysOnly = (d: DocumentData, allowed: string[]) => Object.keys(d).every((k) => allowed.includes(k));
/** Keys whose value differs between old and new (sentinels always count as changed). */
const changed = (before: DocumentData, after: DocumentData) =>
  [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
    (k) => after[k] instanceof FieldSentinel || JSON.stringify(encode(before[k])) !== JSON.stringify(encode(after[k])),
  );
const onlyChanged = (before: DocumentData, after: DocumentData, fields: string[]) => changed(before, after).every((k) => fields.includes(k));

const mediaFor = (niatId: string) => `${MEDIA_BASE_URL}nominees/${niatId}/`;

// ------------------------------------------------------------------ read rules

const PUBLIC = new Set(["banners", "settings"]); // P-BAN-01, P-SET-01
const SIGNED_IN = new Set(["positions", "nominees", "posts", "questions", "comments", "debates", "pulsePolls"]);
const ADMIN = new Set(["correctionRequests", "tallies", "auditLogs"]);
const VOTER_ADMIN = new Set(["questionAuthors", "commentAuthors"]);
/** Per-student collections: owner field (or id) → watch key is the owner's private ping key. */
const OWNER_FIELD: Record<string, string | null> = { students: null, votes: "voterId", reactions: "niatId", predictions: null, pulseVotes: "niatId" };

async function canRead(ctx: Ctx, coll: string, id: string, data: DocumentData): Promise<boolean> {
  if (PUBLIC.has(coll)) return true;
  if (SIGNED_IN.has(coll)) return ctx.signedIn;
  if (ADMIN.has(coll)) return ctx.isAdmin();
  if (VOTER_ADMIN.has(coll)) return ctx.isVoterAdmin();
  switch (coll) {
    case "admins": // P-ADM-01
      return (await ctx.isAdmin()) || (ctx.signedIn && id === ctx.email);
    case "students": // P-STU-01 (pending users can read their own doc to see status)
      return (await ctx.isAdmin()) || (ctx.signedIn && data.email === ctx.email);
    case "votes": // P-VOT-01
      return (await ctx.isVoterAdmin()) || ctx.isStudent(data.voterId);
    case "reactions": // P-RCT-01
    case "pulseVotes": // P-PUL-03
      return ctx.isStudent(data.niatId);
    case "predictions": // P-PRD-01
      return (await ctx.isStudent(id)) || ctx.isAdmin();
    default: // directory, mfa, _* … P-DIR-01 and the catch-all deny
      return false;
  }
}

async function watchKeys(ctx: Ctx, coll: string): Promise<string[]> {
  if (coll in OWNER_FIELD && !(await ctx.isAdmin())) {
    const me = await ctx.myNiatId();
    if (!me) return [];
    const r = await db.query("select public._user_key($1) as k", [me]);
    return [String(r.rows[0]?.k)];
  }
  return [`c:${tableOf(coll)}`];
}

// ------------------------------------------------------------------ write rules

type Write = { kind: "create" | "update" | "delete"; coll: string; id: string; before?: DocumentData; after?: DocumentData; patch?: DocumentData };

async function canWrite(ctx: Ctx, w: Write): Promise<boolean> {
  const { coll, id } = w;
  const before = w.before ?? {};
  const after = w.after ?? {};
  switch (coll) {
    case "students": // P-STU-02 / P-STU-03
      return (
        w.kind === "update" && ctx.signedIn && before.email === ctx.email && before.status === "active" &&
        onlyChanged(before, after, ["activeSessionId", "lastLoginAt"]) && str(after.activeSessionId, 64) && isServerTime(after.lastLoginAt)
      );
    case "positions": // P-POS-02
    case "debates": // P-DEB-02
    case "pulsePolls": // P-PUL-02
      return ctx.isAdmin();
    case "banners": // P-BAN-02
      return (await ctx.isAdmin()) && (w.kind === "delete" || str(after.text, 160));
    case "nominees": { // P-NOM-02 / P-NOM-03
      if (w.kind !== "update") return false;
      const photo = after.photoUrl;
      const isAdmin = await ctx.isAdmin();
      if (isAdmin) {
        return (
          onlyChanged(before, after, ["photoUrl", "bio", "promises", "updatedAt"]) &&
          (photo == null || typeof photo === "string") &&
          str(after.bio, 300) && Array.isArray(after.promises) && after.promises.length <= 6 &&
          after.promises.every((p) => str(p, 120)) && isServerTime(after.updatedAt)
        );
      }
      return (
        (await ctx.isStudent(before.niatId)) && before.active === true && (await ctx.campaignOpen()) &&
        onlyChanged(before, after, ["photoUrl", "bio", "promises", "updatedAt"]) &&
        (photo == null || photo === before.photoUrl || (typeof photo === "string" && photo.startsWith(mediaFor(String(before.niatId))))) &&
        str(after.bio, 300) && Array.isArray(after.promises) && after.promises.length <= 6 &&
        after.promises.every((p) => str(p, 120)) && isServerTime(after.updatedAt)
      );
    }
    case "votes": { // V-1 … V-9, P-VOT-03
      if (w.kind !== "create") return false;
      const v = after;
      if (!(await ctx.isStudent(v.voterId)) || !(await ctx.votingOpen())) return false;
      if (id !== `${String(v.voterId)}_${String(v.positionId)}`) return false;
      if (!keysOnly(v, ["voterId", "positionId", "nomineeId", "createdAt"]) || !isServerTime(v.createdAt)) return false;
      if (typeof v.nomineeId !== "string" || typeof v.positionId !== "string") return false;
      if (!new RegExp(`^${v.positionId.replace(/[^a-z0-9-]/g, "")}_[A-Z0-9]+$`).test(v.nomineeId)) return false;
      const [n, p] = await Promise.all([ctx.doc(`nominees/${v.nomineeId}`), ctx.doc(`positions/${v.positionId}`)]);
      if (n.get("active") !== true || p.get("active") !== true) return false;
      return (await ctx.election()).nomineesCanSelfVote === true || v.nomineeId !== `${v.positionId}_${String(v.voterId)}`;
    }
    case "posts": { // P-PST-02 / P-PST-03
      if (w.kind === "create") {
        const s = await ctx.doc(`students/${String(after.niatId)}`);
        return (
          (await ctx.isStudent(after.niatId)) && s.get("isNominee") === true &&
          after.nomineeId === `${String(s.get("nomineeOf"))}_${String(after.niatId)}` && (await ctx.campaignOpen()) &&
          keysOnly(after, ["nomineeId", "niatId", "type", "mediaUrl", "posterUrl", "caption", "durationSec", "expiresAt", "commentCount", "deleted", "createdAt"]) &&
          ["photo", "video", "poster"].includes(String(after.type)) && // stories need a server-set expiry: not offered
          typeof after.mediaUrl === "string" && after.mediaUrl.startsWith(mediaFor(String(after.niatId))) &&
          str(after.caption, 200) &&
          (after.type !== "video" || (typeof after.durationSec === "number" && after.durationSec <= 30)) &&
          after.commentCount === 0 && after.deleted === false && isServerTime(after.createdAt)
        );
      }
      if (w.kind === "update") {
        return (
          after.deleted === true && onlyChanged(before, after, ["deleted", "deletedBy"]) &&
          ((await ctx.isStudent(before.niatId)) || (await ctx.isAdmin()))
        );
      }
      return false;
    }
    case "questions": { // P-QNA-02 / P-QNA-03
      if (w.kind !== "update") return false;
      const n = await ctx.doc(`nominees/${String(before.nomineeId)}`);
      const owner = n.exists && n.get("active") === true && (await ctx.isStudent(n.get("niatId")));
      return (
        (owner && onlyChanged(before, after, ["answer", "answeredAt"]) && str(after.answer, 600) && isServerTime(after.answeredAt)) ||
        ((await ctx.isAdmin()) && onlyChanged(before, after, ["hidden"]))
      );
    }
    case "comments": // P-CMT-03
      return w.kind === "update" && (await ctx.isAdmin()) && onlyChanged(before, after, ["hidden"]);
    case "reactions": // P-RCT-02
      if (w.kind === "delete") return ctx.isStudent(before.niatId);
      return (
        (await ctx.isStudent(after.niatId)) && id === `${String(after.niatId)}_${String(after.nomineeId)}` &&
        ["fire", "clap"].includes(String(after.type)) && keysOnly(after, ["niatId", "nomineeId", "type", "updatedAt"]) &&
        isServerTime(after.updatedAt)
      );
    case "predictions": // P-PRD-02
      return (
        w.kind !== "delete" && (await ctx.isStudent(id)) && Date.now() < ms((await ctx.election()).closesAt) &&
        keysOnly(after, ["niatId", "picks", "updatedAt"]) && after.niatId === id &&
        !!after.picks && typeof after.picks === "object" && Object.keys(after.picks).length <= 10 && isServerTime(after.updatedAt)
      );
    case "pulseVotes": { // P-PUL-04
      if (w.kind !== "create") return false;
      const poll = await ctx.doc(`pulsePolls/${String(after.pollId)}`);
      const options = poll.get("options");
      return (
        (await ctx.isStudent(after.niatId)) && id === `${String(after.pollId)}_${String(after.niatId)}` &&
        poll.get("active") === true && Number.isInteger(after.optionIndex) && (after.optionIndex as number) >= 0 &&
        Array.isArray(options) && (after.optionIndex as number) < options.length &&
        keysOnly(after, ["pollId", "niatId", "optionIndex", "createdAt"]) && isServerTime(after.createdAt)
      );
    }
    case "settings": { // P-SET-02
      if (w.kind === "delete" || id !== "election" || !(await ctx.isAdmin())) return false;
      return (
        ms(after.opensAt) < ms(after.closesAt) && ms(after.closesAt) < ms(after.siteClosesAt) &&
        after.updatedBy === ctx.email && isServerTime(after.updatedAt)
      );
    }
    default: // admins (P-ADM-02), directory, correctionRequests, tallies, *Authors, auditLogs, mfa, _*: server only
      return false;
  }
}

// ------------------------------------------------------------------ handler

const DENIED = () => new HttpsError("permission-denied", "You don't have access to do that.");
const out = (s: DocumentSnapshot) => ({ id: s.id, data: encode(s.data()) });

export async function handleDb(raw: unknown, token: AuthToken | null) {
  const req = DbRequest.parse(raw);
  const ctx = new Ctx(token);

  if (req.op === "get") {
    const [coll, id] = req.path.split("/") as [string, string];
    const snap = await db.doc(req.path).get();
    if (!snap.exists) {
      // Missing docs: allowed only where the caller could read it if it existed (own vote, own reaction…).
      const probe = coll === "votes" ? { voterId: id.split("_")[0] } : coll === "reactions" ? { niatId: id.split("_")[0] } : coll === "students" ? { email: "" } : {};
      if (!(await canRead(ctx, coll, id, probe))) throw DENIED();
      return { doc: null, watch: await watchKeys(ctx, coll) };
    }
    if (!(await canRead(ctx, coll, id, snap.data()!))) throw DENIED();
    return { doc: out(snap), watch: await watchKeys(ctx, coll) };
  }

  if (req.op === "query") {
    const admin = await ctx.isAdmin();
    let q: Query = db.collection(req.collection);
    for (const [f, op, v] of req.where) q = q.where(f, op, decode(v));
    for (const [f, dir] of req.orderBy) q = q.orderBy(f, dir);
    // Non-admins never pull a whole per-student collection: it must be filtered to themselves.
    if (!admin && req.collection in OWNER_FIELD) {
      const ownerField = req.collection === "students" ? "email" : (OWNER_FIELD[req.collection] ?? null);
      const pinned = req.where.some(([f, op]) => op === "==" && (f === ownerField || (req.collection === "predictions" && f === "niatId")));
      if (!pinned) throw DENIED();
    }
    const maxAllowed = admin ? 5000 : 500;
    q = q.limit(req.limit ? Math.min(req.limit, maxAllowed) : maxAllowed);
    const snap = await q.get();
    const docs = [];
    for (const d of snap.docs) if (await canRead(ctx, req.collection, d.id, d.data()!)) docs.push(out(d));
    if (snap.size && !docs.length && !PUBLIC.has(req.collection)) throw DENIED();
    return { docs, watch: await watchKeys(ctx, req.collection) };
  }

  // ---- writes
  const coll = req.op === "add" ? req.collection : req.path.split("/")[0]!;
  const ref = req.op === "add" ? db.collection(coll).doc() : db.doc(req.path);
  const current = await ref.get();
  const before = current.data();

  if (req.op === "delete") {
    if (coll === "votes") throw DENIED(); // P-VOT-03: never, for anyone
    if (!(await canWrite(ctx, { kind: "delete", coll, id: ref.id, before: before ?? {} }))) throw DENIED();
    if (before) await ref.delete();
    return { id: ref.id };
  }

  const data = decode(req.data, true) as DocumentData;
  if (Object.keys(data).some((k) => k.includes("."))) throw new HttpsError("invalid-argument", "Field paths aren't supported here.");
  let kind: "create" | "update";
  let after: DocumentData;
  if (req.op === "update") {
    if (!before) throw new HttpsError("not-found", "That item no longer exists.");
    kind = "update";
    after = { ...before, ...data };
  } else if (req.op === "set" && req.merge) {
    kind = before ? "update" : "create";
    after = { ...(before ?? {}), ...data };
  } else {
    kind = before ? "update" : "create";
    after = data;
  }
  if (!(await canWrite(ctx, { kind, coll, id: ref.id, before, after }))) throw DENIED();

  if (kind === "create") {
    try {
      await ref.create(data);
    } catch (e) {
      if ((e as { code?: number }).code === 6) throw DENIED(); // someone else created it first (e.g. a second vote)
      throw e;
    }
  } else if (req.op === "update") {
    await ref.update(data);
  } else if (req.op === "set" && req.merge) {
    await ref.set(data, { merge: true });
  } else {
    await ref.set(data);
  }
  return { id: ref.id };
}
