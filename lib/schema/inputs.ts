import { z } from "zod";
import {
  NiatId,
  StrictNiatId,
  PositionId,
  NomineeId,
  Email,
  MediaUrl,
  CorrectableField,
  PostType,
  ReactionType,
} from "./common";

/** One row of the uploaded Excel sheet (after header mapping). */
export const StudentImportRow = z.object({
  niatId: NiatId,
  name: z.string().trim().transform((v) => v.replace(/\s+/g, " ")).pipe(z.string().min(2).max(80)),
  email: Email,
  phone: z
    .union([z.string(), z.number()])
    .transform((v) => String(v).replace(/\D/g, "").slice(-10))
    .refine((v) => /^[6-9]\d{9}$/.test(v), "Invalid Indian mobile number")
    .transform((v) => `+91${v}`),
  // Optional: the 2026 batch sheet has no hall-ticket / admission column.
  admissionNo: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : v),
    z
      .union([z.string(), z.number()])
      .transform((v) => String(v).trim().toUpperCase())
      .pipe(z.string().min(1).max(30))
      .optional(),
  ),
  batch: z
    .union([z.string(), z.number()])
    .transform(String)
    .pipe(z.string().regex(/^20\d{2}$/))
    .optional(),
});
export type StudentImportRow = z.infer<typeof StudentImportRow>;

/** Accepted header spellings → field. Matching is case/space-insensitive. */
export const IMPORT_HEADER_MAP: Record<string, keyof StudentImportRow> = {
  niatid: "niatId",
  "niat id": "niatId",
  "student id": "niatId",
  name: "name",
  "student name": "name",
  "full name": "name",
  email: "email",
  "email id": "email",
  mail: "email",
  "email address": "email",
  phone: "phone",
  "phone number": "phone",
  mobile: "phone",
  "mobile number": "phone",
  "admission no": "admissionNo",
  "admission number": "admissionNo",
  "admission id": "admissionNo",
  "cdu hall ticket no": "admissionNo",
  "hall ticket no": "admissionNo",
  "hall ticket number": "admissionNo",
  "hall ticket": "admissionNo",
  batch: "batch",
  year: "batch",
};

export const LookupInput = z.object({ niatId: StrictNiatId.or(NiatId) });

/** MASTERPROMPT §6.2: email-link path — student types full email, server answers { match } only. */
export const CheckEmailInput = z.object({ email: Email });

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

export const UploadUrlInput = z
  .object({
    kind: z.enum(["avatar", "post", "poster", "story"]),
    contentType: z.enum(["image/webp", "image/jpeg", "image/png", "video/mp4"]),
    sizeBytes: z.number().int().positive(),
  })
  .refine(
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
export const AnswerQuestionInput = z.object({
  questionId: z.string().min(1),
  answer: z.string().trim().min(1).max(600),
});
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
  requireStudentMfa: z.boolean().optional(),
});

export const SendRemindersInput = z
  .object({
    segment: z.enum(["not_voted_any", "not_voted_all", "position"]),
    positionId: PositionId.optional(),
    batch: z
      .string()
      .regex(/^20\d{2}$/)
      .optional(),
    dryRun: z.boolean().default(true),
  })
  .refine((r) => r.segment !== "position" || !!r.positionId, { message: "positionId required" });

/** Raw sheet rows; the callable re-validates each row with StudentImportRow server-side. */
export const ImportStudentsInput = z.object({ rows: z.array(z.record(z.string(), z.unknown())).min(1).max(3000) });

export const AdminUpdateStudentInput = z.object({
  niatId: NiatId,
  name: z.string().trim().min(2).max(80).optional(),
  email: Email.optional(),
  phone: z.string().optional(),
  admissionNo: z.string().trim().min(1).max(30).optional(),
  status: z.enum(["active", "pending", "disabled"]).optional(),
});

export const VotersQueryInput = z.object({ positionId: PositionId, nomineeId: NomineeId.optional() });
export const RecountInput = z.object({ positionId: PositionId });

/** Admin announcement / promotion email (sent via Brevo, queued past the daily limit). */
export const AnnouncementInput = z.object({
  subject: z.string().trim().min(3).max(120),
  message: z.string().trim().min(10).max(3000),
  segment: z.enum(["all", "not_voted_any", "not_voted_all", "position"]),
  positionId: PositionId.optional(),
  batch: z.string().regex(/^20\d{2}$/).optional(),
  dryRun: z.boolean().default(true),
}).refine((a) => a.segment !== "position" || !!a.positionId, { message: "positionId required" });

/** 6-digit authenticator code, or a backup code (XXXX-XXXX). */
export const MfaCodeInput = z.object({
  code: z.string().trim().min(6).max(12).regex(/^(\d{6}|[A-Za-z0-9]{4}-?[A-Za-z0-9]{4})$/, "Enter the 6-digit code or a backup code"),
});
export const MfaResetInput = z.object({ email: Email });

export const ExportInput = z.object({
  what: z.array(z.enum(["results", "voters", "audit", "requests"])).min(1),
  format: z.enum(["xlsx", "pdf"]),
});
