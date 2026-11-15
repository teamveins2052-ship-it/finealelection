import { createRemoteJWKSet, decodeJwt, jwtVerify, type JWTPayload } from "jose";

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "demo-niat-elections";
const JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"),
);

export interface FirebaseClaims extends JWTPayload {
  email?: string;
  email_verified?: boolean;
  mfa?: number;
  auth_time?: number;
}

export class AuthError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Verifies a Firebase ID token on the edge (RLSPOLICIES §7). Throws AuthError on failure. */
export async function verifyFirebaseToken(authHeader: string | null): Promise<FirebaseClaims & { email: string }> {
  if (!authHeader?.startsWith("Bearer ")) throw new AuthError(401, "Missing token");
  const token = authHeader.slice(7);
  let payload: FirebaseClaims;
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    // Auth-emulator tokens are unsigned; only accepted when the emulator is configured locally.
    payload = decodeJwt(token) as FirebaseClaims;
    if (payload.aud !== PROJECT_ID) throw new AuthError(401, "Invalid token");
  } else {
    try {
      ({ payload } = await jwtVerify<FirebaseClaims>(token, JWKS, {
        issuer: `https://securetoken.google.com/${PROJECT_ID}`,
        audience: PROJECT_ID,
        algorithms: ["RS256"],
      }));
    } catch {
      throw new AuthError(401, "Invalid token");
    }
  }
  if (!payload.sub) throw new AuthError(401, "Invalid token");
  if (!payload.email || payload.email_verified !== true) throw new AuthError(403, "Email not verified");
  return { ...payload, email: payload.email.toLowerCase() };
}
