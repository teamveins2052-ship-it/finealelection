# NIAT Campus Elections 2026 — Access Policies (RLSPOLICIES.md)

> **Note on the name:** "RLS" (Row-Level Security) is a PostgreSQL/Supabase term. This project runs on **Firebase**, so the equivalent is **Firestore Security Rules + Realtime Database Rules**, plus authorization checks inside **Cloud Functions**, **edge API routes** and **R2 upload signing**. This document is the **single source of truth** for who can do what, everywhere.
> `firestore.rules` in §5 is authoritative — `DATAMODEL.md §7` mirrors it.

---

## 1. Principles

1. **Deny by default.** Every path is closed unless a policy below opens it.
2. **Database enforces, UI only reflects.** Hiding a button is never security.
3. **Identity = verified email ↔ sheet.** A caller is student `X` only if `request.auth.token.email_verified == true` and their email equals `students/X.email` and `status == 'active'`.
4. **Votes are append-only.** No update, no delete — by anyone, including admins (recount is read-only over votes).
5. **Server-owned fields stay server-owned.** Counters, tallies, receipts, audit logs, status, nominee flags: written only by Cloud Functions (Admin SDK).
6. **Anonymity by data separation.** Who-asked / who-commented / who-voted live in documents that only voter-viewing admins can read.
7. **Least privilege for admins.** Two admin tiers; seeing voters is a separate permission and every view is audited.
8. **Time comes from the server.** `request.time` in rules, server clock in functions — never the client's clock.

---

## 2. Roles & How They're Proven

| Role | Proven by | Notes |
|---|---|---|
| `anon` | No auth token | Landing page, directory lookup (API), correction request (callable + Turnstile) |
| `student` | Firebase ID token, `email_verified`, email matches an **active** `students/{niatId}` | Every signed-in student |
| `nominee` | `student` **and** `students/{niatId}.isNominee == true` **and** owns `nominees/{positionId}_{niatId}` | Set only by admin callable |
| `admin` | `student`-style token **and** doc `admins/{email}` exists | Manages everything except voter identities |
| `voterAdmin` | `admin` **and** `admins/{email}.canViewVoters == true` | Can see who voted for whom + Q&A/comment authors. Keep to 1–2 people |
| `system` | Cloud Functions Admin SDK / service account | Bypasses rules — so functions must self-check (§6) |

> Admins don't need to be in the student sheet. Their verified email in `admins/` is enough.

---

## 3. Policy Matrix — Firestore

✅ allowed · ❌ denied · 🔒 allowed with conditions (see policy ID) · ⚙️ server/function only

