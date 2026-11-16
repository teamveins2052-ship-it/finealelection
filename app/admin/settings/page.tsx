"use client";

import { useEffect, useState } from "react";
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import { toast } from "sonner";
import { PageTitle } from "@/components/admin/shell";
import { Button } from "@/components/ui/button";
import { Card, Label, Skeleton } from "@/components/ui/primitives";
import { Input } from "@/components/ui/primitives";
import { useElection } from "@/hooks/use-election";
import { useSession } from "@/hooks/use-session";
import { updateSettings } from "@/lib/admin-actions";
import { TZ, type PublicSettings } from "@/lib/election";

const toLocal = (ms: number) => formatInTimeZone(ms, TZ, "yyyy-MM-dd'T'HH:mm");
const fromLocal = (s: string) => fromZonedTime(s, TZ).getTime();
const TIMES = [
  ["campaignOpensAt", "Campaign opens"],
  ["opensAt", "Voting opens"],
  ["closesAt", "Voting closes"],
  ["siteClosesAt", "Site closes (thank-you page)"],
] as const;

/** D5: window (IST), results publish, self-vote, receipts. Rules enforce date order (P-SET-02). */
export default function SettingsPage() {
  const election = useElection();
  const session = useSession();
  const [times, setTimes] = useState<Record<string, string> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (election.status === "ready" && !times) setTimes(Object.fromEntries(TIMES.map(([k]) => [k, toLocal(election.settings[k])])));
  }, [election, times]);

  if (election.status !== "ready" || !times || session.status !== "ready") return <Skeleton className="h-96" />;
  const s = election.settings;

  const save = async (key: string, patch: Partial<PublicSettings> & Record<string, unknown>, msg: string) => {
    setBusy(key);
    try {
      await updateSettings(session.email, s, patch);
      toast.success(msg);
    } catch {
      toast.error("Couldn't save. Dates must be in order: campaign < open < close < site close.");
    } finally {
      setBusy(null);
    }
  };

  const saveTimes = () => {
    const parsed = Object.fromEntries(TIMES.map(([k]) => [k, fromLocal(times[k])])) as Pick<PublicSettings, (typeof TIMES)[number][0]>;
    if (!(parsed.campaignOpensAt < parsed.opensAt && parsed.opensAt < parsed.closesAt && parsed.closesAt < parsed.siteClosesAt)) {
      return toast.error("Dates must be in order: campaign < open < close < site close.");
    }
    save("times", parsed, "Voting window saved");
  };

  const Toggle = ({ k, label, desc, danger }: { k: "resultsPublished" | "nomineesCanSelfVote" | "receiptsByEmail" | "requireStudentMfa"; label: string; desc: string; danger?: boolean }) => {
    const value = k === "receiptsByEmail" ? undefined : s[k];
    return (
      <div className="flex items-start justify-between gap-4 border-b border-border py-3 last:border-0">
        <div><p className="font-semibold">{label}</p><p className="text-sm text-muted">{desc}</p></div>
        {value === undefined ? (
          <div className="flex gap-1">
            <Button size="sm" variant="outline" loading={busy === `${k}1`} onClick={() => save(`${k}1`, { [k]: true }, "Receipts by email on")}>On</Button>
            <Button size="sm" variant="outline" loading={busy === `${k}0`} onClick={() => save(`${k}0`, { [k]: false }, "Receipts by email off")}>Off</Button>
          </div>
        ) : (
          <Button size="sm" variant={value ? (danger ? "outline" : "primary") : "outline"} loading={busy === k}
            onClick={() => (!danger || confirm(`${value ? "Turn off" : "Turn on"}: ${label}?`)) && save(k, { [k]: !value }, `${label}: ${!value ? "on" : "off"}`)}>
            {value ? "On" : "Off"}
          </Button>
        )}
      </div>
    );
  };

  return (
    <>
      <PageTitle title="Settings" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3 p-4">
          <h2 className="font-semibold">Election window <span className="text-xs font-normal text-muted">(IST)</span></h2>
          {TIMES.map(([k, label]) => (
            <div key={k}><Label htmlFor={k}>{label}</Label><Input id={k} type="datetime-local" className="h-10" value={times[k]} onChange={(e) => setTimes((t) => ({ ...t!, [k]: e.target.value }))} /></div>
          ))}
          <Button onClick={saveTimes} loading={busy === "times"}>Save window</Button>
        </Card>
        <Card className="p-4">
          <h2 className="mb-1 font-semibold">Switches</h2>
          <Toggle k="resultsPublished" label="Results published" desc="Unlocks the results page for every student." danger />
          <Toggle k="nomineesCanSelfVote" label="Nominees can vote for themselves" desc="Committee decision; enforced by database rules (V-9)." />
          <Toggle k="requireStudentMfa" label="Require 2-step for ALL students & nominees" desc="Off (default): 2-step is optional — students can turn it on in Profile, and then need the code at every sign-in. On: everyone must set it up. Admins always need 2-step." danger />
        </Card>
        <Card className="space-y-2 border-danger/40 p-4 lg:col-span-2">
          <h2 className="font-semibold text-danger">Danger zone</h2>
          <p className="text-sm text-muted">Admins are managed in the Supabase table editor (admins table — no in-app privilege escalation). PII teardown runs as a reviewed script after the official export — never from this panel.</p>
        </Card>
      </div>
    </>
  );
}
