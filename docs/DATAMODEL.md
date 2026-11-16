# NIAT Campus Elections 2026 — Data Model (DATAMODEL.md)

> **⚠ Platform change (16 Nov 2026): the project now runs on Supabase, not Firebase.**
> Data = Postgres tables (`supabase/migrations/`), security = RLS + `functions/src/rules.ts`,
> live counts = `rt` table + Supabase Realtime, sign-in = Supabase Auth (Google / email link via
> Brevo), uploads = Supabase Storage, hosting = Vercel. See **`docs/FREE_HOSTING.md`** for the
> current setup and **`AGENTS.md`** for commands. Firebase-specific details below (emulators,
> firestore.rules, Cloud Functions, RTDB, R2, seeds) are historical.

> Companion to `PRD.md`, `DESIGN.md`, `TECHSTACK.md`. Follows the **TECHSTACK.md** architecture: votes in **Firestore**, counting done by a **Cloud Function**, live counts mirrored to **Realtime Database (RTDB)**.
> Covers: every collection and field, who can read/write it, indexes, security rules, RTDB, Redis keys, R2 layout, Excel import mapping, lifecycles, invariants and retention.

---

## 1. Storage Map

| Store | Holds | Read by | Written by |
|---|---|---|---|
| **Firestore** | Source of truth: students, positions, nominees, votes, content, settings, audit | Clients (per rules), Functions, edge API | Clients (narrow cases), Functions, Admin |
| **Realtime Database** | Live mirrors: tallies, voting wall, election flags, pulse results | Everyone (read-only) | **Functions only** |
| **Upstash Redis** | Short-lived caches + rate-limit counters | Edge API only | Edge API, Functions (purge) |
| **Cloudflare R2** | Nominee images/videos (public), exports (private) | Public CDN / signed URLs | Presigned uploads, Functions |

**Golden rule:** anything that decides an election result (votes, tallies, student status, settings) is written **only** through Firestore rules-checked creates or by Functions. RTDB and Redis are disposable mirrors — they can be rebuilt from Firestore at any time.

---

## 2. ID Conventions

| Entity | ID format | Example |
|---|---|---|
| Student | NIAT ID, uppercase | `N25H01A0693` |
| Position | kebab-case slug | `sports-president` |
| Nominee | `{positionId}_{niatId}` | `sports-president_N25H01A0101` |
| Vote | `{niatId}_{positionId}` | `N25H01A0693_sports-president` |
| Reaction | `{niatId}_{nomineeId}` | `N25H01A0693_sports-president_N25H01A0101` |
| Prediction | `{niatId}` | `N25H01A0693` |
| Pulse vote | `{pollId}_{niatId}` | `p-2026-11-19_N25H01A0693` |
| Admin | lowercase email | `tarun@example.com` |
| Others | Firestore auto-ID | `aB3k…` |
| Receipt code | `{CLUB}-{4 chars}` from alphabet without `0 O 1 I L` | `SP-7K3M` |

**Why deterministic IDs:** a vote's ID *is* the uniqueness constraint. A second vote for the same position targets the same document, which rules treat as an update → denied. Same trick for reactions, predictions, pulse votes.

**NIAT ID validation:** `^N\d{2}[A-Z]\d{2}[A-Z]\d{4}$` (matches `N25H01A0693`). Kept configurable — the importer **warns** on mismatches instead of rejecting, in case some IDs use another format.

---

## 3. Entity Relationships

```
admins (email)

students (niatId) ─1───────────N─ votes (niatId_positionId) ─N───1─ positions (positionId)
     │  1                                │ N                              │ 1
     │                                   └──────────1─ nominees ─N────────┘
     │ 0..N (a student can be nominee for         (positionId_niatId)
     │      at most one position by default)           │ 1
     └──────────────────────────────────────────────── ┘
                                                        ├─N─ posts ─1─N─ comments ─1─1─ commentAuthors
                                                        ├─N─ questions ─1─1─ questionAuthors
                                                        └─N─ reactions
students ─1─N─ correctionRequests
students ─1─1─ predictions
positions ─1─0..1─ debates
pulsePolls ─1─N─ pulseVotes
settings/election  (singleton)    banners    auditLogs    tallies (one per position)
```

---

## 4. Firestore Collections

Types use Firestore `Timestamp`. All `createdAt/updatedAt` are set with `serverTimestamp()` (client) or `FieldValue.serverTimestamp()` (functions).

### 4.1 `admins/{email}`
```ts
interface Admin {
  email: string;            // lowercase, equals doc ID
  name: string;
  canViewVoters: boolean;   // gate for "who voted for whom" screen (limit to 1–2 people)
  addedBy: string;
  createdAt: Timestamp;
}
```
Read: admins · Write: console / existing admin via callable.