| Collection | Op | anon | student | nominee | admin | voterAdmin | Policy |
|---|---|---|---|---|---|---|---|
| `admins` | read | ❌ | ❌ | ❌ | ✅ | ✅ | P-ADM-01 |
| | write | ❌ | ❌ | ❌ | ⚙️ | ⚙️ | P-ADM-02 |
| `students` | read | ❌ | 🔒 own | 🔒 own | ✅ | ✅ | P-STU-01 |
| | update | ❌ | 🔒 session fields | 🔒 session fields | ⚙️ | ⚙️ | P-STU-02 |
| | create/delete | ❌ | ❌ | ❌ | ⚙️ | ⚙️ | P-STU-03 |
| `directory` | any | ❌ (API only) | ❌ | ❌ | ❌ | ❌ | P-DIR-01 |
| `correctionRequests` | read | ❌ | ❌ | ❌ | ✅ | ✅ | P-REQ-01 |
| | write | ⚙️ callable | ⚙️ | ⚙️ | ⚙️ resolve | ⚙️ | P-REQ-02 |
| `positions` | read | ❌ (API) | ✅ | ✅ | ✅ | ✅ | P-POS-01 |
| | write | ❌ | ❌ | ❌ | ✅ | ✅ | P-POS-02 |
| `nominees` | read | ❌ (API) | ✅ | ✅ | ✅ | ✅ | P-NOM-01 |
| | update | ❌ | ❌ | 🔒 own profile fields, before close | ⚙️ | ⚙️ | P-NOM-02 |
| | create/delete | ❌ | ❌ | ❌ | ⚙️ `setNominee` (not during voting) | ⚙️ | P-NOM-03 |
| `votes` | read | ❌ | 🔒 own | 🔒 own | ❌ | ✅ | P-VOT-01 |
| | create | ❌ | 🔒 V-1…V-9 | 🔒 V-1…V-9 | ❌ | ❌ | P-VOT-02 |
| | update/delete | ❌ | ❌ | ❌ | ❌ | ❌ | P-VOT-03 |
| `tallies` | read | ❌ (RTDB) | ❌ (RTDB) | ❌ (RTDB) | ✅ | ✅ | P-TAL-01 |
| | write | ❌ | ❌ | ❌ | ❌ | ❌ | ⚙️ P-TAL-02 |
| `posts` | read | ❌ | ✅ | ✅ | ✅ | ✅ | P-PST-01 |
| | create | ❌ | ❌ | 🔒 own, campaign open | ❌ | ❌ | P-PST-02 |
| | update | ❌ | ❌ | 🔒 soft-delete own | 🔒 soft-delete any | 🔒 | P-PST-03 |
| `questions` | read | ❌ | ✅ | ✅ | ✅ | ✅ | P-QNA-01 |
| | create | ❌ | ⚙️ `askQuestion` | ⚙️ | — | — | P-QNA-02 |
| | update | ❌ | ❌ | 🔒 answer own | 🔒 hide | 🔒 hide | P-QNA-03 |
| `questionAuthors` / `commentAuthors` | read | ❌ | ❌ | ❌ | ❌ | ✅ | P-ANO-01 |
| | write | ❌ | ⚙️ | ⚙️ | ⚙️ | ⚙️ | P-ANO-02 |
| `comments` | read | ❌ | ✅ | ✅ | ✅ | ✅ | P-CMT-01 |
| | create | ❌ | ⚙️ `addComment` | ⚙️ | — | — | P-CMT-02 |
| | update | ❌ | ❌ | ❌ | 🔒 hide | 🔒 hide | P-CMT-03 |
| `reactions` | read | ❌ | 🔒 own | 🔒 own | ❌ | ❌ | P-RCT-01 |
| | create/update/delete | ❌ | 🔒 own, one per nominee | 🔒 | ❌ | ❌ | P-RCT-02 |
| `debates` | read | ❌ | ✅ | ✅ | ✅ | ✅ | P-DEB-01 |
| | write | ❌ | ❌ | ⚙️ `answerDebate` | ✅ question | ✅ | P-DEB-02 |
| `predictions` | read | ❌ | 🔒 own | 🔒 own | ✅ | ✅ | P-PRD-01 |
| | write | ❌ | 🔒 own, before close | 🔒 | ❌ | ❌ | P-PRD-02 |
| `pulsePolls` | read | ❌ | ✅ | ✅ | ✅ | ✅ | P-PUL-01 |
| | write | ❌ | ❌ | ❌ | ✅ | ✅ | P-PUL-02 |
| `pulseVotes` | read | ❌ | 🔒 own | 🔒 own | ❌ | ❌ | P-PUL-03 |
| | create | ❌ | 🔒 once, poll active | 🔒 | ❌ | ❌ | P-PUL-04 |
| `banners` | read | ✅ | ✅ | ✅ | ✅ | ✅ | P-BAN-01 |
| | write | ❌ | ❌ | ❌ | ✅ | ✅ | P-BAN-02 |
| `settings` | read | ✅ | ✅ | ✅ | ✅ | ✅ | P-SET-01 |
| | write | ❌ | ❌ | ❌ | ✅ (validated) | ✅ | P-SET-02 |
| `auditLogs` | read | ❌ | ❌ | ❌ | ✅ | ✅ | P-AUD-01 |
| | write | ❌ | ❌ | ❌ | ❌ | ❌ | ⚙️ P-AUD-02 |

> **Admins can't vote-edit and can't read votes unless `canViewVoters`.** A plain admin manages the election; a voter-admin audits it.

### Vote creation conditions (P-VOT-02)
| ID | Condition |
|---|---|
| V-1 | Caller is the verified, **active** owner of `voterId` |
| V-2 | `settings.paused == false` |
| V-3 | `opensAt ≤ request.time < closesAt` |
| V-4 | Doc ID == `voterId + "_" + positionId` (one per position) |
| V-5 | Only fields `voterId, positionId, nomineeId, createdAt` |
| V-6 | `createdAt == request.time` |
| V-7 | `nomineeId` starts with `positionId + "_"` and that nominee is `active` |
| V-8 | Position exists and is `active` |
| V-9 | Self-vote allowed unless `nomineesCanSelfVote == false` |

---

## 4. Policy Matrix — Other Layers

