/**
 * Minimal stand-in for firebase-functions' onCall/HttpsError, so every server action keeps
 * the same shape (guard → rate limit → Zod parse → work → audit) without any Firebase package.
 * /api/fn/[name] builds the request (verified Supabase token → req.auth) and calls .run().
 */

export type ErrorCode =
  | "invalid-argument" | "failed-precondition" | "out-of-range" | "unauthenticated" | "permission-denied"
  | "not-found" | "already-exists" | "aborted" | "resource-exhausted" | "cancelled" | "unavailable"
  | "deadline-exceeded" | "internal";

export class HttpsError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface AuthToken {
  uid: string;
  email?: string;
  email_verified?: boolean;
  /** Unix seconds of this sign-in (Supabase `amr` timestamp). */
  auth_time?: number;
  /** Supabase session id — 2-step proof is bound to it (_mfaSessions). */
  session_id?: string;
  /** Equals auth_time when this sign-in passed 2-step (filled in by /api/fn from _mfaSessions). */
  mfa?: number;
}

export interface CallableRequest<T = unknown> {
  data: T;
  auth?: { uid: string; token: AuthToken; rawToken: string };
  rawRequest: { ip?: string };
}

export interface CallableFunction<I = unknown, O = unknown> {
  run(req: CallableRequest<I>): Promise<O>;
}

export function onCall<I = unknown, O = unknown>(_opts: unknown, handler: (req: CallableRequest<I>) => Promise<O>): CallableFunction<I, O> {
  return { run: handler };
}

export const callOpts = {} as const;