### 4.2 `students/{niatId}`
```ts
type StudentStatus = "active" | "pending" | "disabled";

interface Student {
  niatId: string;           // = doc ID
  name: string;
  email: string;            // lowercase, trimmed — the login identity
  phone: string;            // E.164, e.g. "+919876543210"
  admissionNo: string;
  batch: string;            // "2025" | "2026" (derived from ID, overridable from sheet)
  status: StudentStatus;    // pending = correction request open → login blocked
  isNominee: boolean;       // denormalised flag for fast UI/routing
  nomineeOf: string | null; // positionId if nominee
  votedPositions: string[]; // maintained by onVoteCreated (fast progress ring)
  votedCount: number;       // same, for admin queries/turnout
  activeSessionId: string | null; // single-device session
  lastLoginAt: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```
| Who | Read | Write |
|---|---|---|
| Owner (verified email matches) | ✅ own doc | only `activeSessionId`, `lastLoginAt` |
| Admin | ✅ all | ✅ all (via panel / callables) |
| Functions | ✅ | ✅ (`votedPositions`, `votedCount`, `status`) |

### 4.3 `directory/{niatId}` — pre-login lookup (server-only)
```ts
interface DirectoryEntry {
  name: string;
  maskedEmail: string;      // "t*****@gmail.com"
  maskedPhone: string;      // "******3210"
  maskedAdmission: string;  // "*****123"
  batch: string;
  status: StudentStatus;
}
```
Generated by the import function and re-generated whenever a student doc changes.
**Clients cannot read it directly** — only via `/api/directory/:niatId` (Redis cache + rate limit). This stops anyone from bulk-downloading the class list.

### 4.4 `correctionRequests/{autoId}`
```ts
interface CorrectionRequest {
  niatId: string;
  fields: Array<"name" | "email" | "phone" | "admissionNo">;
  requested: Partial<Record<"name" | "email" | "phone" | "admissionNo", string>>;
  note: string;             // ≤ 500 chars
  contactEmail: string;     // where to notify (may differ if registered email is wrong)
  status: "open" | "resolved" | "rejected";
  resolution?: string;
  resolvedBy?: string;      // admin email
  createdAt: Timestamp;
  resolvedAt?: Timestamp;
}
```
Created via **callable `requestCorrection`** (unauthenticated user → App Check + rate limit) which also sets `students.status = "pending"`. Resolved by admin → status back to `active`, email sent.

### 4.5 `positions/{positionId}`
```ts
interface Position {
  id: string;
  name: string;             // "Sports Club President"
  club: string;             // "Sports"
  color: string;            // hex from DESIGN.md palette
  icon: string;             // lucide icon name
  description: string;
  order: number;            // display order
  active: boolean;
  nomineeCount: number;     // maintained by functions
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```
Read: everyone signed in (and via cached API for landing) · Write: admin.

### 4.6 `nominees/{positionId}_{niatId}`
```ts
interface Nominee {
  id: string;
  positionId: string;
  niatId: string;
  name: string;             // copied from student at toggle time
  batch: string;
  photoUrl: string | null;  // R2 public URL
  bio: string;              // ≤ 300 chars
  promises: string[];       // ≤ 6 items, ≤ 120 chars each ("If I win…")
  active: boolean;          // admin toggle; false = hidden, votes rejected
  reactionCounts: { fire: number; clap: number }; // maintained by function
  postCount: number;
  hasActiveStory: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```
| Who | Read | Write |
|---|---|---|
| Signed-in students | ✅ active nominees | — |
| The nominee (owner) | ✅ | only `photoUrl`, `bio`, `promises`, `updatedAt`, and only before voting closes |
| Admin | ✅ | create / toggle `active` (callable `setNominee` also updates `students.isNominee`) |

> Admin cannot add/remove nominees once voting opens (enforced in `setNominee`) — protects ballot integrity.

### 4.7 `votes/{niatId}_{positionId}` 🔒
```ts
interface Vote {
  voterId: string;          // niatId
  positionId: string;
  nomineeId: string;        // nominee doc ID
  createdAt: Timestamp;     // must equal request.time
  // added by onVoteCreated (Admin SDK, bypasses rules):
  counted?: boolean;        // idempotency flag for tally increment
  receiptCode?: string;     // "SP-7K3M"
  batch?: string;           // copied for analytics without extra reads
}
```
| Who | Read | Create | Update / Delete |
|---|---|---|---|
| Owner | ✅ own votes only | ✅ if all rules pass (§7) | ❌ never |
| Other students / nominees | ❌ | — | ❌ |
| Admin with `canViewVoters` | ✅ | ❌ | ❌ |
| Functions | ✅ | — | only adds `counted`, `receiptCode`, `batch` |