### Realtime Database
| Path | Read | Write | Policy |
|---|---|---|---|
| `/tallies`, `/wall`, `/election`, `/pulse`, `/predictionLeaderboard` | public | ⚙️ functions only | P-RTD-01 |
| everything else | ❌ | ❌ | P-RTD-02 |

### Edge API routes (Cloudflare Workers)
| Route | Who | Extra guards | Policy |
|---|---|---|---|
| `GET /api/directory/:niatId` | anon | Turnstile (first lookup), rate limit 10/min/IP + 5/10 min per ID; returns **masked** data only; same response shape for "not found" vs "disabled" | P-API-01 |
| `GET /api/positions`, `/api/nominees/*`, `/api/banners`, `/api/settings` | anon | Public fields only, cached | P-API-02 |
| `POST /api/media/upload-url` | nominee | Verified token, nominee check, type/size allow-list, key prefix `nominees/{callerNiatId}/`, 30/h | P-API-03 |
| `GET /api/og/*` | anon | No PII; first name + club only | P-API-04 |

### Cloud Functions (callables)
| Callable | Who | Policy |
|---|---|---|
| `requestCorrection` | anon (App Check + Turnstile) | P-FN-01 |
| `askQuestion`, `addComment` | student | P-FN-02 |
| `answerDebate` | nominee (own position) | P-FN-03 |
| `setNominee`, `importStudents`, `resolveRequest`, `sendReminders`, `exportElection`, `recountPosition`, `verifyIntegrity` | admin | P-FN-04 |
| `getVotersForNominee` (if served via function) | voterAdmin + audit `voters_viewed` | P-FN-05 |
| `cleanupPII` | voterAdmin + typed confirmation | P-FN-06 |
| Triggers (`onVoteCreated` etc.) | system | P-FN-07 (idempotent, self-validating) |

### R2 storage
| Bucket | Read | Write | Policy |
|---|---|---|---|
| `niat-elections-media` | public CDN | presigned PUT only, 5-min expiry, key prefix bound to caller | P-R2-01 |
| `niat-elections-exports` | signed GET (15 min) for admins | ⚙️ functions | P-R2-02 |

### App Check
Enforced on **Firestore, RTDB, Functions** (reCAPTCHA Enterprise or Turnstile provider). Requests from scripts without a valid app attestation are rejected even with a valid user token. Enable in **monitor mode on 17 Nov**, **enforce on 18 Nov** after checking metrics. (P-APP-01)

---

