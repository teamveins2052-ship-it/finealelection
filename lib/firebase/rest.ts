import { importPKCS8, SignJWT } from "jose";

/**
 * Firestore REST for edge routes (firebase-admin doesn't run on Workers — AGENTS §6).
 * Emulator: `Bearer owner` bypasses rules locally. Prod: a service-account access token.
 */
const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "demo-niat-elections";
const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST;
const BASE = EMULATOR
  ? `http://${EMULATOR}/v1/projects/${PROJECT_ID}/databases/(default)/documents`
  : `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

let cachedToken: { value: string; exp: number } | null = null;

async function accessToken(): Promise<string> {
  if (EMULATOR) return "owner";
  if (cachedToken && cachedToken.exp > Date.now() + 60_000) return cachedToken.value;
  const clientEmail = process.env.FIREBASE_SA_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_SA_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!clientEmail || !privateKey) throw new Error("Firestore service account not configured");
  const key = await importPKCS8(privateKey, "RS256");
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/datastore" })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(clientEmail)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!res.ok) throw new Error(`token exchange failed: ${res.status}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: json.access_token, exp: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

type RestValue =
  | { stringValue: string }
  | { integerValue: string }
  | { doubleValue: number }
  | { booleanValue: boolean }
  | { nullValue: null }
  | { timestampValue: string }
  | { arrayValue: { values?: RestValue[] } }
  | { mapValue: { fields?: Record<string, RestValue> } };

function decode(v: RestValue): unknown {
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) return (v.arrayValue.values ?? []).map(decode);
  return Object.fromEntries(Object.entries(v.mapValue.fields ?? {}).map(([k, x]) => [k, decode(x)]));
}

/** Returns the decoded document, or null if it doesn't exist. */
export async function getDocument(path: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${BASE}/${path}`, {
    headers: { authorization: `Bearer ${await accessToken()}` },
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`firestore ${res.status}`);
  const json = (await res.json()) as { fields?: Record<string, RestValue> };
  return Object.fromEntries(Object.entries(json.fields ?? {}).map(([k, v]) => [k, decode(v)]));
}