### 4.8 `tallies/{positionId}`
```ts
interface Tally {
  positionId: string;
  counts: Record<string, number>; // nomineeId → votes
  total: number;
  updatedAt: Timestamp;
}
```
Written **only by `onVoteCreated`** in a transaction. Mirrored to RTDB `/tallies/{positionId}`. Admin reads here; students read the RTDB mirror. Can be fully recomputed from `votes` by callable `recountPosition` (disaster recovery).

### 4.9 `posts/{autoId}`
```ts
interface Post {
  nomineeId: string;
  niatId: string;           // owner, for rules
  type: "photo" | "video" | "poster" | "story";
  mediaUrl: string;         // must start with R2 public base URL
  posterUrl?: string;       // video thumbnail
  caption: string;          // ≤ 200 chars
  durationSec?: number;     // videos ≤ 30
  expiresAt?: Timestamp;    // stories: createdAt + 24h
  commentCount: number;     // function-maintained
  deleted: boolean;         // soft delete (nominee or admin)
  deletedBy?: string;
  createdAt: Timestamp;
}
```
Create/soft-delete: owner nominee (campaign window) · Soft-delete: admin · Read: signed-in, `deleted == false` and not expired.

### 4.10 Anonymous content (split identity)
Firestore can't hide fields from a reader, so **identity lives in separate admin-only docs**.

```ts
// questions/{qId}          → public to signed-in users
interface Question {
  nomineeId: string;
  text: string;             // ≤ 300 chars
  answer: string | null;    // ≤ 600 chars, written by nominee
  answeredAt: Timestamp | null;
  hidden: boolean;          // admin moderation
  createdAt: Timestamp;
}
// questionAuthors/{qId}    → admin only
interface QuestionAuthor { niatId: string; createdAt: Timestamp; }

// comments/{cId}           → public to signed-in users
interface Comment { postId: string; nomineeId: string; text: string; hidden: boolean; createdAt: Timestamp; }
// commentAuthors/{cId}     → admin only
interface CommentAuthor { niatId: string; createdAt: Timestamp; }
```
Both pairs are created **only through callables** `askQuestion` / `addComment`: verifies the student, rate-limits (e.g. 5 questions/hour), runs a basic profanity filter, writes both docs atomically. Nominee answers directly (rule: owner may update only `answer`, `answeredAt`).

### 4.11 `reactions/{niatId}_{nomineeId}`
```ts
interface Reaction { niatId: string; nomineeId: string; type: "fire" | "clap"; updatedAt: Timestamp; }
```
One reaction per student per nominee (changeable or removable). Owner write; function keeps `nominees.reactionCounts` in sync. Not readable by others (only counts are public).

### 4.12 `debates/{positionId}`
```ts
interface Debate {
  positionId: string;
  question: string;                        // admin-written
  answers: Record<string, { text: string; updatedAt: Timestamp }>; // nomineeId → answer ≤ 600
  createdAt: Timestamp;
}
```
Admin creates; each nominee may update only `answers.{ownNomineeId}`.

### 4.13 `predictions/{niatId}`
```ts
interface Prediction {
  niatId: string;
  picks: Record<string, string>;  // positionId → nomineeId
  score?: number;                 // set by function after results
  rank?: number;
  updatedAt: Timestamp;
}
```
Owner write until voting closes; read own; leaderboard computed by function into RTDB `/predictionLeaderboard` (top 20, first name + batch only).

### 4.14 `pulsePolls/{pollId}` + `pulseVotes/{pollId}_{niatId}`
```ts
interface PulsePoll { question: string; options: string[]; opensAt: Timestamp; closesAt: Timestamp; active: boolean; }
interface PulseVote { pollId: string; niatId: string; optionIndex: number; createdAt: Timestamp; }
```
Admin creates polls; students create one vote each (create-only); function mirrors counts to RTDB `/pulse/{pollId}`.

### 4.15 `banners/{autoId}`
```ts
interface Banner {
  variant: "info" | "warning" | "success" | "image";
  text: string;
  imageUrl?: string;
  link?: string;
  startsAt: Timestamp;
  endsAt: Timestamp;
  active: boolean;
  createdBy: string;
  createdAt: Timestamp;
}
```

### 4.16 `settings/election` (singleton)
```ts
type Phase = "setup" | "campaign" | "voting" | "closed" | "results" | "concluded";

interface ElectionSettings {
  phase: Phase;                 // derived + set by scheduledLifecycle; admin can override
  campaignOpensAt: Timestamp;
  opensAt: Timestamp;           // voting start (19 Nov)
  closesAt: Timestamp;          // voting end (20 Nov)
  paused: boolean;              // emergency pause
  pausedReason: string | null;
  resultsPublished: boolean;
  siteClosesAt: Timestamp;      // 22/23 Nov → "concluded"
  nomineesCanSelfVote: boolean;
  receiptsByEmail: boolean;     // switch off if Brevo quota is tight
  updatedBy: string;
  updatedAt: Timestamp;
}
```
Read: everyone · Write: admin. Mirrored to RTDB `/election` for instant UI changes (pause banner appears in ~1 s).

