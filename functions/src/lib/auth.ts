import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { db } from "./store";
import type { AuthToken } from "./callable";

/**
 * Supabase Auth on the server: verify the access token (JWKS, asymmetric keys), confirm the
 * email is verified (Google sign-in or email link), and attach the 2-step proof for this
 * session. Mirrors what the Firebase ID token used to give us: email, email_verified,
 * auth_time, mfa.
 */

const SUPABASE_URL = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
const SECRET = process.env.SUPABASE_SECRET_KEY ?? "";
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

interface SupabaseClaims extends JWTPayload {
  email?: string;
  session_id?: string;
  role?: string;
  is_anonymous?: boolean;
  amr?: Array<{ method: string; timestamp: number }>;
}

/** Confirmed-email check, cached briefly per user (one Auth admin call per user per 5 min). */
const confirmed = new Map<string, { ok: boolean; at: number }>();
async function emailConfirmed(uid: string): Promise<boolean> {
  const hit = confirmed.get(uid);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.ok;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(uid)}`, {
    headers: { apikey: SECRET, Authorization: `Bearer ${SECRET}` },
  });
  const user = res.ok ? ((await res.json()) as { email_confirmed_at?: string | null; banned_until?: string | null }) : null;
  const ok = !!user?.email_confirmed_at && !(user.banned_until && Date.parse(user.banned_until) > Date.now());
  confirmed.set(uid, { ok, at: Date.now() });
  if (confirmed.size > 5000) confirmed.clear();
  return ok;
}

export class TokenError extends Error {}

export async function verifyAccessToken(token: string): Promise<AuthToken> {
  if (!SUPABASE_URL) throw new TokenError("SUPABASE_URL not set");
  jwks ??= createRemoteJWKSet(new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`));
  let payload: SupabaseClaims;
  try {
    ({ payload } = await jwtVerify<SupabaseClaims>(token, jwks, { issuer: `${SUPABASE_URL}/auth/v1`, audience: "authenticated" }));
  } catch {
    throw new TokenError("invalid token");
  }
  if (!payload.sub || payload.role !== "authenticated" || payload.is_anonymous) throw new TokenError("invalid token");
  const authTime = Math.min(...(payload.amr ?? []).map((a) => a.timestamp).filter((t) => typeof t === "number"), payload.iat ?? 0) || payload.iat || 0;
  const t: AuthToken = {
    uid: payload.sub,
    email: payload.email?.toLowerCase(),
    email_verified: payload.email ? await emailConfirmed(payload.sub) : false,
    auth_time: authTime,
    session_id: payload.session_id,
  };
  // 2-step proof for this session (written by mfaVerify / mfaEnrollConfirm — see callables/mfa.ts).
  if (t.session_id) {
    const s = await db.doc(`_mfaSessions/${t.session_id}`).get();
    if (s.exists && s.get("uid") === t.uid) t.mfa = authTime;
  }
  return t;
}
