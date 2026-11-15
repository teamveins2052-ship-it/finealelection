/**
 * Brevo accounts in priority order. Each free account sends ~300 emails/day; the app uses
 * account 1 until its daily cap, then 2, then 3 … automatically. Anything beyond all of them
 * waits in the mail queue for the next day.
 * Each account must have its OWN verified sender in Brevo (Senders & IP).
 *
 *   BREVO_API_KEY    + EMAIL_FROM     → account 1
 *   BREVO_API_KEY_2  + EMAIL_FROM_2   → account 2 (optional)
 *   BREVO_API_KEY_3  + EMAIL_FROM_3   → account 3 (optional)
 *   … up to BREVO_API_KEY_5
 */
export const MAX_MAIL_ACCOUNTS = 5;

export interface MailAccount {
  key: string;
  from: string;
}

export function mailAccounts(env: Record<string, string | undefined> = process.env): MailAccount[] {
  const fallbackFrom = env.EMAIL_FROM ?? "elections@example.com";
  const out: MailAccount[] = [];
  for (let n = 1; n <= MAX_MAIL_ACCOUNTS; n++) {
    const suffix = n === 1 ? "" : `_${n}`;
    const key = env[`BREVO_API_KEY${suffix}`]?.trim();
    if (key) out.push({ key, from: env[`EMAIL_FROM${suffix}`]?.trim() || fallbackFrom });
  }
  return out;
}

/** Per-day usage for each account, stored in _emailQuota/{yyyy-mm-dd}. */
export interface DayUsage {
  sent: number[]; // emails sent today, per account index
  full: boolean[]; // Brevo itself said "limit reached" for that account today
}

/**
 * Which account to use next: the first one under its cap that Brevo hasn't refused today.
 * Returns -1 when every account is used up (email waits in the queue, never crashes the app).
 */
export function pickAccount(usage: DayUsage, accounts: number, cap: number): number {
  for (let i = 0; i < accounts; i++) {
    if (!usage.full[i] && (usage.sent[i] ?? 0) < cap) return i;
  }
  return -1;
}
