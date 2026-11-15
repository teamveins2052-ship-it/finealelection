# NIAT Campus Elections 2026 — Schema Reference (SCHEMA.md)

> **What this file is:** the field-by-field schema for every collection, plus copy-paste-ready **Zod schemas + TypeScript types** used by the app, Cloud Functions and API routes.
> **What it isn't:** the reasoning, security rules, indexes and lifecycles live in `DATAMODEL.md`. If the two ever disagree, fix both — this file is the code contract.

**Legend:** **Req** = required · **Src** (who sets it): `imp` importer · `adm` admin · `own` owner (student/nominee) · `fn` Cloud Function · `srv` server timestamp

---

## 1. Shared Types & Constraints

| Name | Type | Constraint |
|---|---|---|
| `NiatId` | string | uppercase, `^N\d{2}[A-Z]\d{2}[A-Z]\d{4}$` (importer warns, doesn't reject) |
| `PositionId` | string | `^[a-z0-9-]{2,40}$` |
| `NomineeId` | string | `{positionId}_{niatId}` |
| `VoteId` | string | `{niatId}_{positionId}` |
| `Email` | string | lowercase, trimmed, valid email |
| `Phone` | string | `^\+91[6-9]\d{9}$` |
| `Batch` | string | `^20\d{2}$` |
| `HexColor` | string | `^#[0-9A-Fa-f]{6}$` |
| `MediaUrl` | string | starts with `https://media.<domain>/` |
| `ReceiptCode` | string | `^[A-Z]{2}-[2-9A-HJKMNP-Z]{4}$` |
| `Timestamp` | Firestore Timestamp | always server-set |

**Enums**
| Enum | Values |
|---|---|
| `StudentStatus` | `active` · `pending` · `disabled` |
| `Phase` | `setup` · `campaign` · `voting` · `closed` · `results` · `concluded` |
| `PostType` | `photo` · `video` · `poster` · `story` |
| `ReactionType` | `fire` · `clap` |
| `BannerVariant` | `info` · `warning` · `success` · `image` |
| `RequestStatus` | `open` · `resolved` · `rejected` |
| `CorrectableField` | `name` · `email` · `phone` · `admissionNo` |
| `ActorRole` | `student` · `nominee` · `admin` · `system` |

---

## 2. Firestore Collections — Field Reference

### `admins/{email}`
| Field | Type | Req | Default | Src |
|---|---|---|---|---|
| email | Email | ✅ | — | adm |
| name | string ≤ 80 | ✅ | — | adm |
| canViewVoters | boolean | ✅ | `false` | adm |
| addedBy | Email | ✅ | — | adm |
| createdAt | Timestamp | ✅ | — | srv |

### `students/{niatId}`
| Field | Type | Req | Default | Src |
|---|---|---|---|---|
| niatId | NiatId | ✅ | — | imp |
| name | string 2–80 | ✅ | — | imp / adm |
| email | Email (unique) | ✅ | — | imp / adm |
| phone | Phone | ✅ | — | imp / adm |
| admissionNo | string 0–30 ("" if the sheet has none — 2026 batch has no hall ticket) | ✅ | "" | imp / adm |
| mfaEnabled | boolean | — | absent | server (mfaEnrollConfirm sets true, mfaReset sets false); student opted in to 2-step |
| batch | Batch | ✅ | derived from ID | imp |
| status | StudentStatus | ✅ | `active` | imp / fn / adm |
| isNominee | boolean | ✅ | `false` | fn |
| nomineeOf | PositionId \| null | ✅ | `null` | fn |
| votedPositions | PositionId[] | ✅ | `[]` | fn |
| votedCount | int ≥ 0 | ✅ | `0` | fn |
| activeSessionId | string \| null | ✅ | `null` | own |
| lastLoginAt | Timestamp \| null | ✅ | `null` | own |
| createdAt / updatedAt | Timestamp | ✅ | — | srv |

### `directory/{niatId}` (server-only)
| Field | Type | Req | Src |
|---|---|---|---|
| name | string | ✅ | fn |
| maskedEmail | string (`t*****@gmail.com`) | ✅ | fn |
| maskedPhone | string (`******3210`) | ✅ | fn |
| maskedAdmission | string (`*****123`) | ✅ | fn |
| batch | Batch | ✅ | fn |
| status | StudentStatus | ✅ | fn |

### `correctionRequests/{autoId}`
| Field | Type | Req | Default | Src |
|---|---|---|---|---|
| niatId | NiatId | ✅ | — | fn (from callable) |
| fields | CorrectableField[] (1–4) | ✅ | — | fn |
| requested | partial map field → string ≤ 120 | ✅ | — | fn |
| note | string ≤ 500 | ✅ | `""` | fn |
| contactEmail | Email | ✅ | — | fn |
| status | RequestStatus | ✅ | `open` | fn / adm |
| resolution | string ≤ 300 | — | — | adm |
| resolvedBy | Email | — | — | fn |
| createdAt | Timestamp | ✅ | — | srv |
| resolvedAt | Timestamp | — | — | srv |

### `positions/{positionId}`
| Field | Type | Req | Default | Src |
|---|---|---|---|---|
| id | PositionId | ✅ | — | adm |
| name | string 2–60 | ✅ | — | adm |
| club | string 2–30 | ✅ | — | adm |
| color | HexColor | ✅ | `#667085` | adm |
| icon | string (lucide name) | ✅ | `Users` | adm |
| description | string ≤ 300 | ✅ | `""` | adm |
| order | int ≥ 0 | ✅ | — | adm |
| active | boolean | ✅ | `true` | adm |
| nomineeCount | int ≥ 0 | ✅ | `0` | fn |
| createdAt / updatedAt | Timestamp | ✅ | — | srv |

### `nominees/{positionId}_{niatId}`
| Field | Type | Req | Default | Src |
|---|---|---|---|---|
| id | NomineeId | ✅ | — | fn |
| positionId | PositionId | ✅ | — | fn |
| niatId | NiatId | ✅ | — | fn |
| name | string | ✅ | copied from student | fn |
| batch | Batch | ✅ | copied | fn |
| photoUrl | MediaUrl \| null | ✅ | `null` | own |
| bio | string ≤ 300 | ✅ | `""` | own |
| promises | string ≤ 120 [] (max 6) | ✅ | `[]` | own |
| active | boolean | ✅ | `true` | fn (admin callable) |
| reactionCounts | `{ fire: int, clap: int }` | ✅ | `{0,0}` | fn |
| postCount | int ≥ 0 | ✅ | `0` | fn |
| hasActiveStory | boolean | ✅ | `false` | fn |
| createdAt / updatedAt | Timestamp | ✅ | — | srv |

### `votes/{niatId}_{positionId}`
| Field | Type | Req | Src |
|---|---|---|---|
| voterId | NiatId | ✅ | own |
| positionId | PositionId | ✅ | own |
| nomineeId | NomineeId | ✅ | own |
| createdAt | Timestamp (= request.time) | ✅ | srv |
| counted | boolean | after fn | fn |
| receiptCode | ReceiptCode | after fn | fn |
| batch | Batch | after fn | fn |

### `tallies/{positionId}`
| Field | Type | Req | Src |
|---|---|---|---|
| positionId | PositionId | ✅ | fn |
| counts | map NomineeId → int ≥ 0 | ✅ | fn |
| total | int ≥ 0 | ✅ | fn |
| updatedAt | Timestamp | ✅ | srv |

### `posts/{autoId}`
| Field | Type | Req | Default | Src |
|---|---|---|---|---|
| nomineeId | NomineeId | ✅ | — | own |
| niatId | NiatId | ✅ | — | own |
| type | PostType | ✅ | — | own |
| mediaUrl | MediaUrl | ✅ | — | own |
| posterUrl | MediaUrl | video only | — | own |
| caption | string ≤ 200 | ✅ | `""` | own |
| durationSec | number 1–30 | video only | — | own |
| expiresAt | Timestamp | story only | createdAt + 24 h | own |
| commentCount | int ≥ 0 | ✅ | `0` | fn |
| deleted | boolean | ✅ | `false` | own / adm |
| deletedBy | string | — | — | own / adm |
| createdAt | Timestamp | ✅ | — | srv |

### `questions/{qId}` · `questionAuthors/{qId}`
| Field | Type | Req | Default | Src |
|---|---|---|---|---|
| nomineeId | NomineeId | ✅ | — | fn |
| text | string 3–300 | ✅ | — | fn |
| answer | string ≤ 600 \| null | ✅ | `null` | own (nominee) |
| answeredAt | Timestamp \| null | ✅ | `null` | srv |
| hidden | boolean | ✅ | `false` | adm |
| createdAt | Timestamp | ✅ | — | srv |
| *(authors)* niatId | NiatId | ✅ | — | fn |
| *(authors)* createdAt | Timestamp | ✅ | — | srv |

### `comments/{cId}` · `commentAuthors/{cId}`
| Field | Type | Req | Default | Src |
|---|---|---|---|---|
| postId | string | ✅ | — | fn |
| nomineeId | NomineeId | ✅ | — | fn |
| text | string 1–300 | ✅ | — | fn |
| hidden | boolean | ✅ | `false` | adm |
| createdAt | Timestamp | ✅ | — | srv |
| *(authors)* niatId, createdAt | | ✅ | — | fn |

### `reactions/{niatId}_{nomineeId}`
| Field | Type | Req | Src |
|---|---|---|---|
| niatId | NiatId | ✅ | own |
| nomineeId | NomineeId | ✅ | own |
| type | ReactionType | ✅ | own |
| updatedAt | Timestamp | ✅ | srv |

### `debates/{positionId}`
| Field | Type | Req | Src |
|---|---|---|---|
| positionId | PositionId | ✅ | adm |
| question | string 5–300 | ✅ | adm |
| answers | map NomineeId → `{ text ≤ 600, updatedAt }` | ✅ (`{}`) | fn (callable `answerDebate`) |
| createdAt | Timestamp | ✅ | srv |

### `predictions/{niatId}`
| Field | Type | Req | Src |
|---|---|---|---|
| niatId | NiatId | ✅ | own |
| picks | map PositionId → NomineeId | ✅ | own |
| score | int ≥ 0 | after results | fn |
| rank | int ≥ 1 | after results | fn |
| updatedAt | Timestamp | ✅ | srv |

### `pulsePolls/{pollId}` · `pulseVotes/{pollId}_{niatId}`
| Field | Type | Req | Src |
|---|---|---|---|
| question | string 5–200 | ✅ | adm |
| options | string ≤ 60 [] (2–5) | ✅ | adm |
| opensAt / closesAt | Timestamp | ✅ | adm |
| active | boolean | ✅ | adm |
| *(vote)* pollId, niatId | string, NiatId | ✅ | own |
| *(vote)* optionIndex | int 0–4 | ✅ | own |
| *(vote)* createdAt | Timestamp | ✅ | srv |

### `banners/{autoId}`
| Field | Type | Req | Default | Src |
|---|---|---|---|---|
| variant | BannerVariant | ✅ | `info` | adm |
| text | string ≤ 160 | ✅ | — | adm |
| imageUrl | MediaUrl | image only | — | adm |
| link | URL | — | — | adm |
| startsAt / endsAt | Timestamp | ✅ | — | adm |
| active | boolean | ✅ | `true` | adm |
| createdBy | Email | ✅ | — | adm |
| createdAt | Timestamp | ✅ | — | srv |

### `settings/election`
| Field | Type | Req | Default | Src |
|---|---|---|---|---|
| phase | Phase | ✅ | `setup` | fn / adm |
| campaignOpensAt | Timestamp | ✅ | — | adm |
| opensAt | Timestamp | ✅ | 19 Nov 09:00 IST | adm |
| closesAt | Timestamp | ✅ | 20 Nov 17:00 IST | adm |
| paused | boolean | ✅ | `false` | adm |
| pausedReason | string ≤ 200 \| null | ✅ | `null` | adm |
| resultsPublished | boolean | ✅ | `false` | adm |
| siteClosesAt | Timestamp | ✅ | 23 Nov 23:59 IST | adm |
| nomineesCanSelfVote | boolean | ✅ | `true` | adm |
| receiptsByEmail | boolean | ✅ | `true` | adm |
| updatedBy | Email | ✅ | — | adm |
| updatedAt | Timestamp | ✅ | — | srv |

Invariant: `campaignOpensAt < opensAt < closesAt < siteClosesAt`.

### `auditLogs/{autoId}`
| Field | Type | Req | Src |
|---|---|---|---|
| actor | NiatId \| Email \| `"system"` | ✅ | fn |
| actorRole | ActorRole | ✅ | fn |
| action | AuditAction (see code) | ✅ | fn |
| target | doc path \| null | ✅ | fn |
| meta | object ≤ 2 KB, IDs only | ✅ | fn |
| at | Timestamp | ✅ | srv |

---

## 3. Realtime Database Schema

| Path | Type | Writer |
|---|---|---|
| `/tallies/{positionId}` | `{ total: int, counts: { [nomineeId]: int }, updatedAt: ms }` | fn |
| `/wall` | `{ totalVotes: int, votersCount: int, turnoutPct: number, recent: { [pushId]: { club: string, at: ms } } }` (max 10 recent) | fn |
| `/election` | `{ phase, paused, closesAt: ms, resultsPublished }` | fn |
| `/pulse/{pollId}` | `{ counts: int[], total: int }` | fn |
| `/predictionLeaderboard/{rank}` | `{ name: "Tarun U.", batch, score }` (top 20) | fn |

---

## 4. Code — `lib/schema/`

Shared by Next.js app, API routes and `functions/` (copy or symlink the folder into `functions/src/schema`).

### 4.1 `lib/schema/common.ts`
```ts
import { z } from "zod";

/** Works for both client (firebase/firestore) and admin (firebase-admin) Timestamps. */
export const TimestampSchema = z.custom<{ toDate(): Date; toMillis(): number }>(
  (v) => !!v && typeof (v as { toDate?: unknown }).toDate === "function",
  { message: "Expected Firestore Timestamp" },
);
export type TimestampLike = z.infer<typeof TimestampSchema>;

export const NIAT_ID_REGEX = /^N\d{2}[A-Z]\d{2}[A-Z]\d{4}$/;
export const RECEIPT_REGEX = /^[A-Z]{2}-[2-9A-HJKMNP-Z]{4}$/;

export const NiatId = z.string().trim().toUpperCase().min(6).max(20);
export const StrictNiatId = NiatId.regex(NIAT_ID_REGEX, "Invalid NIAT ID");
export const PositionId = z.string().regex(/^[a-z0-9-]{2,40}$/, "Invalid position id");
export const NomineeId = z.string().regex(/^[a-z0-9-]{2,40}_[A-Z0-9]{6,20}$/, "Invalid nominee id");
export const Email = z.string().trim().toLowerCase().email().max(120);
export const Phone = z.string().regex(/^\+91[6-9]\d{9}$/, "Invalid phone");
export const Batch = z.string().regex(/^20\d{2}$/);
export const HexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

export const MEDIA_BASE_URL = process.env.NEXT_PUBLIC_MEDIA_BASE_URL ?? "https://media.example.com/";
export const MediaUrl = z.string().url().refine((u) => u.startsWith(MEDIA_BASE_URL), "Media must be hosted on R2");

export const StudentStatus = z.enum(["active", "pending", "disabled"]);
export const Phase = z.enum(["setup", "campaign", "voting", "closed", "results", "concluded"]);
export const PostType = z.enum(["photo", "video", "poster", "story"]);
export const ReactionType = z.enum(["fire", "clap"]);
export const BannerVariant = z.enum(["info", "warning", "success", "image"]);
export const RequestStatus = z.enum(["open", "resolved", "rejected"]);
export const CorrectableField = z.enum(["name", "email", "phone", "admissionNo"]);
export const ActorRole = z.enum(["student", "nominee", "admin", "system"]);

export const AuditAction = z.enum([
  "login", "session_replaced", "vote_cast",
  "correction_requested", "correction_resolved",
  "nominee_added", "nominee_removed", "profile_updated", "post_created", "post_deleted",
  "settings_changed", "voting_paused", "voting_resumed", "results_published",
  "voters_viewed", "export_created", "reminders_sent", "students_imported",
]);

// ID builders — use these everywhere, never hand-concatenate.
export const ids = {
  nominee: (positionId: string, niatId: string) => `${positionId}_${niatId}`,
  vote: (niatId: string, positionId: string) => `${niatId}_${positionId}`,
  reaction: (niatId: string, nomineeId: string) => `${niatId}_${nomineeId}`,
  pulseVote: (pollId: string, niatId: string) => `${pollId}_${niatId}`,
};

/** "SP-7K3M" — no 0/O/1/I/L to avoid misreading. */
export function receiptCode(club: string): string {
  const alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  const prefix = club.replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase().padEnd(2, "X");
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return `${prefix}-${Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("")}`;
}

export function deriveBatch(niatId: string): string {
  const yy = niatId.slice(1, 3);
  return /^\d{2}$/.test(yy) ? `20${yy}` : "unknown";
}
```

### 4.2 `lib/schema/entities.ts`
```ts
import { z } from "zod";
import {
  TimestampSchema as Ts, NiatId, PositionId, NomineeId, Email, Phone, Batch, HexColor, MediaUrl,
  StudentStatus, Phase, PostType, ReactionType, BannerVariant, RequestStatus, CorrectableField,
  ActorRole, AuditAction, RECEIPT_REGEX,
} from "./common";

export const AdminSchema = z.object({
  email: Email,
  name: z.string().min(1).max(80),
  canViewVoters: z.boolean(),
  addedBy: Email,
  createdAt: Ts,
});

export const StudentSchema = z.object({
  niatId: NiatId,
  name: z.string().min(2).max(80),
  email: Email,
  phone: Phone,
  admissionNo: z.string().max(30).default(""), // "" when the sheet has none (2026 batch)
  batch: Batch,
  status: StudentStatus,
  isNominee: z.boolean(),
  nomineeOf: PositionId.nullable(),
  votedPositions: z.array(PositionId),
  votedCount: z.number().int().min(0),
  activeSessionId: z.string().nullable(),
  lastLoginAt: Ts.nullable(),
  createdAt: Ts,
  updatedAt: Ts,
});

export const DirectoryEntrySchema = z.object({
  name: z.string(),
  maskedEmail: z.string(),
  maskedPhone: z.string(),
  maskedAdmission: z.string(),
  batch: Batch,
  status: StudentStatus,
});

export const CorrectionRequestSchema = z.object({
  niatId: NiatId,
  fields: z.array(CorrectableField).min(1).max(4),
  requested: z.record(CorrectableField, z.string().max(120)),
  note: z.string().max(500),
  contactEmail: Email,
  status: RequestStatus,
  resolution: z.string().max(300).optional(),
  resolvedBy: Email.optional(),
  createdAt: Ts,
  resolvedAt: Ts.optional(),
});

export const PositionSchema = z.object({
  id: PositionId,
  name: z.string().min(2).max(60),
  club: z.string().min(2).max(30),
  color: HexColor,
  icon: z.string().min(1).max(40),
  description: z.string().max(300),
  order: z.number().int().min(0),
  active: z.boolean(),
  nomineeCount: z.number().int().min(0),
  createdAt: Ts,
  updatedAt: Ts,
});

export const NomineeSchema = z.object({
  id: NomineeId,
  positionId: PositionId,
  niatId: NiatId,
  name: z.string(),
  batch: Batch,
  photoUrl: MediaUrl.nullable(),
  bio: z.string().max(300),
  promises: z.array(z.string().min(1).max(120)).max(6),
  active: z.boolean(),
  reactionCounts: z.object({ fire: z.number().int().min(0), clap: z.number().int().min(0) }),
  postCount: z.number().int().min(0),
  hasActiveStory: z.boolean(),
  createdAt: Ts,
  updatedAt: Ts,
});

export const VoteSchema = z.object({
  voterId: NiatId,
  positionId: PositionId,
  nomineeId: NomineeId,
  createdAt: Ts,
  counted: z.boolean().optional(),
  receiptCode: z.string().regex(RECEIPT_REGEX).optional(),
  batch: Batch.optional(),
});

export const TallySchema = z.object({
  positionId: PositionId,
  counts: z.record(NomineeId, z.number().int().min(0)),
  total: z.number().int().min(0),
  updatedAt: Ts,
});

export const PostSchema = z
  .object({
    nomineeId: NomineeId,
    niatId: NiatId,
    type: PostType,
    mediaUrl: MediaUrl,
    posterUrl: MediaUrl.optional(),
    caption: z.string().max(200),
    durationSec: z.number().min(1).max(30).optional(),
    expiresAt: Ts.optional(),
    commentCount: z.number().int().min(0),
    deleted: z.boolean(),
    deletedBy: z.string().optional(),
    createdAt: Ts,
  })
  .refine((p) => p.type !== "video" || (p.durationSec !== undefined && p.posterUrl !== undefined), {
    message: "Videos need durationSec and posterUrl",
  })
  .refine((p) => p.type !== "story" || p.expiresAt !== undefined, { message: "Stories need expiresAt" });

export const QuestionSchema = z.object({
  nomineeId: NomineeId,
  text: z.string().min(3).max(300),
  answer: z.string().max(600).nullable(),
  answeredAt: Ts.nullable(),
  hidden: z.boolean(),
  createdAt: Ts,
});

export const CommentSchema = z.object({
  postId: z.string().min(1),
  nomineeId: NomineeId,
  text: z.string().min(1).max(300),
  hidden: z.boolean(),
  createdAt: Ts,
});

/** questionAuthors / commentAuthors — admin-only identity map */
export const AuthorMapSchema = z.object({ niatId: NiatId, createdAt: Ts });

export const ReactionSchema = z.object({
  niatId: NiatId,
  nomineeId: NomineeId,
  type: ReactionType,
  updatedAt: Ts,
});

export const DebateSchema = z.object({
  positionId: PositionId,
  question: z.string().min(5).max(300),
  answers: z.record(NomineeId, z.object({ text: z.string().max(600), updatedAt: Ts })),
  createdAt: Ts,
});

export const PredictionSchema = z.object({
  niatId: NiatId,
  picks: z.record(PositionId, NomineeId),
  score: z.number().int().min(0).optional(),
  rank: z.number().int().min(1).optional(),
  updatedAt: Ts,
});

export const PulsePollSchema = z
  .object({
    question: z.string().min(5).max(200),
    options: z.array(z.string().min(1).max(60)).min(2).max(5),
    opensAt: Ts,
    closesAt: Ts,
    active: z.boolean(),
  })
  .refine((p) => p.opensAt.toMillis() < p.closesAt.toMillis(), { message: "opensAt must be before closesAt" });

export const PulseVoteSchema = z.object({
  pollId: z.string().min(1),
  niatId: NiatId,
  optionIndex: z.number().int().min(0).max(4),
  createdAt: Ts,
});

export const BannerSchema = z
  .object({
    variant: BannerVariant,
    text: z.string().min(1).max(160),
    imageUrl: MediaUrl.optional(),
    link: z.string().url().optional(),
    startsAt: Ts,
    endsAt: Ts,
    active: z.boolean(),
    createdBy: Email,
    createdAt: Ts,
  })
  .refine((b) => b.variant !== "image" || !!b.imageUrl, { message: "Image banners need imageUrl" });

export const ElectionSettingsSchema = z
  .object({
    phase: Phase,
    campaignOpensAt: Ts,
    opensAt: Ts,
    closesAt: Ts,
    paused: z.boolean(),
    pausedReason: z.string().max(200).nullable(),
    resultsPublished: z.boolean(),
    siteClosesAt: Ts,
    nomineesCanSelfVote: z.boolean(),
    receiptsByEmail: z.boolean(),
    updatedBy: Email,
    updatedAt: Ts,
  })
  .refine(
    (s) =>
      s.campaignOpensAt.toMillis() < s.opensAt.toMillis() &&
      s.opensAt.toMillis() < s.closesAt.toMillis() &&
      s.closesAt.toMillis() < s.siteClosesAt.toMillis(),
    { message: "Dates must be in order: campaign < open < close < site close" },
  );

export const AuditLogSchema = z.object({
  actor: z.string().min(1),
  actorRole: ActorRole,
  action: AuditAction,
  target: z.string().nullable(),
  meta: z.record(z.string(), z.unknown()),
  at: Ts,
});

// ---- Inferred types ----
export type Admin = z.infer<typeof AdminSchema>;
export type Student = z.infer<typeof StudentSchema>;
export type DirectoryEntry = z.infer<typeof DirectoryEntrySchema>;
export type CorrectionRequest = z.infer<typeof CorrectionRequestSchema>;
export type Position = z.infer<typeof PositionSchema>;
export type Nominee = z.infer<typeof NomineeSchema>;
export type Vote = z.infer<typeof VoteSchema>;
export type Tally = z.infer<typeof TallySchema>;
export type Post = z.infer<typeof PostSchema>;
export type Question = z.infer<typeof QuestionSchema>;
export type Comment = z.infer<typeof CommentSchema>;
export type Reaction = z.infer<typeof ReactionSchema>;
export type Debate = z.infer<typeof DebateSchema>;
export type Prediction = z.infer<typeof PredictionSchema>;
export type PulsePoll = z.infer<typeof PulsePollSchema>;
export type PulseVote = z.infer<typeof PulseVoteSchema>;
export type Banner = z.infer<typeof BannerSchema>;
export type ElectionSettings = z.infer<typeof ElectionSettingsSchema>;
export type AuditLog = z.infer<typeof AuditLogSchema>;
```

### 4.3 `lib/schema/inputs.ts` — what clients send
These validate **user input** before it reaches Firestore, callables or API routes (server-set fields like timestamps and counters are excluded).

```ts
import { z } from "zod";
import { NiatId, StrictNiatId, PositionId, NomineeId, Email, MediaUrl, CorrectableField, PostType, ReactionType } from "./common";

/** One row of the uploaded Excel sheet (after header mapping). */
export const StudentImportRow = z.object({
  niatId: NiatId,
  name: z.string().trim().replace(/\s+/g, " ").min(2).max(80),
  email: Email,
  phone: z
    .union([z.string(), z.number()])
    .transform((v) => String(v).replace(/\D/g, "").slice(-10))
    .refine((v) => /^[6-9]\d{9}$/.test(v), "Invalid Indian mobile number")
    .transform((v) => `+91${v}`),
  // Optional (2026 sheet has no hall-ticket column); blank → undefined → stored as ""
  admissionNo: z.preprocess((v) => (v === "" || v == null ? undefined : v), z.union([z.string(), z.number()]).transform((v) => String(v).trim().toUpperCase()).pipe(z.string().min(1).max(30)).optional()),
  batch: z.union([z.string(), z.number()]).transform(String).pipe(z.string().regex(/^20\d{2}$/)).optional(),
});
export type StudentImportRow = z.infer<typeof StudentImportRow>;

/** Accepted header spellings → field. Matching is case/space-insensitive. */
export const IMPORT_HEADER_MAP: Record<string, keyof StudentImportRow> = {
  "niatid": "niatId", "niat id": "niatId", "student id": "niatId",
  "name": "name", "student name": "name", "full name": "name",
  "email": "email", "email id": "email", "mail": "email", "email address": "email",
  "phone": "phone", "phone number": "phone", "mobile": "phone", "mobile number": "phone",
  "admission no": "admissionNo", "admission number": "admissionNo", "admission id": "admissionNo",
  "cdu hall ticket no": "admissionNo", "hall ticket no": "admissionNo", "hall ticket number": "admissionNo", "hall ticket": "admissionNo",
  "batch": "batch", "year": "batch",
};

export const LookupInput = z.object({ niatId: StrictNiatId.or(NiatId) });

export const CorrectionRequestInput = z
  .object({
    niatId: NiatId,
    fields: z.array(CorrectableField).min(1).max(4),
    requested: z.record(CorrectableField, z.string().trim().min(1).max(120)),
    note: z.string().trim().max(500).default(""),
    contactEmail: Email,
    turnstileToken: z.string().min(1),
  })
  .refine((r) => r.fields.every((f) => r.requested[f] !== undefined), {
    message: "Provide a corrected value for every selected field",
  });

export const CastVoteInput = z
  .object({ voterId: NiatId, positionId: PositionId, nomineeId: NomineeId })
  .refine((v) => v.nomineeId.startsWith(`${v.positionId}_`), { message: "Nominee is not in this position" });

export const NomineeProfileInput = z.object({
  photoUrl: MediaUrl.nullable(),
  bio: z.string().trim().max(300),
  promises: z.array(z.string().trim().min(1).max(120)).max(6),
});

export const UploadUrlInput = z.object({
  kind: z.enum(["avatar", "post", "poster", "story"]),
  contentType: z.enum(["image/webp", "image/jpeg", "image/png", "video/mp4"]),
  sizeBytes: z.number().int().positive(),
}).refine(
  (u) => (u.contentType === "video/mp4" ? u.sizeBytes <= 15 * 1024 * 1024 : u.sizeBytes <= 2 * 1024 * 1024),
  { message: "File too large (images ≤ 2 MB, videos ≤ 15 MB)" },
);

export const CreatePostInput = z.object({
  type: PostType,
  mediaUrl: MediaUrl,
  posterUrl: MediaUrl.optional(),
  caption: z.string().trim().max(200).default(""),
  durationSec: z.number().min(1).max(30).optional(),
});

export const AskQuestionInput = z.object({ nomineeId: NomineeId, text: z.string().trim().min(3).max(300) });
export const AnswerQuestionInput = z.object({ questionId: z.string().min(1), answer: z.string().trim().min(1).max(600) });
export const AddCommentInput = z.object({ postId: z.string().min(1), text: z.string().trim().min(1).max(300) });
export const ReactInput = z.object({ nomineeId: NomineeId, type: ReactionType.nullable() }); // null = remove
export const AnswerDebateInput = z.object({ positionId: PositionId, text: z.string().trim().min(1).max(600) });
export const PredictionInput = z.object({ picks: z.record(PositionId, NomineeId) });
export const PulseVoteInput = z.object({ pollId: z.string().min(1), optionIndex: z.number().int().min(0).max(4) });

// ---- Admin inputs ----
export const SetNomineeInput = z.object({ niatId: NiatId, positionId: PositionId, active: z.boolean() });

export const ResolveRequestInput = z.object({
  requestId: z.string().min(1),
  decision: z.enum(["resolved", "rejected"]),
  apply: z.record(CorrectableField, z.string().trim().min(1).max(120)).optional(),
  resolution: z.string().trim().max(300).optional(),
});

export const UpdateSettingsInput = z.object({
  campaignOpensAt: z.coerce.date().optional(),
  opensAt: z.coerce.date().optional(),
  closesAt: z.coerce.date().optional(),
  siteClosesAt: z.coerce.date().optional(),
  paused: z.boolean().optional(),
  pausedReason: z.string().trim().max(200).nullable().optional(),
  resultsPublished: z.boolean().optional(),
  nomineesCanSelfVote: z.boolean().optional(),
  receiptsByEmail: z.boolean().optional(),
});

export const SendRemindersInput = z.object({
  segment: z.enum(["not_voted_any", "not_voted_all", "position"]),
  positionId: PositionId.optional(),
  batch: z.string().regex(/^20\d{2}$/).optional(),
  dryRun: z.boolean().default(true),
}).refine((r) => r.segment !== "position" || !!r.positionId, { message: "positionId required" });

export const ExportInput = z.object({
  what: z.array(z.enum(["results", "voters", "audit", "requests"])).min(1),
  format: z.enum(["xlsx", "pdf"]),
});
```

### 4.4 `lib/schema/realtime.ts` — RTDB shapes
```ts
import { z } from "zod";
import { Phase } from "./common";

export const RtTallySchema = z.object({
  total: z.number().int().min(0),
  counts: z.record(z.string(), z.number().int().min(0)).default({}),
  updatedAt: z.number(),
});

export const RtWallSchema = z.object({
  totalVotes: z.number().int().min(0),
  votersCount: z.number().int().min(0),
  turnoutPct: z.number().min(0).max(100),
  recent: z.record(z.string(), z.object({ club: z.string(), at: z.number() })).default({}),
});

export const RtElectionSchema = z.object({
  phase: Phase,
  paused: z.boolean(),
  closesAt: z.number(),
  resultsPublished: z.boolean(),
});

export const RtPulseSchema = z.object({ counts: z.array(z.number().int().min(0)), total: z.number().int().min(0) });

export const RtLeaderboardEntrySchema = z.object({ name: z.string(), batch: z.string(), score: z.number().int() });

export type RtTally = z.infer<typeof RtTallySchema>;
export type RtWall = z.infer<typeof RtWallSchema>;
export type RtElection = z.infer<typeof RtElectionSchema>;
export type RtPulse = z.infer<typeof RtPulseSchema>;
```

### 4.5 `lib/schema/converters.ts` — typed Firestore access (client)
```ts
import {
  collection, doc, type DocumentData, type FirestoreDataConverter,
  type QueryDocumentSnapshot, type SnapshotOptions, type Firestore,
} from "firebase/firestore";
import type { ZodType } from "zod";
import {
  StudentSchema, PositionSchema, NomineeSchema, VoteSchema, PostSchema, QuestionSchema,
  CommentSchema, ReactionSchema, DebateSchema, PredictionSchema, BannerSchema,
  ElectionSettingsSchema, PulsePollSchema,
  type Student, type Position, type Nominee, type Vote, type Post, type Question, type Comment,
  type Reaction, type Debate, type Prediction, type Banner, type ElectionSettings, type PulsePoll,
} from "./entities";

/**
 * Validates on read. In production we log and still return the data on schema drift,
 * so a single malformed doc never breaks a screen during the election.
 */
function converter<T>(schema: ZodType<T>, name: string): FirestoreDataConverter<T & { _id: string }> {
  return {
    toFirestore: (data) => {
      const { _id, ...rest } = data as T & { _id?: string };
      return rest as DocumentData;
    },
    fromFirestore: (snap: QueryDocumentSnapshot, options?: SnapshotOptions) => {
      const raw = snap.data({ ...options, serverTimestamps: "estimate" });
      const parsed = schema.safeParse(raw);
      if (!parsed.success) {
        console.warn(`[schema] ${name}/${snap.id} failed validation`, parsed.error.flatten());
        return { ...(raw as T), _id: snap.id };
      }
      return { ...parsed.data, _id: snap.id };
    },
  };
}

export const conv = {
  student: converter<Student>(StudentSchema, "students"),
  position: converter<Position>(PositionSchema, "positions"),
  nominee: converter<Nominee>(NomineeSchema, "nominees"),
  vote: converter<Vote>(VoteSchema, "votes"),
  post: converter<Post>(PostSchema as unknown as ZodType<Post>, "posts"),
  question: converter<Question>(QuestionSchema, "questions"),
  comment: converter<Comment>(CommentSchema, "comments"),
  reaction: converter<Reaction>(ReactionSchema, "reactions"),
  debate: converter<Debate>(DebateSchema, "debates"),
  prediction: converter<Prediction>(PredictionSchema, "predictions"),
  banner: converter<Banner>(BannerSchema as unknown as ZodType<Banner>, "banners"),
  pulsePoll: converter<PulsePoll>(PulsePollSchema as unknown as ZodType<PulsePoll>, "pulsePolls"),
  settings: converter<ElectionSettings>(ElectionSettingsSchema as unknown as ZodType<ElectionSettings>, "settings"),
};

/** Typed refs — import these instead of writing collection paths by hand. */
export const refs = (db: Firestore) => ({
  student: (niatId: string) => doc(db, "students", niatId).withConverter(conv.student),
  positions: () => collection(db, "positions").withConverter(conv.position),
  nominees: () => collection(db, "nominees").withConverter(conv.nominee),
  nominee: (id: string) => doc(db, "nominees", id).withConverter(conv.nominee),
  vote: (id: string) => doc(db, "votes", id).withConverter(conv.vote),
  votes: () => collection(db, "votes").withConverter(conv.vote),
  posts: () => collection(db, "posts").withConverter(conv.post),
  questions: () => collection(db, "questions").withConverter(conv.question),
  comments: () => collection(db, "comments").withConverter(conv.comment),
  reaction: (id: string) => doc(db, "reactions", id).withConverter(conv.reaction),
  debate: (positionId: string) => doc(db, "debates", positionId).withConverter(conv.debate),
  prediction: (niatId: string) => doc(db, "predictions", niatId).withConverter(conv.prediction),
  banners: () => collection(db, "banners").withConverter(conv.banner),
  pulsePolls: () => collection(db, "pulsePolls").withConverter(conv.pulsePoll),
  settings: () => doc(db, "settings", "election").withConverter(conv.settings),
});
```

### 4.6 `lib/schema/index.ts`
```ts
export * from "./common";
export * from "./entities";
export * from "./inputs";
export * from "./realtime";
// converters.ts is client-only (imports firebase/firestore); import it directly where needed.
```

---

## 5. Example Documents

```jsonc
// students/N25H01A0693
{
  "niatId": "N25H01A0693", "name": "Tarun Uttupulusu", "email": "tarun@example.com",
  "phone": "+919876543210", "admissionNo": "ADM25123", "batch": "2025",
  "status": "active", "isNominee": false, "nomineeOf": null,
  "votedPositions": ["sports-president"], "votedCount": 1,
  "activeSessionId": "s_8f2c…", "lastLoginAt": "<Timestamp>",
  "createdAt": "<Timestamp>", "updatedAt": "<Timestamp>"
}

// nominees/sports-president_N25H01A0101
{
  "id": "sports-president_N25H01A0101", "positionId": "sports-president", "niatId": "N25H01A0101",
  "name": "Ravi K", "batch": "2025", "photoUrl": "https://media.example.com/nominees/N25H01A0101/avatar/3c1….webp",
  "bio": "Captain of the inter-college cricket team.",
  "promises": ["Weekly turf slots for every batch", "Inter-batch league in January"],
  "active": true, "reactionCounts": { "fire": 230, "clap": 112 }, "postCount": 6, "hasActiveStory": true,
  "createdAt": "<Timestamp>", "updatedAt": "<Timestamp>"
}

// votes/N25H01A0693_sports-president  (after onVoteCreated)
{
  "voterId": "N25H01A0693", "positionId": "sports-president",
  "nomineeId": "sports-president_N25H01A0101", "createdAt": "<Timestamp>",
  "counted": true, "receiptCode": "SP-7K3M", "batch": "2025"
}

// tallies/sports-president
{
  "positionId": "sports-president",
  "counts": { "sports-president_N25H01A0101": 401, "sports-president_N25H01A0223": 300, "sports-president_N25H01A0310": 111 },
  "total": 812, "updatedAt": "<Timestamp>"
}
```

---

## 6. Schema Change Rules

1. Add fields as **optional first**, deploy readers, backfill with a script, then make required.
2. Never rename a field during the election window (19–20 Nov). Freeze schema on **18 Nov**.
3. Every change updates: this file → `DATAMODEL.md` → `firestore.rules` → rules tests.
4. Converters tolerate drift (log + return) so one bad document never blanks a screen.

---

## 7. Additions during build (14 Nov 2026)

| Change | Where | Why |
|---|---|---|
| `StudentImportRow.name` uses `.trim().transform(collapse spaces).pipe(min 2, max 80)` | `lib/schema/inputs.ts` | Zod strings have no `.replace()`; the §4.3 snippet didn't compile |
| `receiptCode()` uses rejection sampling | `lib/schema/common.ts` | Removes `byte % 31` modulo bias |
| `CheckEmailInput { email }` | inputs | `POST /api/directory/[niatId]/check-email` (MASTERPROMPT §6.2) |
| `ImportStudentsInput { rows: Record<string, unknown>[] (1–3000) }` | inputs | `importStudents` callable; each row re-validated with `StudentImportRow` server-side |
| `AdminUpdateStudentInput { niatId, name?, email?, phone?, admissionNo?, status? }` | inputs | `adminUpdateStudent` callable (D3) |
| `VotersQueryInput { positionId, nomineeId? }` | inputs | `getVotersForNominee` callable (D2, voter-admin, audited) |
| `RecountInput { positionId }` | inputs | `recountPosition` callable (9001 equivalent) |
| `ElectionSettings.requireStudentMfa?: boolean` (default treated as `true`) | entities | 2-step for students/nominees (admins always) |
| `MfaCodeInput { code }` — 6 digits or `XXXX-XXXX` backup code; `MfaResetInput { email }` | inputs | 2-step callables |
| `AuditAction` += `mfa_enrolled`, `mfa_verified`, `mfa_failed`, `mfa_locked`, `mfa_reset` | common | 2-step audit trail |
