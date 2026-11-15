import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * RFC 6238 TOTP (HMAC-SHA1, 30 s, 6 digits) — what Google/Microsoft Authenticator and Authy use.
 * Kept dependency-free so the same file runs in Cloud Functions, seed scripts and unit tests.
 */
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const STEP_SEC = 30;

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function hotp(secret: Buffer, counter: number, digits = 6): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", secret).update(msg).digest();
  const offset = h[h.length - 1] & 0xf;
  const bin = ((h[offset] & 0x7f) << 24) | (h[offset + 1] << 16) | (h[offset + 2] << 8) | h[offset + 3];
  return String(bin % 10 ** digits).padStart(digits, "0");
}

export const currentStep = (nowMs = Date.now()) => Math.floor(nowMs / 1000 / STEP_SEC);

/**
 * Returns the matched time-step (for replay protection) or null. Accepts ±1 step (≈±30 s)
 * to tolerate phone clock drift. Constant-time comparison.
 */
export function verifyTotp(secretB32: string, code: string, nowMs = Date.now(), window = 1): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const secret = base32Decode(secretB32);
  const step = currentStep(nowMs);
  for (let w = -window; w <= window; w++) {
    const expected = hotp(secret, step + w);
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(code))) return step + w;
  }
  return null;
}

export function newSecret(): string {
  return base32Encode(randomBytes(20)); // 160-bit, RFC 4226 recommended size
}

export function otpauthUri(secretB32: string, account: string, issuer = "NIAT Elections"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${STEP_SEC}`;
}

// ---------- backup codes ----------
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export function newBackupCodes(n = 10): string[] {
  return Array.from({ length: n }, () => {
    const bytes = randomBytes(8);
    const chars = Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
    return `${chars.slice(0, 4)}-${chars.slice(4, 8)}`;
  });
}
export const normaliseBackupCode = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, "");
export const hashBackupCode = (c: string) => createHash("sha256").update(`niat-mfa:${normaliseBackupCode(c)}`).digest("hex");

// ---------- secret encryption at rest (AES-256-GCM) ----------
/**
 * TOTP secrets are encrypted before they touch Firestore, so a database export alone can't
 * mint codes. Key comes from the MFA_ENCRYPTION_KEY secret (32 bytes, base64).
 */
const DEV_KEY = Buffer.alloc(32, 7); // emulator/seed only — never used when a real key is configured
export function encryptionKey(): Buffer {
  const raw = process.env.MFA_ENCRYPTION_KEY;
  if (raw) {
    const k = Buffer.from(raw, "base64");
    if (k.length !== 32) throw new Error("MFA_ENCRYPTION_KEY must be 32 bytes (base64)");
    return k;
  }
  if (process.env.FUNCTIONS_EMULATOR === "true" || process.env.FIRESTORE_EMULATOR_HOST) return DEV_KEY;
  throw new Error("MFA_ENCRYPTION_KEY is not configured");
}

export function encryptSecret(plain: string, key = encryptionKey()): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
}

export function decryptSecret(payload: string, key = encryptionKey()): string {
  const [iv, tag, enc] = payload.split(".").map((p) => Buffer.from(p, "base64"));
  const d = createDecipheriv("aes-256-gcm", key, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}