### 4.17 `auditLogs/{autoId}` (append-only)
```ts
interface AuditLog {
  actor: string;            // niatId | admin email | "system"
  actorRole: "student" | "nominee" | "admin" | "system";
  action:
    | "login" | "session_replaced" | "vote_cast"
    | "correction_requested" | "correction_resolved"
    | "nominee_added" | "nominee_removed" | "profile_updated" | "post_created" | "post_deleted"
    | "settings_changed" | "voting_paused" | "voting_resumed" | "results_published"
    | "voters_viewed" | "export_created" | "reminders_sent" | "students_imported";
  target: string | null;    // doc path
  meta: Record<string, unknown>; // small, no PII beyond IDs
  at: Timestamp;
}
```
Write: **Functions only** · Read: admins · Update/delete: never.

---

## 5. Indexes (`firestore.indexes.json`)

```json
{
  "indexes": [
    { "collectionGroup": "votes", "queryScope": "COLLECTION",
      "fields": [{ "fieldPath": "positionId", "order": "ASCENDING" }, { "fieldPath": "nomineeId", "order": "ASCENDING" }, { "fieldPath": "createdAt", "order": "DESCENDING" }] },
    { "collectionGroup": "votes", "queryScope": "COLLECTION",
      "fields": [{ "fieldPath": "voterId", "order": "ASCENDING" }, { "fieldPath": "createdAt", "order": "ASCENDING" }] },
    { "collectionGroup": "students", "queryScope": "COLLECTION",
      "fields": [{ "fieldPath": "votedCount", "order": "ASCENDING" }, { "fieldPath": "batch", "order": "ASCENDING" }] },
    { "collectionGroup": "students", "queryScope": "COLLECTION",
      "fields": [{ "fieldPath": "status", "order": "ASCENDING" }, { "fieldPath": "updatedAt", "order": "DESCENDING" }] },
    { "collectionGroup": "nominees", "queryScope": "COLLECTION",
      "fields": [{ "fieldPath": "positionId", "order": "ASCENDING" }, { "fieldPath": "active", "order": "ASCENDING" }] },
    { "collectionGroup": "posts", "queryScope": "COLLECTION",
      "fields": [{ "fieldPath": "nomineeId", "order": "ASCENDING" }, { "fieldPath": "deleted", "order": "ASCENDING" }, { "fieldPath": "createdAt", "order": "DESCENDING" }] },
    { "collectionGroup": "questions", "queryScope": "COLLECTION",
      "fields": [{ "fieldPath": "nomineeId", "order": "ASCENDING" }, { "fieldPath": "hidden", "order": "ASCENDING" }, { "fieldPath": "createdAt", "order": "DESCENDING" }] },
    { "collectionGroup": "comments", "queryScope": "COLLECTION",
      "fields": [{ "fieldPath": "postId", "order": "ASCENDING" }, { "fieldPath": "hidden", "order": "ASCENDING" }, { "fieldPath": "createdAt", "order": "ASCENDING" }] },
    { "collectionGroup": "correctionRequests", "queryScope": "COLLECTION",
      "fields": [{ "fieldPath": "status", "order": "ASCENDING" }, { "fieldPath": "createdAt", "order": "ASCENDING" }] },
    { "collectionGroup": "banners", "queryScope": "COLLECTION",
      "fields": [{ "fieldPath": "active", "order": "ASCENDING" }, { "fieldPath": "startsAt", "order": "ASCENDING" }] },
    { "collectionGroup": "auditLogs", "queryScope": "COLLECTION",
      "fields": [{ "fieldPath": "action", "order": "ASCENDING" }, { "fieldPath": "at", "order": "DESCENDING" }] }
  ],
  "fieldOverrides": []
}
```

Query → index map:
| Screen | Query |
|---|---|
| Admin "who voted for X" | `votes where positionId == P and nomineeId == N order by createdAt desc` |
| My Votes | `votes where voterId == me` |
| Reminders "not voted" | `students where votedCount == 0` (or `< positionsCount`) + optional `batch` |
| Requests inbox | `correctionRequests where status == "open" order by createdAt` |
| Nominee posts grid | `posts where nomineeId == N and deleted == false order by createdAt desc` |

---

## 6. Realtime Database (`asia-southeast1`)

```json
{
  "tallies": {
    "sports-president": {
      "total": 812,
      "counts": { "sports-president_N25H01A0101": 401, "sports-president_N25H01A0223": 300, "sports-president_N25H01A0310": 111 },
      "updatedAt": 1795583523000
    }
  },
  "wall": {
    "totalVotes": 4210,
    "votersCount": 1243,
    "turnoutPct": 82.9,
    "recent": { "-Nx1": { "club": "Media", "at": 1795583523000 } }
  },
  "election": { "phase": "voting", "paused": false, "closesAt": 1795600000000, "resultsPublished": false },
  "pulse": { "p-2026-11-19": { "counts": [120, 340, 88], "total": 548 } },
  "predictionLeaderboard": { "1": { "name": "Tarun U.", "batch": "2025", "score": 7 } }
}
```
`wall/recent` holds the last 10 events only (function trims). No names, no IDs.

