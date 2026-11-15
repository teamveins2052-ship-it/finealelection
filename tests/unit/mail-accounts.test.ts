import { describe, expect, it } from "vitest";
import { mailAccounts, pickAccount } from "../../functions/src/lib/mail-accounts";

describe("Brevo account switching", () => {
  it("reads one or two accounts from env, each with its own sender", () => {
    expect(mailAccounts({})).toEqual([]);
    expect(mailAccounts({ BREVO_API_KEY: "k1", EMAIL_FROM: "a@x.com" })).toEqual([{ key: "k1", from: "a@x.com" }]);
    expect(mailAccounts({ BREVO_API_KEY: "k1", EMAIL_FROM: "a@x.com", BREVO_API_KEY_2: "k2", EMAIL_FROM_2: "b@x.com" })).toEqual([
      { key: "k1", from: "a@x.com" },
      { key: "k2", from: "b@x.com" },
    ]);
  });

  it("uses account 1 until its cap, then account 2, then reports full", () => {
    expect(pickAccount({ sent: [0, 0], full: [false, false] }, 2, 280)).toBe(0);
    expect(pickAccount({ sent: [279, 0], full: [false, false] }, 2, 280)).toBe(0);
    expect(pickAccount({ sent: [280, 0], full: [false, false] }, 2, 280)).toBe(1);
    expect(pickAccount({ sent: [280, 280], full: [false, false] }, 2, 280)).toBe(-1);
  });

  it("skips an account Brevo refused today even if under the cap", () => {
    expect(pickAccount({ sent: [10, 0], full: [true, false] }, 2, 280)).toBe(1);
    expect(pickAccount({ sent: [10, 5], full: [true, true] }, 2, 280)).toBe(-1);
  });

  it("supports a third account and switches 1 → 2 → 3", () => {
    const env = { BREVO_API_KEY: "k1", EMAIL_FROM: "a@x.com", BREVO_API_KEY_2: "k2", EMAIL_FROM_2: "b@x.com", BREVO_API_KEY_3: "k3", EMAIL_FROM_3: "c@x.com" };
    expect(mailAccounts(env).map((a) => a.from)).toEqual(["a@x.com", "b@x.com", "c@x.com"]);
    expect(pickAccount({ sent: [280, 279, 0], full: [false, false, false] }, 3, 280)).toBe(1);
    expect(pickAccount({ sent: [280, 280, 0], full: [false, false, false] }, 3, 280)).toBe(2);
    expect(pickAccount({ sent: [280, 280, 280], full: [false, false, false] }, 3, 280)).toBe(-1);
  });

  it("ignores empty key slots (e.g. key 2 blank, key 3 filled)", () => {
    expect(mailAccounts({ BREVO_API_KEY: "k1", EMAIL_FROM: "a@x.com", BREVO_API_KEY_2: "", BREVO_API_KEY_3: "k3", EMAIL_FROM_3: "c@x.com" }).map((a) => a.key)).toEqual(["k1", "k3"]);
  });

  it("works with a single account", () => {
    expect(pickAccount({ sent: [100], full: [false] }, 1, 280)).toBe(0);
    expect(pickAccount({ sent: [280], full: [false] }, 1, 280)).toBe(-1);
  });
});
