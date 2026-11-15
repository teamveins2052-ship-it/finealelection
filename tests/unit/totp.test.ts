import { describe, expect, it } from "vitest";
import {
  base32Decode, base32Encode, decryptSecret, encryptSecret, hashBackupCode, hotp, newBackupCodes, verifyTotp,
} from "../../functions/src/lib/totp";

// RFC 6238 Appendix B test secret "12345678901234567890" (SHA-1), 8-digit vectors truncated to 6.
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));

describe("TOTP (RFC 6238)", () => {
  it("round-trips base32", () => {
    expect(base32Decode(base32Encode(Buffer.from("hello world"))).toString()).toBe("hello world");
  });

  it("matches RFC 4226 HOTP vectors", () => {
    const s = Buffer.from("12345678901234567890");
    expect([0, 1, 2, 9].map((c) => hotp(s, c))).toEqual(["755224", "287082", "359152", "520489"]);
  });

  it("matches RFC 6238 vectors (last 6 digits)", () => {
    expect(verifyTotp(RFC_SECRET, "287082", 59_000)).not.toBeNull(); // 94287082
    expect(verifyTotp(RFC_SECRET, "081804", 1_111_111_109_000)).not.toBeNull(); // 07081804
    expect(verifyTotp(RFC_SECRET, "005924", 1_234_567_890_000)).not.toBeNull(); // 89005924
  });

  it("rejects wrong, malformed and expired codes", () => {
    const now = 1_700_000_000_000;
    const code = hotp(base32Decode(RFC_SECRET), Math.floor(now / 30_000));
    expect(verifyTotp(RFC_SECRET, code, now)).not.toBeNull();
    expect(verifyTotp(RFC_SECRET, code, now + 30_000)).not.toBeNull(); // drift ±1 step allowed
    expect(verifyTotp(RFC_SECRET, code, now + 120_000)).toBeNull(); // 4 steps later
    expect(verifyTotp(RFC_SECRET, "12345", now)).toBeNull();
    expect(verifyTotp(RFC_SECRET, "abcdef", now)).toBeNull();
  });
});

describe("secret encryption + backup codes", () => {
  it("encrypts with AES-GCM and detects tampering", () => {
    const key = Buffer.alloc(32, 1);
    const enc = encryptSecret("JBSWY3DPEHPK3PXP", key);
    expect(enc).not.toContain("JBSWY3DPEHPK3PXP");
    expect(decryptSecret(enc, key)).toBe("JBSWY3DPEHPK3PXP");
    const [iv, tag, body] = enc.split(".");
    const tampered = [iv, tag, Buffer.from("x" + body).toString("base64")].join(".");
    expect(() => decryptSecret(tampered, key)).toThrow();
  });

  it("generates 10 unique readable backup codes; hash ignores case and dashes", () => {
    const codes = newBackupCodes();
    expect(new Set(codes).size).toBe(10);
    codes.forEach((c) => expect(c).toMatch(/^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/));
    expect(hashBackupCode("abcd-efgh")).toBe(hashBackupCode("ABCDEFGH"));
  });
});