## 5. `firestore.rules` (authoritative)

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {

    // ======================= helpers =======================
    function signedIn()   { return request.auth != null && request.auth.token.email_verified == true; }
    function myEmail()    { return request.auth.token.email.lower(); }
    function adminDoc()   { return /databases/$(db)/documents/admins/$(myEmail()); }
    // 2-step proof: custom claim `mfa` == this sign-in's auth_time (set by mfaVerify / mfaEnrollConfirm).
    function mfaOk()      { return request.auth.token.get('mfa', -1) == request.auth.token.get('auth_time', -2); }
    // Admin sessions must be < 12 h old (forces a fresh sign-in + 2-step at least twice a day).
    function freshAdminSession() { return request.auth.token.auth_time > request.time.toMillis() / 1000 - 43200; }
    function isAdmin()    { return signedIn() && exists(adminDoc()) && mfaOk() && freshAdminSession(); }
    function isVoterAdmin() { return isAdmin() && get(adminDoc()).data.canViewVoters == true; }

    function studentPath(id) { return /databases/$(db)/documents/students/$(id); }
    function studentDoc(id)  { return get(studentPath(id)).data; }
    // P-STU core: verified, active owner of student id
    function isStudent(id) {
      return signedIn() && exists(studentPath(id))
          && studentDoc(id).email == myEmail()
          && studentDoc(id).status == 'active'
          && (election().get('requireStudentMfa', true) == false || mfaOk());   // 2-step for students
    }
    function isNomineeOwner(nomineeId) {
      let n = get(/databases/$(db)/documents/nominees/$(nomineeId)).data;
      return isStudent(n.niatId) && n.active == true;
    }

    function election()   { return get(/databases/$(db)/documents/settings/election).data; }
    function votingOpen() {
      let e = election();
      return e.paused == false && request.time >= e.opensAt && request.time < e.closesAt;
    }
    function campaignOpen() { return request.time < election().closesAt; }

    function onlyChanged(fields) { return request.resource.data.diff(resource.data).affectedKeys().hasOnly(fields); }
    function hasOnly(fields)     { return request.resource.data.keys().hasOnly(fields); }
    function str(v, max)         { return v is string && v.size() <= max; }
    function nowStamp(field)     { return request.resource.data[field] == request.time; }

    // ======================= admins =======================
    match /admins/{email} {
      allow read: if isAdmin() || (signedIn() && email == myEmail());    // P-ADM-01 (own doc: lets the app show the 2-step screen)
      allow write: if false;                                              // P-ADM-02
    }

    // ======================= students =======================
    match /students/{niatId} {
      allow read: if isAdmin()
                  || (signedIn() && resource.data.email == myEmail());   // P-STU-01 (pending users can read own doc to see status)
      allow update: if signedIn()
                    && resource.data.email == myEmail()
                    && resource.data.status == 'active'
                    && onlyChanged(['activeSessionId', 'lastLoginAt'])
                    && str(request.resource.data.activeSessionId, 64)
                    && nowStamp('lastLoginAt');                           // P-STU-02
      allow create, delete: if false;                                     // P-STU-03
    }

    match /directory/{niatId}      { allow read, write: if false; }       // P-DIR-01
    match /correctionRequests/{id} {
      allow read: if isAdmin();                                           // P-REQ-01
      allow write: if false;                                              // P-REQ-02
    }

    // ======================= ballot =======================
    match /positions/{positionId} {
      allow read: if signedIn();                                          // P-POS-01
      allow write: if isAdmin();                                          // P-POS-02
    }

    match /nominees/{nomineeId} {
      allow read: if signedIn();                                          // P-NOM-01
      allow update: if isStudent(resource.data.niatId)
                    && resource.data.active == true
                    && campaignOpen()
                    && onlyChanged(['photoUrl', 'bio', 'promises', 'updatedAt'])
                    && (request.resource.data.photoUrl == null
                        || request.resource.data.photoUrl == resource.data.photoUrl   // keeping the current photo is always fine
                        || request.resource.data.photoUrl.matches('^https://media\\.YOURDOMAIN\\.com/nominees/' + resource.data.niatId + '/.*'))
                    && str(request.resource.data.bio, 300)
                    && request.resource.data.promises is list
                    && request.resource.data.promises.size() <= 6
                    && nowStamp('updatedAt');                             // P-NOM-02
      allow create, delete: if false;                                     // P-NOM-03
    }

    match /votes/{voteId} {
      allow read: if isVoterAdmin()
                  || (resource != null && isStudent(resource.data.voterId));     // P-VOT-01
      allow create: if isStudent(request.resource.data.voterId)                  // V-1
        && votingOpen()                                                          // V-2, V-3
        && voteId == request.resource.data.voterId + '_' + request.resource.data.positionId  // V-4
        && hasOnly(['voterId', 'positionId', 'nomineeId', 'createdAt'])          // V-5
        && nowStamp('createdAt')                                                 // V-6
        && request.resource.data.nomineeId.matches('^' + request.resource.data.positionId + '_[A-Z0-9]+$')
        && get(/databases/$(db)/documents/nominees/$(request.resource.data.nomineeId)).data.active == true   // V-7
        && get(/databases/$(db)/documents/positions/$(request.resource.data.positionId)).data.active == true // V-8
        && (election().nomineesCanSelfVote == true
            || request.resource.data.nomineeId != request.resource.data.positionId + '_' + request.resource.data.voterId); // V-9
      allow update, delete: if false;                                            // P-VOT-03
    }

    match /tallies/{positionId} {
      allow read: if isAdmin();                                           // P-TAL-01
      allow write: if false;                                              // P-TAL-02
    }

    // ======================= campaign content =======================
    match /posts/{postId} {
      allow read: if signedIn();                                          // P-PST-01
      allow create: if isStudent(request.resource.data.niatId)
                    && studentDoc(request.resource.data.niatId).isNominee == true
                    && request.resource.data.nomineeId
                         == studentDoc(request.resource.data.niatId).nomineeOf + '_' + request.resource.data.niatId
                    && campaignOpen()
                    && hasOnly(['nomineeId', 'niatId', 'type', 'mediaUrl', 'posterUrl', 'caption',
                                'durationSec', 'expiresAt', 'commentCount', 'deleted', 'createdAt'])
                    && request.resource.data.type in ['photo', 'video', 'poster', 'story']
                    && request.resource.data.mediaUrl.matches('^https://media\\.YOURDOMAIN\\.com/nominees/' + request.resource.data.niatId + '/.*')
                    && str(request.resource.data.caption, 200)
                    && (request.resource.data.type != 'video'
                        || (request.resource.data.durationSec is number && request.resource.data.durationSec <= 30))
                    && (request.resource.data.type != 'story'
                        || request.resource.data.expiresAt == request.time + duration.value(24, 'h'))
                    && request.resource.data.commentCount == 0
                    && request.resource.data.deleted == false
                    && nowStamp('createdAt');                             // P-PST-02
      allow update: if request.resource.data.deleted == true
                    && onlyChanged(['deleted', 'deletedBy'])
                    && (isStudent(resource.data.niatId) || isAdmin());    // P-PST-03
      allow delete: if false;
    }

    match /questions/{qId} {
      allow read: if signedIn();                                          // P-QNA-01
      allow update: if (isNomineeOwner(resource.data.nomineeId)
                        && onlyChanged(['answer', 'answeredAt'])
                        && str(request.resource.data.answer, 600)
                        && nowStamp('answeredAt'))
                    || (isAdmin() && onlyChanged(['hidden']));           // P-QNA-03
      allow create, delete: if false;                                     // P-QNA-02 (callable)
    }

    match /comments/{cId} {
      allow read: if signedIn();                                          // P-CMT-01
      allow update: if isAdmin() && onlyChanged(['hidden']);             // P-CMT-03
      allow create, delete: if false;                                     // P-CMT-02 (callable)
    }

    match /questionAuthors/{id} { allow read: if isVoterAdmin(); allow write: if false; }  // P-ANO
    match /commentAuthors/{id}  { allow read: if isVoterAdmin(); allow write: if false; }  // P-ANO

    match /reactions/{reactionId} {
      allow read: if resource != null && isStudent(resource.data.niatId);                  // P-RCT-01
      allow create, update: if isStudent(request.resource.data.niatId)
                    && reactionId == request.resource.data.niatId + '_' + request.resource.data.nomineeId
                    && request.resource.data.type in ['fire', 'clap']
                    && hasOnly(['niatId', 'nomineeId', 'type', 'updatedAt'])
                    && nowStamp('updatedAt');                                              // P-RCT-02
      allow delete: if isStudent(resource.data.niatId);
    }

    match /debates/{positionId} {
      allow read: if signedIn();                                          // P-DEB-01
      allow write: if isAdmin();                                          // P-DEB-02 (answers via callable)
    }

    // ======================= engagement =======================
    match /predictions/{niatId} {
      allow read: if isStudent(niatId) || isAdmin();                      // P-PRD-01
      allow create, update: if isStudent(niatId)
                    && request.time < election().closesAt
                    && hasOnly(['niatId', 'picks', 'updatedAt'])
                    && request.resource.data.niatId == niatId
                    && request.resource.data.picks is map
                    && request.resource.data.picks.size() <= 10
                    && nowStamp('updatedAt');                             // P-PRD-02
      allow delete: if false;
    }

    match /pulsePolls/{pollId} {
      allow read: if signedIn();                                          // P-PUL-01
      allow write: if isAdmin();                                          // P-PUL-02
    }
    match /pulseVotes/{voteId} {
      allow read: if resource != null && isStudent(resource.data.niatId);                  // P-PUL-03
      allow create: if isStudent(request.resource.data.niatId)
                    && voteId == request.resource.data.pollId + '_' + request.resource.data.niatId
                    && get(/databases/$(db)/documents/pulsePolls/$(request.resource.data.pollId)).data.active == true
                    && request.resource.data.optionIndex is int
                    && request.resource.data.optionIndex >= 0
                    && request.resource.data.optionIndex
                         < get(/databases/$(db)/documents/pulsePolls/$(request.resource.data.pollId)).data.options.size()
                    && hasOnly(['pollId', 'niatId', 'optionIndex', 'createdAt'])
                    && nowStamp('createdAt');                             // P-PUL-04
      allow update, delete: if false;
    }

    // ======================= admin-managed =======================
    match /banners/{id} {
      allow read: if true;                                                // P-BAN-01
      allow write: if isAdmin()
                   && (request.resource == null || str(request.resource.data.text, 160));  // P-BAN-02
    }

    match /settings/{docId} {
      allow read: if true;                                                // P-SET-01
      allow write: if isAdmin() && docId == 'election'
                   && request.resource.data.opensAt < request.resource.data.closesAt
                   && request.resource.data.closesAt < request.resource.data.siteClosesAt
                   && request.resource.data.updatedBy == myEmail()
                   && nowStamp('updatedAt');                              // P-SET-02
    }

    match /auditLogs/{id} {
      allow read: if isAdmin();                                           // P-AUD-01
      allow write: if false;                                              // P-AUD-02
    }

    // ======================= catch-all =======================
    match /{document=**} { allow read, write: if false; }
  }
}
```
> Replace `media\\.YOURDOMAIN\\.com` with your real R2 custom domain.
> **Settings → audit:** a Firestore trigger on `settings/election` writes `settings_changed` / `voting_paused` / `results_published` to `auditLogs`, so admin changes are always logged even though admins write settings directly.

---

## 6. Function Guards (`functions/src/auth/guards.ts`)

Functions use the Admin SDK and **bypass rules**, so every callable re-checks authorization itself.

```ts
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const db = getFirestore();

