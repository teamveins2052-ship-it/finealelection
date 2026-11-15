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
export const MediaUrl = z
  .string()
  .url()
  .refine((u) => u.startsWith(MEDIA_BASE_URL), "Media must be hosted on R2");

export const StudentStatus = z.enum(["active", "pending", "disabled"]);
export const Phase = z.enum(["setup", "campaign", "voting", "closed", "results", "concluded"]);
export const PostType = z.enum(["photo", "video", "poster", "story"]);
export const ReactionType = z.enum(["fire", "clap"]);
export const BannerVariant = z.enum(["info", "warning", "success", "image"]);
export const RequestStatus = z.enum(["open", "resolved", "rejected"]);
export const CorrectableField = z.enum(["name", "email", "phone", "admissionNo"]);
export const ActorRole = z.enum(["student", "nominee", "admin", "system"]);

export const AuditAction = z.enum([
  "login",
  "session_replaced",
  "vote_cast",
  "correction_requested",
  "correction_resolved",
  "nominee_added",
  "nominee_removed",
  "profile_updated",
  "post_created",
  "post_deleted",
  "settings_changed",
  "voting_paused",
  "voting_resumed",
  "results_published",
  "voters_viewed",
  "export_created",
  "reminders_sent",
  "students_imported",
  "mfa_enrolled",
  "mfa_verified",
  "mfa_failed",
  "mfa_locked",
  "mfa_reset",
  "announcement_sent",
]);

// ID builders — use these everywhere, never hand-concatenate.
export const ids = {
  nominee: (positionId: string, niatId: string) => `${positionId}_${niatId}`,
  vote: (niatId: string, positionId: string) => `${niatId}_${positionId}`,
  reaction: (niatId: string, nomineeId: string) => `${niatId}_${nomineeId}`,
  pulseVote: (pollId: string, niatId: string) => `${pollId}_${niatId}`,
};

const RECEIPT_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // no 0/O/1/I/L

/** "SP-7K3M". Rejection sampling avoids the modulo bias of `byte % 31`. */
export function receiptCode(club: string): string {
  const prefix = club.replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase().padEnd(2, "X");
  const limit = 256 - (256 % RECEIPT_ALPHABET.length);
  let out = "";
  while (out.length < 4) {
    for (const b of crypto.getRandomValues(new Uint8Array(8))) {
      if (b < limit && out.length < 4) out += RECEIPT_ALPHABET[b % RECEIPT_ALPHABET.length];
    }
  }
  return `${prefix}-${out}`;
}

export function deriveBatch(niatId: string): string {
  const yy = niatId.slice(1, 3);
  return /^\d{2}$/.test(yy) ? `20${yy}` : "unknown";
}