**`database.rules.json`**
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
Functions write with the Admin SDK (bypasses rules).

---

## 7. Firestore Security Rules (`firestore.rules`)

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {

    // ---------- helpers ----------
    function signedIn()   { return request.auth != null && request.auth.token.email_verified == true; }
    function myEmail()    { return request.auth.token.email.lower(); }
    function isAdmin()    { return signedIn() && exists(/databases/$(db)/documents/admins/$(myEmail())); }
    function canViewVoters() {
      return isAdmin() && get(/databases/$(db)/documents/admins/$(myEmail())).data.canViewVoters == true;
    }
    function studentDoc(id) { return get(/databases/$(db)/documents/students/$(id)).data; }
    // caller is the verified, active owner of student `id`
    function isStudent(id) {
      let s = studentDoc(id);
      return signedIn() && s.email == myEmail() && s.status == 'active';
    }
    function election() { return get(/databases/$(db)/documents/settings/election).data; }
    function votingOpen() {
      let e = election();
      return e.paused == false && request.time >= e.opensAt && request.time < e.closesAt;
    }
    function campaignOpen() { return request.time < election().closesAt; }
    function onlyChanged(fields) { return request.resource.data.diff(resource.data).affectedKeys().hasOnly(fields); }
    function str(v, max) { return v is string && v.size() <= max; }

    // ---------- admins ----------
    match /admins/{email} {
      allow read: if isAdmin();
      allow write: if false;                       // console / callable only
    }

    // ---------- students ----------
    match /students/{niatId} {
      allow read: if isAdmin() || (signedIn() && resource.data.email == myEmail());
      allow update: if signedIn() && resource.data.email == myEmail()
                    && resource.data.status == 'active'
                    && onlyChanged(['activeSessionId', 'lastLoginAt']);
      allow create, delete: if false;              // import/admin via callables
    }

    match /directory/{niatId}          { allow read, write: if false; }   // edge API only
    match /correctionRequests/{id}     { allow read: if isAdmin(); allow write: if false; }

    // ---------- ballot ----------
    match /positions/{positionId} {
      allow read: if signedIn();
      allow write: if isAdmin();
    }

    match /nominees/{nomineeId} {
      allow read: if signedIn();
      allow update: if isStudent(resource.data.niatId)
                    && campaignOpen()
                    && onlyChanged(['photoUrl', 'bio', 'promises', 'updatedAt'])
                    && str(request.resource.data.bio, 300)
                    && request.resource.data.promises is list
                    && request.resource.data.promises.size() <= 6
                    && request.resource.data.updatedAt == request.time;
      allow create, delete: if false;              // callable setNominee
    }

    match /votes/{voteId} {
      allow read: if canViewVoters()
                  || (signedIn() && isStudent(resource.data.voterId));
      allow create: if
           isStudent(request.resource.data.voterId)
        && votingOpen()
        && voteId == request.resource.data.voterId + '_' + request.resource.data.positionId
        && request.resource.data.keys().hasOnly(['voterId', 'positionId', 'nomineeId', 'createdAt'])
        && request.resource.data.createdAt == request.time
        && request.resource.data.nomineeId.matches('^' + request.resource.data.positionId + '_.+')
        && get(/databases/$(db)/documents/nominees/$(request.resource.data.nomineeId)).data.active == true
        && get(/databases/$(db)/documents/positions/$(request.resource.data.positionId)).data.active == true
        && (election().nomineesCanSelfVote == true
            || request.resource.data.nomineeId != request.resource.data.positionId + '_' + request.resource.data.voterId);
      allow update, delete: if false;
    }

    match /tallies/{positionId} {
      allow read: if isAdmin();                    // students use the RTDB mirror
      allow write: if false;                       // onVoteCreated only
    }

    // ---------- campaign content ----------
    match /posts/{postId} {
      allow read: if signedIn();                   // client filters deleted/expired
      allow create: if isStudent(request.resource.data.niatId)
                    && studentDoc(request.resource.data.niatId).isNominee == true
                    && campaignOpen()
                    && request.resource.data.nomineeId == studentDoc(request.resource.data.niatId).nomineeOf + '_' + request.resource.data.niatId
                    && request.resource.data.type in ['photo', 'video', 'poster', 'story']
                    && str(request.resource.data.caption, 200)
                    && request.resource.data.mediaUrl.matches('^https://media\\.YOURDOMAIN\\.com/nominees/.*')
                    && request.resource.data.deleted == false
                    && request.resource.data.commentCount == 0
                    && request.resource.data.createdAt == request.time;
      allow update: if (isStudent(resource.data.niatId) && onlyChanged(['deleted', 'deletedBy'])
                        && request.resource.data.deleted == true)
                    || (isAdmin() && onlyChanged(['deleted', 'deletedBy']));
      allow delete: if false;
    }

    match /questions/{qId} {
      allow read: if signedIn();
      allow update: if (isStudent(get(/databases/$(db)/documents/nominees/$(resource.data.nomineeId)).data.niatId)
                        && onlyChanged(['answer', 'answeredAt'])
                        && str(request.resource.data.answer, 600)
                        && request.resource.data.answeredAt == request.time)
                    || (isAdmin() && onlyChanged(['hidden']));
      allow create, delete: if false;              // callable askQuestion
    }
    match /questionAuthors/{qId} { allow read: if canViewVoters(); allow write: if false; }

    match /comments/{cId} {
      allow read: if signedIn();
      allow update: if isAdmin() && onlyChanged(['hidden']);
      allow create, delete: if false;              // callable addComment
    }
    match /commentAuthors/{cId} { allow read: if canViewVoters(); allow write: if false; }

    match /reactions/{reactionId} {
      allow read: if signedIn() && isStudent(resource.data.niatId);
      allow create, update: if isStudent(request.resource.data.niatId)
                    && reactionId == request.resource.data.niatId + '_' + request.resource.data.nomineeId
                    && request.resource.data.type in ['fire', 'clap']
                    && request.resource.data.keys().hasOnly(['niatId', 'nomineeId', 'type', 'updatedAt'])
                    && request.resource.data.updatedAt == request.time;
      allow delete: if isStudent(resource.data.niatId);
    }

    match /debates/{positionId} {
      allow read: if signedIn();
      allow create, delete: if isAdmin();
      // nominee answers handled by callable answerDebate (map-key rules are fragile)
      allow update: if isAdmin();
    }

    // ---------- engagement ----------
    match /predictions/{niatId} {
      allow read: if isStudent(niatId) || isAdmin();
      allow create, update: if isStudent(niatId)
                    && request.time < election().closesAt
                    && request.resource.data.keys().hasOnly(['niatId', 'picks', 'updatedAt'])
                    && request.resource.data.niatId == niatId
                    && request.resource.data.updatedAt == request.time;
      allow delete: if false;
    }

    match /pulsePolls/{pollId} { allow read: if signedIn(); allow write: if isAdmin(); }

    match /pulseVotes/{voteId} {
      allow read: if isStudent(resource.data.niatId);
      allow create: if isStudent(request.resource.data.niatId)
                    && voteId == request.resource.data.pollId + '_' + request.resource.data.niatId
                    && get(/databases/$(db)/documents/pulsePolls/$(request.resource.data.pollId)).data.active == true
                    && request.resource.data.keys().hasOnly(['pollId', 'niatId', 'optionIndex', 'createdAt'])
                    && request.resource.data.createdAt == request.time;
      allow update, delete: if false;
    }

    match /banners/{id}            { allow read: if true;  allow write: if isAdmin(); }
    match /settings/{doc}          { allow read: if true;  allow write: if isAdmin(); }
    match /auditLogs/{id}          { allow read: if isAdmin(); allow write: if false; }
  }
}
```
> Replace `media\\.YOURDOMAIN\\.com` with your real R2 custom domain.
> Rules use several `get()` calls per vote (well under Firestore's per-request limit), each billed as a read — negligible at 10k votes.

### What the vote rule guarantees
| Attack | Blocked by |
|---|---|
| Vote twice in one position | Doc ID = `niatId_positionId`; updates denied |
| Vote as someone else | `isStudent(voterId)` checks verified Google/email-link email vs sheet |
| Vote while correction pending | `status == 'active'` |
| Vote before/after window or while paused | `votingOpen()` uses server `request.time` |
| Vote for fake/removed nominee or other position's nominee | nominee ID prefix + `active` check |
| Inject extra fields (e.g. fake `counted`) | `keys().hasOnly(...)` |
| Backdate a vote | `createdAt == request.time` |
| Change/delete a vote | `update, delete: if false` |
| Edit tallies | tallies client-write `false`; only function writes |

---

## 8. Cloud Function Data Flows

**`onVoteCreated(votes/{voteId})`** — idempotent (triggers are at-least-once):
```
transaction:
  vote = get(votes/voteId); if vote.counted → stop
  tally = get(tallies/positionId)
  student = get(students/voterId)
  update vote:    counted=true, receiptCode=gen(), batch=student.batch
  update tally:   counts[nomineeId] += 1, total += 1, updatedAt
  update student: votedPositions arrayUnion(positionId), votedCount += 1