export interface StudentCtx { niatId: string; email: string; batch: string; isNominee: boolean; nomineeOf: string | null }
export interface AdminCtx { email: string; canViewVoters: boolean }

function verifiedEmail(req: CallableRequest): string {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  if (!req.app) throw new HttpsError("failed-precondition", "App verification failed.");          // App Check
  const { email, email_verified } = req.auth.token;
  if (!email || email_verified !== true) throw new HttpsError("permission-denied", "Email not verified.");
  return email.toLowerCase();
}

/** Caller must be the verified, active owner of a student record. */
export async function requireStudent(req: CallableRequest): Promise<StudentCtx> {
  const email = verifiedEmail(req);
  const snap = await db.collection("students").where("email", "==", email).limit(2).get();
  if (snap.size !== 1) throw new HttpsError("permission-denied", "No unique student record for this email.");
  const s = snap.docs[0].data();
  if (s.status !== "active") throw new HttpsError("permission-denied", "Account is not active.");
  return { niatId: snap.docs[0].id, email, batch: s.batch, isNominee: !!s.isNominee, nomineeOf: s.nomineeOf ?? null };
}

export async function requireNominee(req: CallableRequest): Promise<StudentCtx & { nomineeId: string }> {
  const s = await requireStudent(req);
  if (!s.isNominee || !s.nomineeOf) throw new HttpsError("permission-denied", "Nominees only.");
  const nomineeId = `${s.nomineeOf}_${s.niatId}`;
  const n = await db.doc(`nominees/${nomineeId}`).get();
  if (!n.exists || n.get("active") !== true) throw new HttpsError("permission-denied", "Nominee profile inactive.");
  return { ...s, nomineeId };
}

