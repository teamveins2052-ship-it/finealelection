"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Bell, Megaphone, RefreshCw, Send } from "lucide-react";
import { PageTitle, StatCard } from "@/components/admin/shell";
import { useAdminData } from "@/components/admin/data";
import { Button } from "@/components/ui/button";
import { Card, Chip, Input, Label, Textarea, VoteBar } from "@/components/ui/primitives";
import { call, errorMessage } from "@/lib/client-data";
import { AnnouncementInput } from "@/lib/schema";

type Segment = "all" | "not_voted_any" | "not_voted_all" | "position";
interface Status { accounts: { sender: string; sentToday: number; full: boolean }[]; dailyCapPerAccount: number; waiting: number }

/**
 * Brevo emails (sign-in links are sent too, straight away — see callables/login.ts). Two Brevo accounts switch
 * automatically; anything over today's limit waits in the queue and sends the next day.
 */
export default function EmailsPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const loadStatus = useCallback(() => {
    call<Record<string, never>, Status>("emailStatus", {}).then(setStatus).catch(() => setStatus(null));
  }, []);
  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const capTotal = status ? status.dailyCapPerAccount * status.accounts.length : 0;
  const sentTotal = status?.accounts.reduce((a, b) => a + b.sentToday, 0) ?? 0;

  return (
    <>
      <PageTitle title="Emails">
        <Button variant="outline" size="sm" onClick={loadStatus}><RefreshCw className="size-4" /> Refresh</Button>
      </PageTitle>
      <p className="mb-4 text-sm text-muted">
        Welcome emails (first sign-in) and &ldquo;I voted&rdquo; stickers (all clubs voted) send automatically. Sign-in links are sent through the same Brevo accounts.
        Vote receipts stay in the app (My Votes).
      </p>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatCard label="Sent today" value={status ? `${sentTotal} / ${capTotal}` : "—"} sub={status ? `${status.accounts.length} Brevo account${status.accounts.length === 1 ? "" : "s"}` : "loading…"} />
        <StatCard label="Waiting in queue" value={status?.waiting ?? "—"} sub="sends automatically, every 15 min" tone={status && status.waiting > 0 ? "warning" : undefined} />
        <Card className="space-y-2 p-4">
          <p className="text-xs font-medium text-muted">Brevo accounts</p>
          {status?.accounts.length === 0 && <p className="text-sm text-warning">None configured — emails are only logged.</p>}
          {status?.accounts.map((a, i) => (
            <div key={i} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate">#{i + 1} {a.sender}</span>
                {a.full ? <Chip tone="warning">full today</Chip> : <span className="tabular-nums text-muted">{a.sentToday}/{status.dailyCapPerAccount}</span>}
              </div>
              <VoteBar value={(a.sentToday / status.dailyCapPerAccount) * 100} label={`Account ${i + 1} usage`} />
            </div>
          ))}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Announcement onSent={loadStatus} />
        <Reminders onSent={loadStatus} />
      </div>
    </>
  );
}