after commit:
  RTDB set /tallies/{positionId} = tally            (set, not increment → idempotent)
  RTDB transaction /wall totals; push /wall/recent {club, at}; trim to 10
  auditLogs add { action: "vote_cast", actor: voterId, target: votes/voteId }
  if settings.receiptsByEmail → Brevo receipt email
```
**Hot-spot:** one tally doc per position handles roughly 1 sustained write/sec, and the function serialises writes via transactions with automatic retries. If the opening rush causes contention errors in the load test, switch to **5 shards** per position (`tallies/{positionId}/shards/{0..4}`) and sum shards before writing the RTDB mirror.

**`recountPosition(positionId)`** (admin callable): counts `votes where positionId == X` → overwrites tally + RTDB. Use if anything ever looks off.

---

## 9. Redis Keys (Upstash)

| Key | Value | TTL | Purged when |
|---|---|---|---|
| `dir:{niatId}` | DirectoryEntry JSON | 300 s | student updated / request resolved |
| `positions:all` | Position[] | 300 s | position changed |
| `nominees:{positionId}` | Nominee[] (public fields) | 30 s | nominee profile updated |
| `nominee:{nomineeId}` | Nominee + recent posts | 30 s | profile/post change |
| `banners:active` | Banner[] | 60 s | banner changed |
| `settings:public` | public subset of election settings | 15 s | settings changed |
| `rl:dir:{ip}` | ratelimit counter | sliding 1 min (10 req) | — |
| `rl:login:{niatId}` | ratelimit counter | sliding 10 min (5 req) | — |
| `rl:upload:{niatId}` | ratelimit counter | sliding 1 h (30 req) | — |

Purging is done by Firestore-triggered functions calling the Upstash REST API (`DEL`). Cache-aside pattern: API reads Redis → on miss reads Firestore (REST) → writes Redis with TTL.

---

## 10. R2 Layout

| Bucket | Access | Key pattern |
|---|---|---|
| `niat-elections-media` | Public via custom domain `media.<domain>` | `nominees/{niatId}/avatar/{uuid}.webp` |
| | | `nominees/{niatId}/posts/{postId}.{webp\|mp4}` |
| | | `nominees/{niatId}/posts/{postId}-poster.webp` |
| | | `nominees/{niatId}/stories/{postId}.{webp\|mp4}` |
| | | `banners/{bannerId}.webp` |
| `niat-elections-exports` | **Private**, signed URLs (15 min) | `exports/{yyyy-mm-dd-hhmm}/{results\|voters\|audit}.{xlsx\|pdf}` |

Presigned upload constraints: content-type allow-list (`image/webp`, `image/jpeg`, `image/png`, `video/mp4`), max size (images 2 MB, videos 15 MB), key must start with `nominees/{callerNiatId}/`. Lifecycle rule: delete `stories/` objects after 48 h.

---

## 11. Excel Import Mapping

| Sheet column (expected) | Field | Normalisation | Validation |
|---|---|---|---|
| `NIAT ID` | `niatId` | trim, uppercase | regex (warn), unique (reject dupes) |
| `Name` / `Student Name` | `name` | trim, collapse spaces, Title Case | 2–80 chars |
| `Email` / `Email ID` | `email` | trim, lowercase | valid email, unique (reject dupes) |
| `Phone` / `Phone Number` | `phone` | digits only → last 10 → `+91XXXXXXXXXX` | 10 digits starting 6–9 (warn) |
| `Admission No` / `Admission ID` | `admissionNo` | trim, uppercase | required |
| `Batch` (optional) | `batch` | — | else derived: `"20" + niatId[1..2]` → `N25…` = 2025, `N26…` = 2026 |

Flow: admin uploads → SheetJS parses in browser → Zod validates each row → preview table (errors red, warnings amber) → `importStudents` callable writes in batches of 400 (students + directory), sets `status: "active"`, `isNominee: false`, `votedCount: 0` → audit log `students_imported`.
Re-import is an **upsert by NIAT ID** that never touches `status`, `votedPositions`, `votedCount`, `isNominee`.

```ts
// lib/validators/student.ts
import { z } from "zod";