export async function requireAdmin(req: CallableRequest): Promise<AdminCtx> {
  const email = verifiedEmail(req);
  const a = await db.doc(`admins/${email}`).get();
  if (!a.exists) throw new HttpsError("permission-denied", "Admins only.");
  return { email, canViewVoters: a.get("canViewVoters") === true };
}

export async function requireVoterAdmin(req: CallableRequest): Promise<AdminCtx> {
  const admin = await requireAdmin(req);
  if (!admin.canViewVoters) throw new HttpsError("permission-denied", "Voter access not granted.");
  return admin;
}

/** Firestore-backed fixed-window limiter for callables (Redis is used on the edge). */
export async function rateLimit(key: string, max: number, windowSec: number): Promise<void> {
  const bucket = Math.floor(Date.now() / (windowSec * 1000));
  const ref = db.doc(`_rateLimits/${key.replace(/\//g, "_")}_${bucket}`);
  const count = await db.runTransaction(async (tx) => {
    const cur = (await tx.get(ref)).get("count") ?? 0;
    if (cur >= max) return cur + 1;
    tx.set(ref, { count: cur + 1, expiresAt: new Date((bucket + 1) * windowSec * 1000 + 3600_000) }, { merge: true });
    return cur + 1;
  });
  if (count > max) throw new HttpsError("resource-exhausted", "Too many requests. Try again shortly.");
}

export async function audit(
  actor: string,
  actorRole: "student" | "nominee" | "admin" | "system",
  action: string,
  target: string | null,
  meta: Record<string, unknown> = {},
) {
  await db.collection("auditLogs").add({ actor, actorRole, action, target, meta, at: FieldValue.serverTimestamp() });
}
```
> `_rateLimits` is covered by the catch-all deny rule; add a Firestore **TTL policy** on `expiresAt` so old buckets auto-delete.

**Usage pattern (every callable):**
```ts
export const askQuestion = onCall({ region: "asia-south1", enforceAppCheck: true }, async (req) => {
  const me = await requireStudent(req);                          // 1. who
  await rateLimit(`ask_${me.niatId}`, 5, 3600);                  // 2. how often
  const input = AskQuestionInput.parse(req.data);                // 3. what (Zod)
  // 4. state checks (nominee active, campaign open) → 5. write → 6. audit
});
```

---

## 7. Edge API Guard (`lib/auth/verify-token.ts`)

```ts
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!;
const JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"),
);

