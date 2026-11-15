import { describe, expect, it } from "vitest";
import {
  CastVoteInput, IMPORT_HEADER_MAP, RECEIPT_REGEX, StudentImportRow, deriveBatch, ids, receiptCode,
} from "@/lib/schema";

describe("ids", () => {
  it("builds deterministic vote and nominee IDs", () => {
    expect(ids.vote("N25H01A0693", "sports-president")).toBe("N25H01A0693_sports-president");
    expect(ids.nominee("sports-president", "N25H01A0101")).toBe("sports-president_N25H01A0101");
  });
});

describe("receiptCode", () => {
  it("matches the receipt format and never uses ambiguous characters", () => {
    for (let i = 0; i < 500; i++) {
      const code = receiptCode("Sports");
      expect(code).toMatch(RECEIPT_REGEX);
      expect(code.startsWith("SP-")).toBe(true);
      expect(code.slice(3)).not.toMatch(/[01OIL]/);
    }
  });
  it("pads short club names", () => expect(receiptCode("X").startsWith("XX-")).toBe(true));
});

describe("deriveBatch", () => {
  it("derives batch from the ID year", () => {
    expect(deriveBatch("N25H01A0693")).toBe("2025");
    expect(deriveBatch("N26H01A0001")).toBe("2026");
    expect(deriveBatch("XYZ123")).toBe("unknown");
  });
});

// SEEDDATA §5 edge cases
describe("StudentImportRow", () => {
  const base = { niatId: "N25H01A0693", name: "Tarun Test", email: "t@example.com", phone: "9876543210", admissionNo: "adm1" };

  it("normalises email, phone, ID, admission and name spacing", () => {
    const r = StudentImportRow.parse({
      ...base, niatId: "n25h01a0694 ", name: "priya   sharma", email: " Tarun.Test@Example.com ",
      phone: "+91-98765 43210", admissionNo: 25125,
    });
    expect(r).toMatchObject({
      niatId: "N25H01A0694", name: "priya sharma", email: "tarun.test@example.com",
      phone: "+919876543210", admissionNo: "25125",
    });
  });

  it("coerces numeric phone cells", () => {
    expect(StudentImportRow.parse({ ...base, phone: 9988776655 }).phone).toBe("+919988776655");
  });

  it.each([
    ["bad email", { email: "bad-email@" }],
    ["bad phone", { phone: "12345" }],
    ["missing name", { name: "" }],
    ["non-Indian mobile", { phone: "5876543210" }],
  ])("rejects %s", (_label, override) => {
    expect(StudentImportRow.safeParse({ ...base, ...override }).success).toBe(false);
  });

  it("maps alternate header spellings", () => {
    expect(["student id", "full name", "email id", "mobile number", "admission number", "year"].map((h) => IMPORT_HEADER_MAP[h]))
      .toEqual(["niatId", "name", "email", "phone", "admissionNo", "batch"]);
  });
});

describe("CastVoteInput", () => {
  it("rejects a nominee from another position", () => {
    expect(
      CastVoteInput.safeParse({ voterId: "N25H01A0693", positionId: "sports-president", nomineeId: "media-head_N25H01A0101" }).success,
    ).toBe(false);
  });
});

describe("MfaCodeInput", () => {
  it("accepts 6-digit codes and backup codes, rejects junk", async () => {
    const { MfaCodeInput } = await import("@/lib/schema");
    expect(MfaCodeInput.safeParse({ code: "000000" }).success).toBe(true);
    expect(MfaCodeInput.safeParse({ code: "TEST-2222" }).success).toBe(true);
    expect(MfaCodeInput.safeParse({ code: "dddddd" }).success).toBe(false);
    expect(MfaCodeInput.safeParse({ code: "12345" }).success).toBe(false);
  });
});

describe("official sheet layouts (27 hall tabs)", () => {
  const norm = (h: string) => IMPORT_HEADER_MAP[h.trim().toLowerCase().replace(/\s+/g, " ")];

  it("maps the 2025 layout: CDU Hall Ticket No → admissionNo; S.No ignored", () => {
    expect(norm("CDU Hall Ticket No")).toBe("admissionNo");
    expect(norm("NIAT ID")).toBe("niatId");
    expect(norm("Mobile")).toBe("phone");
    expect(norm("S.No")).toBeUndefined();
    const r = StudentImportRow.parse({ niatId: "N25H01A0001", name: "Test  Person", phone: "9391760000", email: "a@b.com", admissionNo: "25cam2244" });
    expect(r.admissionNo).toBe("25CAM2244");
    expect(r.name).toBe("Test Person");
  });

  it("accepts the 2026 layout with no hall ticket; father columns are never mapped", () => {
    expect(norm("Father Name")).toBeUndefined();
    expect(norm("Father Mobile")).toBeUndefined();
    expect(norm("Branch")).toBeUndefined();
    const r = StudentImportRow.parse({ niatId: "N26H01A0001", name: "Junior Person", phone: "8500100000", email: "j@b.com" });
    expect(r.admissionNo).toBeUndefined();
    expect(StudentImportRow.parse({ niatId: "N26H01A0002", name: "Junior Two", phone: "8500100001", email: "k@b.com", admissionNo: "" }).admissionNo).toBeUndefined();
  });
});