export const NIAT_ID_REGEX = /^N\d{2}[A-Z]\d{2}[A-Z]\d{4}$/;

export const StudentImportRow = z.object({
  niatId: z.string().trim().toUpperCase().min(6),
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().transform((v) => v.replace(/\D/g, "").slice(-10))
    .refine((v) => /^[6-9]\d{9}$/.test(v), "Invalid Indian mobile")
    .transform((v) => `+91${v}`),
  admissionNo: z.string().trim().toUpperCase().min(1),
  batch: z.string().regex(/^20\d{2}$/).optional(),
});
export type StudentImportRow = z.infer<typeof StudentImportRow>;

export const VoteInput = z.object({
  voterId: z.string().regex(NIAT_ID_REGEX),
  positionId: z.string().regex(/^[a-z0-9-]{2,40}$/),
  nomineeId: z.string().min(5),
});
```

---

## 12. Lifecycles (state machines)

**Student status**
```
          import
            │
            ▼
  ┌──── active ◄──────── resolved / rejected (admin)
  │        │
  │        │ requestCorrection
  │        ▼
  │     pending ── login blocked
  │
  └─► disabled (admin, e.g. left college) ── login blocked
```

**Election phase** (set by `scheduledLifecycle` every 5 min, admin override allowed)
```
setup → campaign → voting ⇄ (paused flag) → closed → results → concluded
         │ nominees    │ votes allowed       │ no votes  │ results page   │ site shows
         │ edit        │                     │           │ unlocked       │ thank-you only