export interface FirebaseClaims extends JWTPayload { email?: string; email_verified?: boolean }

/** Verifies a Firebase ID token on the edge. Throws on any failure. */
export async function verifyFirebaseToken(authHeader: string | null): Promise<FirebaseClaims & { email: string }> {
  if (!authHeader?.startsWith("Bearer ")) throw new AuthError(401, "Missing token");
  const { payload } = await jwtVerify<FirebaseClaims>(authHeader.slice(7), JWKS, {
    issuer: `https://securetoken.google.com/${PROJECT_ID}`,
    audience: PROJECT_ID,
    algorithms: ["RS256"],
  });
  if (!payload.sub) throw new AuthError(401, "Invalid token");
  if (!payload.email || payload.email_verified !== true) throw new AuthError(403, "Email not verified");
  return { ...payload, email: payload.email.toLowerCase() };
}

export class AuthError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
```
Nominee/admin checks on the edge then read `students` / `admins` through Firestore REST (service account) with a 60 s Redis cache keyed by email.

---

## 8. `database.rules.json` (RTDB)

```json
{
  "rules": {
    ".read": false,
    ".write": false,
    "tallies":  { ".read": true, ".write": false },
    "wall":     { ".read": true, ".write": false },
    "election": { ".read": true, ".write": false },
    "pulse":    { ".read": true, ".write": false },
    "predictionLeaderboard": { ".read": true, ".write": false }
  }
}
```
P-RTD-01/02. Public read is safe: these nodes contain counts only, never IDs or names (leaderboard uses first name + initial).

---

## 9. R2 Upload Policy (P-R2-01)

```ts
// app/api/media/upload-url/route.ts  (core of the signing logic)
const ALLOWED = { "image/webp": 2, "image/jpeg": 2, "image/png": 2, "video/mp4": 15 } as const; // MB

// after verifyFirebaseToken + nominee check + UploadUrlInput.parse + ratelimit:
const ext = input.contentType === "video/mp4" ? "mp4" : input.contentType.split("/")[1];
const key = `nominees/${me.niatId}/${input.kind === "avatar" ? "avatar" : input.kind === "story" ? "stories" : "posts"}/${crypto.randomUUID()}.${ext}`;
// Presign PUT with aws4fetch: expires 300 s, signed Content-Type and Content-Length headers
// → the client cannot upload a different type or a bigger file than it declared.
```
Rules (P-NOM-02, P-PST-02) then require `mediaUrl` to sit under `nominees/{ownNiatId}/`, so a nominee can't attach someone else's media.

---

## 10. Admin Safeguards

| Safeguard | How |
|---|---|
| Two tiers | `admins/{email}.canViewVoters` — default `false` |
| Every voter view audited | Voter list served by `getVotersForNominee` callable → audit `voters_viewed` with position/nominee |
| No ballot edits during voting | `setNominee` rejects when `phase in [voting, closed, results]` |
| No vote tampering | `votes` update/delete denied for everyone; tallies only from function; `recountPosition` is read-only over votes |
| Destructive actions confirmed | UI requires typing `PAUSE` / `DELETE`; `cleanupPII` requires voterAdmin + confirmation string |
| Admin list managed outside the app | Add/remove admins in Firebase console (no in-app privilege escalation) |
| 2FA | Admin Google accounts must have 2-Step Verification on |

> **Transparency recommendation:** state on the login page that the election committee can see individual votes, and list who the committee is. Hidden admin visibility is the fastest way to lose student trust if it comes out later.

---

## 11. Abuse Scenarios → Which Policy Stops It

| Scenario | Stopped by |
|---|---|
| Student scripts 1,500 NIAT IDs to scrape names/emails | P-DIR-01 (no direct read), P-API-01 (masking, Turnstile, rate limits) |
| Student votes twice from two tabs/phones | V-4 deterministic ID; P-VOT-03 |
| Student votes as a friend using the friend's NIAT ID | V-1 (verified email must match the friend's sheet email) |
| Student with pending correction slips in a vote | V-1 (`status == active`) |
| Vote sent at 17:00:01 after close | V-3 (`request.time` is server time) |
| Client increments a tally directly | P-TAL-02 + RTDB `.write: false` |
| Nominee edits a rival's bio | P-NOM-02 (`isStudent(resource.data.niatId)`) |
| Nominee attaches a rival's photo URL | P-NOM-02 / P-PST-02 prefix match |
| Nominee finds out who asked a question | P-ANO-01 (authors are voterAdmin-only) |
| Admin quietly changes a result | P-VOT-03, P-TAL-02, audit trail on settings |
| Plain admin browses who voted for whom | P-VOT-01 requires `canViewVoters` |
| Bot hammers callables | App Check (P-APP-01) + `rateLimit` |
| Old device keeps a session after a new login | P-STU-02 lets the new device set `activeSessionId`; old device's listener sees the change and signs out |

---

## 12. Rules Tests (`tests/rules/firestore.rules.test.ts`)

Run with `firebase emulators:exec --only firestore "npx vitest run tests/rules"`.

```ts
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

