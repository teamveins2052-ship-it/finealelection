import { formatInTimeZone } from "date-fns-tz";

export const TZ = "Asia/Kolkata";

export type ClientPhase = "setup" | "campaign" | "voting" | "closed" | "results" | "concluded";

export interface PublicSettings {
  campaignOpensAt: number;
  opensAt: number;
  closesAt: number;
  siteClosesAt: number;
  paused: boolean;
  pausedReason: string | null;
  resultsPublished: boolean;
  nomineesCanSelfVote: boolean;
  requireStudentMfa: boolean;
}

/**
 * Display-only phase derived from settings. Enforcement never depends on this — rules use
 * server `request.time` (AGENTS §5.9). The client clock just decides what to show.
 */
export function phaseOf(s: PublicSettings, now = Date.now()): ClientPhase {
  if (now >= s.siteClosesAt) return "concluded";
  if (s.resultsPublished) return "results";
  if (now >= s.closesAt) return "closed";
  if (now >= s.opensAt) return "voting";
  if (now >= s.campaignOpensAt) return "campaign";
  return "setup";
}

/**
 * Students use the portal only while voting is open (open → 20 Nov 8 PM), and again if the
 * committee publishes results. Before opening / after closing they see a message instead.
 * Nominees and admins are exempt. Display gate only; data access is still enforced by rules.
 */
export const studentPortalOpen = (phase: ClientPhase) => phase === "voting" || phase === "results";

export const canVote = (s: PublicSettings, now = Date.now()) => phaseOf(s, now) === "voting" && !s.paused;

export function fmtIST(ms: number, pattern = "d MMM, h:mm a") {
  return formatInTimeZone(ms, TZ, pattern);
}

export function fmtCountdown(ms: number): string {
  if (ms <= 0) return "00:00:00";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return d > 0 ? `${d}d ${h}h ${pad(m)}m` : `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

export function pct(votes: number, total: number) {
  return total > 0 ? Math.round((votes / total) * 1000) / 10 : 0;
}
