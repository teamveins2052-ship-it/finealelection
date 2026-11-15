import { z } from "zod";
import {
  TimestampSchema as Ts,
  NiatId,
  PositionId,
  NomineeId,
  Email,
  Phone,
  Batch,
  HexColor,
  MediaUrl,
  StudentStatus,
  Phase,
  PostType,
  ReactionType,
  BannerVariant,
  RequestStatus,
  CorrectableField,
  ActorRole,
  AuditAction,
  RECEIPT_REGEX,
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
  mfaEnabled: z.boolean().optional(), // server-owned: student opted in to 2-step (required at every sign-in then)
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
    requireStudentMfa: z.boolean().optional(), // 2-step for students/nominees (admins always)
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