const asUser = (email: string, verified = true) =>
  env.authenticatedContext(email, { email, email_verified: verified }).firestore();

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
    projectId: "niat-elections-test",
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
```

**Required to pass before code freeze (18 Nov):** all tests above green in CI; plus E2E: two browsers, same student, vote simultaneously → exactly one succeeds.

---

## 13. Go-Live Checklist

- [ ] `firestore.rules` and `database.rules.json` deployed to **prod** (not test-mode rules)
- [ ] Catch-all deny present; Firestore console shows no "open rules" warning
- [ ] App Check enforced on Firestore, RTDB, Functions
- [ ] `admins` contains only intended emails; `canViewVoters` on ≤ 2 people
- [ ] Every callable starts with a `require*` guard + Zod parse
- [ ] R2 bucket CORS limited to your domain; exports bucket private
- [ ] Cloudflare rate-limit rule active on `/login*` and `/api/directory*`
- [ ] Rules test suite green on the deployed rules version
- [ ] Login page states who can see individual votes

---

## 14. Two-step verification (added 14 Nov 2026)

**Model.** Second factor = TOTP authenticator app (RFC 6238). Passing it (`mfaVerify` / `mfaEnrollConfirm`) sets custom claim `mfa = <token auth_time>`. Because `auth_time` changes on every sign-in, the proof is bound to *this* sign-in only.

| Who | Required | Enforced in |
|---|---|---|
| Admin / voter-admin | **Always**, plus sign-in must be < 12 h old | `isAdmin()` → `mfaOk() && freshAdminSession()`; `requireAdmin()` |
| Student / nominee | While `settings.requireStudentMfa != false` (default **on**) | `isStudent()`; `requireStudent()` |

- **Before 2-step** a user may read only their own `students` doc (by email) and their own `admins/{email}` doc — enough for the app to show the 2-step screen. Everything else is denied.
- `mfa/{uid}` (server-only, catch-all deny): AES-256-GCM-encrypted secret (`MFA_ENCRYPTION_KEY`), `lastStep` (replay protection), `backupHashes` (SHA-256, one-time), `failCount`, `lockedUntil` (5 misses → 15 min lock).
- Callables: `mfaStatus`, `mfaEnrollStart`, `mfaEnrollConfirm`, `mfaVerify` (any verified active account), `mfaReset` (admin with 2-step; can't reset self; revokes refresh tokens).
- Audit actions: `mfa_enrolled`, `mfa_verified`, `mfa_failed`, `mfa_locked`, `mfa_reset`.
- Client: admin idle sign-out after 30 min; admin sign-out when sign-in is 12 h old.
- Tests: `tests/rules` "2-step verification" suite; `tests/unit/totp.test.ts` (RFC vectors, AES-GCM tamper, backup codes).

### 14.x Optional 2-step for students (changed 16 Nov 2026)

- Default `settings.requireStudentMfa = false`: **students and nominees choose** whether to use 2-step
  (Profile → Turn on 2-step). Admins always need it (unchanged).
- **P-MFA-05** — once a student turns it on, `students/{id}.mfaEnabled = true` (server-owned; clients can't
  change it because P-STU-02 only allows `activeSessionId`/`lastLoginAt`). From then on:
  - rules `isStudent()` require `mfaOk()` for that student, even in optional mode;
  - callable guards (`requireStudent`), `mfaStatus.required` and the media upload route do the same.
- Turning it off again is a committee `mfaReset` (also clears `mfaEnabled`), so a stolen open session
  can't silently disable it.
- Setting `requireStudentMfa = true` in Admin → Settings makes 2-step mandatory for everyone again.
- Tests: `tests/rules/firestore.rules.test.ts` → "P-MFA-05 …".

