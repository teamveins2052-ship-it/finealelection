import { readFileSync } from "node:fs";
import { beforeAll, afterAll, beforeEach, describe, it } from "vitest";
import {
  initializeTestEnvironment, assertSucceeds, assertFails, type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp, Timestamp, collection, getDocs, query, where } from "firebase/firestore";

let env: RulesTestEnvironment;
const HOUR = 3600_000;

const ME = { niatId: "N25H01A0693", email: "tarun@example.com" };
const FRIEND = { niatId: "N25H01A0700", email: "friend@example.com" };
const POS = "sports-president";
const NOM = `${POS}_N25H01A0101`;

/** Signed-in user who has passed 2-step for this sign-in (mfa claim == auth_time). */
const asUser = (email: string, verified = true, opts: { mfa?: boolean; ageSec?: number } = {}) => {
  const authTime = Math.floor(Date.now() / 1000) - (opts.ageSec ?? 60);
  const claims: Record<string, unknown> = { email, email_verified: verified, auth_time: authTime };
  if (opts.mfa !== false) claims.mfa = authTime;
  return env.authenticatedContext(email, claims).firestore();
};

async function seed(opts: { paused?: boolean; open?: boolean; myStatus?: string } = {}) {
  const { paused = false, open = true, myStatus = "active" } = opts;
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const now = Date.now();
    await setDoc(doc(db, "settings/election"), {
      phase: "voting", paused,
      campaignOpensAt: Timestamp.fromMillis(now - 48 * HOUR),
      opensAt: Timestamp.fromMillis(open ? now - HOUR : now + HOUR),
      closesAt: Timestamp.fromMillis(open ? now + HOUR : now + 2 * HOUR),
      siteClosesAt: Timestamp.fromMillis(now + 72 * HOUR),
      nomineesCanSelfVote: true, resultsPublished: false, receiptsByEmail: true,
    });
    await setDoc(doc(db, `students/${ME.niatId}`), { email: ME.email, status: myStatus, isNominee: false, nomineeOf: null });
    await setDoc(doc(db, `students/${FRIEND.niatId}`), { email: FRIEND.email, status: "active", isNominee: false, nomineeOf: null });
    await setDoc(doc(db, `students/N25H01A0101`), { email: "ravi@example.com", status: "active", isNominee: true, nomineeOf: POS });
    await setDoc(doc(db, `positions/${POS}`), { active: true });
    await setDoc(doc(db, `nominees/${NOM}`), { niatId: "N25H01A0101", positionId: POS, active: true, bio: "", promises: [], photoUrl: null });
    await setDoc(doc(db, "admins/admin@example.com"), { canViewVoters: false });
    await setDoc(doc(db, "admins/judge@example.com"), { canViewVoters: true });
  });
}

const voteFor = (db: ReturnType<typeof asUser>, voterId = ME.niatId, nomineeId = NOM) =>
  setDoc(doc(db, `votes/${voterId}_${POS}`), { voterId, positionId: POS, nomineeId, createdAt: serverTimestamp() });

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-niat-elections-rules-test", // isolated from dev data (clearFirestore wipes the project)
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
  });
});
afterAll(async () => env.cleanup());
beforeEach(async () => env.clearFirestore());

describe("P-VOT-02 vote creation", () => {
  it("allows a valid first vote", async () => { await seed(); await assertSucceeds(voteFor(asUser(ME.email))); });

  it("V-4: blocks a second vote in the same position", async () => {
    await seed(); const db = asUser(ME.email);
    await assertSucceeds(voteFor(db));
    await assertFails(voteFor(db));
  });

  it("V-1: blocks voting as someone else", async () => {
    await seed(); await assertFails(voteFor(asUser(ME.email), FRIEND.niatId));
  });

  it("V-1: blocks unverified email", async () => {
    await seed(); await assertFails(voteFor(asUser(ME.email, false)));
  });

  it("V-1: blocks a pending account", async () => {
    await seed({ myStatus: "pending" }); await assertFails(voteFor(asUser(ME.email)));
  });

  it("V-2: blocks while paused", async () => {
    await seed({ paused: true }); await assertFails(voteFor(asUser(ME.email)));
  });

  it("V-3: blocks outside the window", async () => {
    await seed({ open: false }); await assertFails(voteFor(asUser(ME.email)));
  });

  it("V-5: blocks injected fields", async () => {
    await seed();
    await assertFails(setDoc(doc(asUser(ME.email), `votes/${ME.niatId}_${POS}`), {
      voterId: ME.niatId, positionId: POS, nomineeId: NOM, createdAt: serverTimestamp(), counted: true,
    }));
  });

  it("V-7: blocks a nominee from another position", async () => {
    await seed();
    await assertFails(voteFor(asUser(ME.email), ME.niatId, "media-head_N25H01A0101"));
  });
});