```

**Correction request:** `open → resolved | rejected`
**Post:** `live → deleted` (soft) · stories: `live → expired` (24 h)
**Question:** `unanswered → answered`, either may be `hidden` by admin.

---

## 13. Invariants (checked by tests + a nightly `verifyIntegrity` callable)

1. For every position: `tallies.total == count(votes where positionId == P)`.
2. `sum(tallies.counts) == tallies.total`.
3. `tallies.total ≤ count(students where status == active)` (≤ ~1,500).
4. Every vote's `nomineeId` starts with its `positionId` and points to an existing nominee.
5. `students.votedCount == count(votes where voterId == S)`.
6. No vote has `createdAt` outside `[opensAt, closesAt)`.
7. Every `questions` doc has exactly one `questionAuthors` doc with the same ID (and same for comments).
8. RTDB `/tallies` equals Firestore `tallies` (mirror check; fix with `recountPosition`).

---

## 14. Volume & Cost Estimates

| Collection | Docs | Avg size | Notes |
|---|---|---|---|
| students | ~1,500 | ~0.6 KB | |
| directory | ~1,500 | ~0.3 KB | |
| positions | 6–7 | ~0.4 KB | |
| nominees | ~15–30 | ~1.5 KB | |
| votes | ≤ ~10,500 (1,500 × 7) | ~0.3 KB | |
| tallies | 6–7 | ~0.5 KB | |
| posts | ~300 | ~0.5 KB | media in R2 |
| questions + authors | ~1,000 × 2 | ~0.4 KB | |
| comments + authors | ~3,000 × 2 | ~0.3 KB | |
| reactions | ~10,000 | ~0.2 KB | |
| auditLogs | ~30,000 | ~0.3 KB | |
| **Total Firestore** | | **≈ 20 MB** | far under 1 GiB free |

R2 media: ~25 nominees × ~15 files × ~3 MB avg ≈ **~1.2 GB** (free tier ~10 GB).

---

## 15. Retention & Deletion

| Data | Keep until | Then |
|---|---|---|
| Votes, tallies, results, audit log | Exported to college office (by 23 Nov) | Delete from Firestore within 7 days after export |
| Students, directory, requests | 23 Nov | Delete (`cleanupPII`) |
| Q&A/comments + author maps | 23 Nov | Delete |
| R2 media | 30 days after election (memories for nominees) | Bucket lifecycle delete |
| Exports | College office's custody | Delete private bucket objects after hand-over |
| Redis | Auto-expires (TTL) | Delete database after 23 Nov |

Students are told on the login page what's stored, who can see it, and when it's deleted.

---

## 16. Additions during build (14 Nov 2026)

- **RTDB `/meta/eligible`** (int): count of `active` students, the denominator for `/wall/turnoutPct`. Written by `importStudents`, `adminUpdateStudent` (on status change) and the seed; read only by `onVoteCreated`. Not public — covered by the root `.read: false` rule.
- **Firestore `_events/{eventId}`**: idempotency markers for `onReactionWritten` (at-least-once delivery). Server-only (catch-all deny); add a TTL policy on `expiresAt`.
- **Firestore `_emailQuota/{yyyy-mm-dd}`** `{ sent }`: Brevo daily-cap counter used by every email send. Server-only.
- **Nominee `photoUrl` rule** now also allows saving the *current* value unchanged (RLSPOLICIES §5 P-NOM-02), so a nominee with a seed/legacy photo can still edit their bio. New URLs must still be under `media.<domain>/nominees/{ownNiatId}/`.
- **My Votes** reads each own vote doc by deterministic ID (`votes/{niatId}_{positionId}`) for positions in `students.votedPositions`, instead of a `voterId ==` query that the read rule can't evaluate.
- **Firestore `mfa/{uid}`** (server-only): `{ email, enabled, secret (AES-GCM), pendingSecret?, lastStep, backupHashes[], failCount, lockedUntil, enrolledAt, lastVerifiedAt }`. Delete with PII at teardown. See RLSPOLICIES §14.
