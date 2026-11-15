"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Activity, AlertTriangle, CheckCircle2, PauseCircle, PlayCircle } from "lucide-react";
import { PageTitle, StatCard } from "@/components/admin/shell";
import { useAdminData } from "@/components/admin/data";
import { ClubIcon } from "@/components/shared/club-icon";
import { Button } from "@/components/ui/button";
import { Card, Chip, Input, Label, LiveDot, Skeleton, VoteBar } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/sheet";
import { useElection } from "@/hooks/use-election";
import { useTallies, useWall } from "@/hooks/use-realtime";
import { useSession } from "@/hooks/use-session";
import { updateSettings } from "@/lib/admin-actions";
import { fmtIST, pct } from "@/lib/election";

/** D1 + D5 pause + health card (DESIGN §7 Overview). */
export default function AdminOverview() {
  const { students, positions, nominees, tallies, requests } = useAdminData();
  const election = useElection();
  const rtTallies = useTallies();
  const wall = useWall();
  const session = useSession();
  const [pauseOpen, setPauseOpen] = useState(false);

  const stats = useMemo(() => {
    if (!students) return null;
    const active = students.filter((s) => s.status === "active");
    const voted = active.filter((s) => s.votedCount > 0).length;
    return { total: students.length, active: active.length, voted, notVoted: active.length - voted };
  }, [students]);

  const drift = useMemo(() => {
    if (!tallies || !rtTallies.data) return [];
    return Object.entries(tallies).filter(([id, t]) => (rtTallies.data?.[id]?.total ?? 0) !== t.total).map(([id]) => id);
  }, [tallies, rtTallies.data]);

  const lastVote = useMemo(() => {
    const r = Object.values(wall.data?.recent ?? {});
    return r.length ? Math.max(...r.map((x) => x.at)) : null;
  }, [wall.data]);
  const perMin = useMemo(() => Object.values(wall.data?.recent ?? {}).filter((x) => Date.now() - x.at < 60_000).length, [wall.data]);

  const openRequests = requests?.filter((r) => r.status === "open").length ?? 0;
  const s = election.status === "ready" ? election : null;

  return (
    <>
      <PageTitle title="Overview">
        {s && <Chip tone={s.settings.paused ? "warning" : s.phase === "voting" ? "success" : "neutral"}>{s.settings.paused ? "Paused" : s.phase}</Chip>}
        {s && (
          <Button variant={s.settings.paused ? "primary" : "outline"} size="sm" className={s.settings.paused ? "" : "border-danger text-danger"} onClick={() => setPauseOpen(true)}>
            {s.settings.paused ? <PlayCircle className="size-4" /> : <PauseCircle className="size-4" />}
            {s.settings.paused ? "Resume voting" : "Pause voting"}
          </Button>
        )}
      </PageTitle>

      {!stats ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Total students" value={stats.total.toLocaleString("en-IN")} sub={`${stats.active} active`} />
          <StatCard label="Voted" value={stats.voted.toLocaleString("en-IN")} tone="success" />
          <StatCard label="Not voted" value={stats.notVoted.toLocaleString("en-IN")} />
          <StatCard label="Turnout" value={`${pct(stats.voted, stats.active)}%`} />
          <StatCard label="Votes / min" value={perMin} sub="last 60 s" />
          <Link href="/admin/requests"><StatCard label="Open requests" value={openRequests} tone={openRequests ? "warning" : undefined} /></Link>
        </div>
      )}

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Live results</h2>
            <LiveDot />
          </div>
          {!positions || !nominees ? (
            <Skeleton className="h-40" />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {positions.filter((p) => p.active).map((p) => {
                const t = tallies?.[p._id];
                const list = nominees.filter((n) => n.positionId === p._id && n.active).map((n) => ({ n, v: t?.counts[n._id] ?? 0 })).sort((a, b) => b.v - a.v);
                return (
                  <div key={p._id} className="space-y-2">
                    <p className="flex items-center gap-2 text-sm font-semibold">
                      <ClubIcon name={p.icon} color={p.color} className="size-4" /> {p.name}
                      <span className="ml-auto text-xs text-muted tabular-nums">{t?.total ?? 0}</span>
                    </p>
                    {list.map(({ n, v }) => (
                      <div key={n._id} className="space-y-1">
                        <div className="flex justify-between text-xs"><span>{n.name}</span><span className="tabular-nums text-muted">{v} · {pct(v, t?.total ?? 0)}%</span></div>
                        <VoteBar value={pct(v, t?.total ?? 0)} color={p.color} label={`${n.name}`} />
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card className="space-y-3 p-4">
          <h2 className="flex items-center gap-2 font-semibold"><Activity className="size-4" /> Health</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Last vote</dt><dd>{lastVote ? fmtIST(lastVote, "h:mm:ss a") : "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Total votes (live)</dt><dd className="tabular-nums">{wall.data?.totalVotes ?? 0}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Voting window</dt><dd className="text-right">{s ? `${fmtIST(s.settings.opensAt)} → ${fmtIST(s.settings.closesAt)}` : "—"}</dd></div>
          </dl>
          {drift.length === 0 ? (
            <p className="flex items-center gap-2 rounded-md bg-success/10 p-2 text-sm text-success"><CheckCircle2 className="size-4" /> Live mirror matches Firestore</p>
          ) : (
            <p className="flex items-start gap-2 rounded-md bg-warning/10 p-2 text-sm text-warning">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" /> Mirror out of sync for {drift.join(", ")}. Use Recount on the Results page.
            </p>
          )}
        </Card>
      </div>

      {s && session.status === "ready" && (
        <PauseSheet open={pauseOpen} onClose={() => setPauseOpen(false)} paused={s.settings.paused} onConfirm={async (reason) => {
          try {
            await updateSettings(session.email, s.settings, { paused: !s.settings.paused, pausedReason: s.settings.paused ? null : reason || null });
            toast.success(s.settings.paused ? "Voting resumed" : "Voting paused");
            setPauseOpen(false);
          } catch {
            toast.error("Couldn't update. Check your admin access.");
          }
        }} />
      )}
    </>
  );
}

function PauseSheet({ open, onClose, paused, onConfirm }: { open: boolean; onClose: () => void; paused: boolean; onConfirm: (reason: string) => Promise<void> }) {
  const [typed, setTyped] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const word = paused ? "RESUME" : "PAUSE";
  return (
    <Sheet open={open} onClose={onClose} title={paused ? "Resume voting" : "Pause voting"}>
      <div className="space-y-4">
        <h2 className="font-display text-xl font-semibold">{paused ? "Resume voting?" : "Emergency pause"}</h2>
        <p className="text-sm text-muted">{paused ? "Students can vote again immediately." : "All vote submissions are blocked by the database until you resume. Students see a pause banner."}</p>
        {!paused && (
          <div>
            <Label htmlFor="reason">Reason shown to students (optional)</Label>
            <Input id="reason" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        )}
        <div>
          <Label htmlFor="confirm-word">Type {word} to confirm</Label>
          <Input id="confirm-word" value={typed} onChange={(e) => setTyped(e.target.value.toUpperCase())} autoComplete="off" />
        </div>
        <Button variant={paused ? "primary" : "destructive"} className="w-full" disabled={typed !== word} loading={busy} onClick={async () => { setBusy(true); await onConfirm(reason); setBusy(false); setTyped(""); }}>
          {paused ? "Resume voting" : "Pause voting"}
        </Button>
      </div>
    </Sheet>
  );
}