describe("P-VOT-01 / P-VOT-03 vote privacy & immutability", () => {
  it("owner can read own vote; others cannot", async () => {
    await seed(); await voteFor(asUser(ME.email));
    await assertSucceeds(getDoc(doc(asUser(ME.email), `votes/${ME.niatId}_${POS}`)));
    await assertFails(getDoc(doc(asUser(FRIEND.email), `votes/${ME.niatId}_${POS}`)));
  });

  it("plain admin cannot read votes; voter-admin can", async () => {
    await seed(); await voteFor(asUser(ME.email));
    await assertFails(getDoc(doc(asUser("admin@example.com"), `votes/${ME.niatId}_${POS}`)));
    await assertSucceeds(getDoc(doc(asUser("judge@example.com"), `votes/${ME.niatId}_${POS}`)));
  });

  it("nobody can update or delete a vote", async () => {
    await seed(); await voteFor(asUser(ME.email));
    await assertFails(updateDoc(doc(asUser(ME.email), `votes/${ME.niatId}_${POS}`), { nomineeId: NOM }));
    await assertFails(deleteDoc(doc(asUser("judge@example.com"), `votes/${ME.niatId}_${POS}`)));
  });

  it("students cannot list other people's votes", async () => {
    await seed();
    await assertFails(getDocs(query(collection(asUser(ME.email), "votes"), where("positionId", "==", POS))));
  });
});

describe("server-owned data", () => {
  it("P-TAL-02: clients cannot write tallies", async () => {
    await seed(); await assertFails(setDoc(doc(asUser("judge@example.com"), `tallies/${POS}`), { total: 9999 }));
  });
  it("P-DIR-01: directory is unreadable from clients", async () => {
    await seed(); await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), `directory/${ME.niatId}`)));
  });
  it("P-ANO-01: question authors hidden from nominee and plain admin", async () => {
    await seed();
    await assertFails(getDoc(doc(asUser("ravi@example.com"), "questionAuthors/q1")));
    await assertFails(getDoc(doc(asUser("admin@example.com"), "questionAuthors/q1")));
  });
  it("P-AUD-02: nobody writes audit logs from the client", async () => {
    await seed(); await assertFails(setDoc(doc(asUser("judge@example.com"), "auditLogs/x"), { action: "vote_cast" }));
  });
});

describe("P-STU / P-NOM ownership", () => {
  it("student can only change session fields on own record", async () => {
    await seed(); const db = asUser(ME.email);
    await assertSucceeds(updateDoc(doc(db, `students/${ME.niatId}`), { activeSessionId: "s_1", lastLoginAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(db, `students/${ME.niatId}`), { phone: "+919999999999" }));
    await assertFails(updateDoc(doc(db, `students/${FRIEND.niatId}`), { activeSessionId: "s_2", lastLoginAt: serverTimestamp() }));
  });

  it("nominee edits own bio, not a rival's", async () => {
    await seed();
    await assertSucceeds(updateDoc(doc(asUser("ravi@example.com"), `nominees/${NOM}`), { bio: "Hi", updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(asUser(ME.email), `nominees/${NOM}`), { bio: "Hacked", updatedAt: serverTimestamp() }));
  });
});

// ---------- additional abuse cases (beyond RLSPOLICIES §12) ----------
const RAVI = { niatId: "N25H01A0101", email: "ravi@example.com" };
const patch = (path: string, data: Record<string, unknown>) =>
  env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path), data, { merge: true });
  });

describe("P-VOT-02 extra conditions", () => {
  it("V-9: nominee can self-vote only when nomineesCanSelfVote is true", async () => {
    await seed();
    await patch("settings/election", { nomineesCanSelfVote: false });
    await assertFails(voteFor(asUser(RAVI.email), RAVI.niatId, NOM));
    await patch("settings/election", { nomineesCanSelfVote: true });
    await assertSucceeds(voteFor(asUser(RAVI.email), RAVI.niatId, NOM));
  });

  it("V-7: blocks a vote for an inactive nominee", async () => {
    await seed();
    await patch(`nominees/${NOM}`, { active: false });
    await assertFails(voteFor(asUser(ME.email)));
  });

  it("V-8: blocks a vote in an inactive position", async () => {
    await seed();
    await patch(`positions/${POS}`, { active: false });
    await assertFails(voteFor(asUser(ME.email)));
  });

  it("V-1: blocks a disabled account", async () => {
    await seed({ myStatus: "disabled" });
    await assertFails(voteFor(asUser(ME.email)));
  });

  it("V-4: blocks a vote whose doc ID doesn't match voter+position", async () => {
    await seed();
    await assertFails(
      setDoc(doc(asUser(ME.email), `votes/${ME.niatId}_other-position`), {
        voterId: ME.niatId, positionId: POS, nomineeId: NOM, createdAt: serverTimestamp(),
      }),
    );
  });

  it("V-6: blocks a client-chosen createdAt", async () => {
    await seed();
    await assertFails(
      setDoc(doc(asUser(ME.email), `votes/${ME.niatId}_${POS}`), {
        voterId: ME.niatId, positionId: POS, nomineeId: NOM, createdAt: Timestamp.fromMillis(Date.now() - HOUR),
      }),
    );
  });

  it("unauthenticated users cannot vote", async () => {
    await seed();
    await assertFails(voteFor(env.unauthenticatedContext().firestore()));
  });
});