function Audience({ segment, setSegment, positionId, setPositionId, batch, setBatch, allowAll }: {
  segment: Segment; setSegment: (s: Segment) => void; positionId: string; setPositionId: (s: string) => void; batch: string; setBatch: (s: string) => void; allowAll?: boolean;
}) {
  const { positions } = useAdminData();
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <Label htmlFor="seg">Who</Label>
        <select id="seg" value={segment} onChange={(e) => setSegment(e.target.value as Segment)} className="h-10 w-full rounded-xl border-2 border-ink bg-surface px-3 text-sm">
          {allowAll && <option value="all">All active students</option>}
          <option value="not_voted_any">Haven&apos;t voted at all</option>
          <option value="not_voted_all">Haven&apos;t finished every club</option>
          <option value="position">Haven&apos;t voted in one position</option>
        </select>
      </div>
      <div>
        <Label htmlFor="batch">Batch</Label>
        <select id="batch" value={batch} onChange={(e) => setBatch(e.target.value)} className="h-10 w-full rounded-xl border-2 border-ink bg-surface px-3 text-sm">
          <option value="">All batches</option><option value="2025">2025 (seniors)</option><option value="2026">2026 (juniors)</option>
        </select>
      </div>
      {segment === "position" && (
        <div className="sm:col-span-2">
          <Label htmlFor="pos">Position</Label>
          <select id="pos" value={positionId} onChange={(e) => setPositionId(e.target.value)} className="h-10 w-full rounded-xl border-2 border-ink bg-surface px-3 text-sm">
            <option value="">Choose…</option>{positions?.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}

function Announcement({ onSent }: { onSent: () => void }) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [segment, setSegment] = useState<Segment>("all");
  const [positionId, setPositionId] = useState("");
  const [batch, setBatch] = useState("");
  const [count, setCount] = useState<number | null>(null);
  const [busy, setBusy] = useState<"preview" | "send" | null>(null);

  const run = async (dryRun: boolean) => {
    const parsed = AnnouncementInput.safeParse({ subject, message, segment, dryRun, ...(segment === "position" ? { positionId } : {}), ...(batch ? { batch } : {}) });
    if (!parsed.success) return toast.error(parsed.error.issues[0]?.path[0] === "subject" ? "Subject: 3–120 characters." : parsed.error.issues[0]?.path[0] === "message" ? "Message: 10–3,000 characters." : "Pick a position.");
    setBusy(dryRun ? "preview" : "send");
    try {
      const r = await call<typeof parsed.data, { count: number; sent: number; queued: number }>("sendAnnouncement", parsed.data);
      setCount(r.count);
      if (!dryRun) {
        toast.success(`Sent ${r.sent}${r.queued ? ` · ${r.queued} waiting for tomorrow's limit` : ""}`);
        onSent();
      }
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="space-y-4 p-5">
      <h2 className="flex items-center gap-2 font-display text-lg"><Megaphone className="size-5" /> Announcement</h2>
      <div><Label htmlFor="subj">Subject ({subject.length}/120)</Label><Input id="subj" className="h-11" maxLength={120} value={subject} onChange={(e) => { setSubject(e.target.value); setCount(null); }} placeholder="Voting opens tomorrow at 9 AM" /></div>
      <div><Label htmlFor="msg">Message ({message.length}/3000)</Label><Textarea id="msg" className="min-h-40" maxLength={3000} value={message} onChange={(e) => { setMessage(e.target.value); setCount(null); }} placeholder={"Write in plain text. A blank line starts a new paragraph.\n\nStudents see \"Hi <first name>,\" above your message and a button to open the site."} /></div>
      <Audience segment={segment} setSegment={(s) => { setSegment(s); setCount(null); }} positionId={positionId} setPositionId={(p) => { setPositionId(p); setCount(null); }} batch={batch} setBatch={(b) => { setBatch(b); setCount(null); }} allowAll />
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => run(true)} loading={busy === "preview"}>Preview count</Button>
        <Button size="sm" onClick={() => count !== null && confirm(`Email "${subject}" to ${count} students?`) && run(false)} disabled={count === null || count === 0} loading={busy === "send"}><Send className="size-4" /> Send</Button>
        {count !== null && <span className="text-sm font-bold tabular-nums">{count.toLocaleString("en-IN")} students</span>}
      </div>
    </Card>
  );
}

function Reminders({ onSent }: { onSent: () => void }) {
  const [segment, setSegment] = useState<Segment>("not_voted_any");
  const [positionId, setPositionId] = useState("");
  const [batch, setBatch] = useState("");
  const [count, setCount] = useState<number | null>(null);
  const [busy, setBusy] = useState<"preview" | "send" | null>(null);

  const run = async (dryRun: boolean) => {
    if (segment === "position" && !positionId) return toast.error("Pick a position.");
    setBusy(dryRun ? "preview" : "send");
    try {
      const r = await call<Record<string, unknown>, { count: number; sent: number; skipped: number }>("sendReminders", { segment, dryRun, ...(segment === "position" ? { positionId } : {}), ...(batch ? { batch } : {}) });
      setCount(r.count);
      if (!dryRun) {
        toast.success(`Sent ${r.sent}${r.skipped ? ` · ${r.skipped} waiting for tomorrow's limit` : ""}`);
        onSent();
      }
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="space-y-4 p-5">
      <h2 className="flex items-center gap-2 font-display text-lg"><Bell className="size-5" /> Voting reminder</h2>
      <p className="text-sm text-muted">Ready-made &ldquo;Your vote is waiting&rdquo; email with a Vote now button. Each student gets at most one reminder per day.</p>
      <Audience segment={segment} setSegment={(s) => { setSegment(s); setCount(null); }} positionId={positionId} setPositionId={(p) => { setPositionId(p); setCount(null); }} batch={batch} setBatch={(b) => { setBatch(b); setCount(null); }} />
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => run(true)} loading={busy === "preview"}>Preview count</Button>
        <Button size="sm" onClick={() => count && confirm(`Remind ${count} students?`) && run(false)} disabled={!count} loading={busy === "send"}><Send className="size-4" /> Send</Button>
        {count !== null && <span className="text-sm font-bold tabular-nums">{count.toLocaleString("en-IN")} students</span>}
      </div>
    </Card>
  );
}