describe("P-STU-01 / P-SET-02", () => {
  it("pending student can read own doc (to see status) but not others'", async () => {
    await seed({ myStatus: "pending" });
    await assertSucceeds(getDoc(doc(asUser(ME.email), `students/${ME.niatId}`)));
    await assertFails(getDoc(doc(asUser(ME.email), `students/${FRIEND.niatId}`)));
  });

  it("students cannot write settings; admins cannot save out-of-order dates", async () => {
    await seed();
    const now = Date.now();
    const settings = (email: string, closeOffset: number) => ({
      phase: "voting", paused: true,
      opensAt: Timestamp.fromMillis(now), closesAt: Timestamp.fromMillis(now + closeOffset),
      siteClosesAt: Timestamp.fromMillis(now + 72 * HOUR),
      updatedBy: email, updatedAt: serverTimestamp(),
    });
    await assertFails(setDoc(doc(asUser(ME.email), "settings/election"), settings(ME.email, HOUR)));
    await assertFails(setDoc(doc(asUser("admin@example.com"), "settings/election"), settings("admin@example.com", -HOUR)));
    await assertSucceeds(setDoc(doc(asUser("admin@example.com"), "settings/election"), settings("admin@example.com", HOUR)));
  });
});

describe("P-NOM-02 photoUrl", () => {
  it("nominee can save bio while keeping an existing (non-R2) photo, but can't set an arbitrary URL", async () => {
    await seed();
    await patch(`nominees/${NOM}`, { photoUrl: "http://localhost:3000/seed-media/avatar-1.svg" });
    const db = asUser(RAVI.email);
    await assertSucceeds(updateDoc(doc(db, `nominees/${NOM}`), {
      bio: "Hello", photoUrl: "http://localhost:3000/seed-media/avatar-1.svg", updatedAt: serverTimestamp(),
    }));
    await assertFails(updateDoc(doc(db, `nominees/${NOM}`), { photoUrl: "https://evil.example.com/x.png", updatedAt: serverTimestamp() }));
  });
});


describe("2-step verification (custom claim mfa == auth_time)", () => {
  it("admin without 2-step can read only their own admin doc, nothing admin-only", async () => {
    await seed();
    const db = asUser("judge@example.com", true, { mfa: false });
    await assertSucceeds(getDoc(doc(db, "admins/judge@example.com")));
    await assertFails(getDoc(doc(db, "admins/admin@example.com")));
    await assertFails(getDoc(doc(db, "auditLogs/x")));
    await assertFails(getDoc(doc(db, `students/${ME.niatId}`)));
  });

  it("admin with a stale 2-step claim (from an earlier sign-in) is denied", async () => {
    await seed();
    const authTime = Math.floor(Date.now() / 1000) - 60;
    const db = env.authenticatedContext("judge@example.com", { email: "judge@example.com", email_verified: true, auth_time: authTime, mfa: authTime - 3600 }).firestore();
    await assertFails(getDoc(doc(db, "auditLogs/x")));
  });

  it("admin sessions older than 12 h are denied", async () => {
    await seed();
    await assertFails(getDoc(doc(asUser("judge@example.com", true, { ageSec: 13 * 3600 }), "auditLogs/x")));
    await assertSucceeds(getDoc(doc(asUser("judge@example.com", true, { ageSec: 11 * 3600 }), "auditLogs/x")));
  });

  it("student can't vote without 2-step while it's required", async () => {
    await seed();
    await assertFails(voteFor(asUser(ME.email, true, { mfa: false })));
  });

  it("student can vote without 2-step when the committee turns the requirement off", async () => {
    await seed();
    await patch("settings/election", { requireStudentMfa: false });
    await assertSucceeds(voteFor(asUser(ME.email, true, { mfa: false })));
  });

  it("student can still read their own record before 2-step (to show status / 2-step screen)", async () => {
    await seed();
    await assertSucceeds(getDoc(doc(asUser(ME.email, true, { mfa: false }), `students/${ME.niatId}`)));
  });

  it("P-MFA-05: optional mode — a student who opted in still needs the code to vote", async () => {
    await seed();
    await patch("settings/election", { requireStudentMfa: false });
    await patch(`students/${ME.niatId}`, { mfaEnabled: true });
    await assertFails(voteFor(asUser(ME.email, true, { mfa: false })));
    await assertSucceeds(voteFor(asUser(ME.email, true)));
  });

  it("P-MFA-05: a student can't switch their own opt-in flag off", async () => {
    await seed();
    await patch(`students/${ME.niatId}`, { mfaEnabled: true });
    await assertFails(updateDoc(doc(asUser(ME.email, true, { mfa: false }), `students/${ME.niatId}`), { mfaEnabled: false }));
  });

  it("nobody can read the mfa collection from the client", async () => {
    await seed();
    await assertFails(getDoc(doc(asUser("judge@example.com"), "mfa/some-uid")));
  });
});
