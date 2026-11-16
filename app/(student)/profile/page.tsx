"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lock, LogOut, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/primitives";
import { Enroll } from "@/components/auth/two-step";
import { useState } from "react";
import { logout, useSession, useTwoStep } from "@/hooks/use-session";
import { cn } from "@/lib/utils";

/** A5 / DESIGN §6.12: read-only details; corrections go through the admin (D-02). */
export default function ProfilePage() {
  const session = useSession();
  const router = useRouter();
  const twoStep = useTwoStep();
  if (session.status !== "ready" || !session.student) return null;
  const s = session.student;

  const rows: Array<[string, string, boolean?]> = [
    ["Name", s.name],
    ["NIAT ID", s.niatId, true],
    ["Batch", s.batch],
    ["Email", s.email, true],
    ["Phone", s.phone, true],
    ...(s.admissionNo ? ([["Hall ticket no.", s.admissionNo, true]] as Array<[string, string, boolean?]>) : []),
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="font-display text-[28px] leading-[34px] lg:text-[40px] lg:leading-[44px]">Profile</h1>
      <Card className="p-4">
        <dl>
          {rows.map(([k, v, mono]) => (
            <div key={k} className="flex items-center justify-between gap-3 border-b border-border py-3 last:border-0">
              <dt className="flex items-center gap-1.5 text-sm text-muted">
                <Lock className="size-3.5" aria-hidden /> {k}
              </dt>
              <dd className={cn("truncate text-sm font-semibold", mono && "font-mono")}>{v}</dd>
            </div>
          ))}
        </dl>
        <Link href={`/login/request?id=${s.niatId}`} className="mt-2 inline-flex h-11 items-center text-sm font-semibold text-primary">
          Something wrong? Request a correction
        </Link>
      </Card>

      <TwoStepCard on={s.mfaEnabled === true} email={s.email} refresh={twoStep.refresh} />


      <Card className="flex gap-3 p-4 text-sm text-muted">
        <ShieldCheck className="size-5 shrink-0" />
        <p>
          Your vote is anonymous to everyone except the election committee&apos;s voter-admins, and every time they look is logged. All
          personal data is deleted after the election.
        </p>
      </Card>

      <Button variant="outline" className="w-full" onClick={() => logout().then(() => router.replace("/"))}>
        <LogOut className="size-4" /> Log out
      </Button>
    </div>
  );
}

/**
 * Optional 2-step for students (default). Once turned on, the code is needed at every sign-in —
 * rules and server guards enforce it via the server-owned students.mfaEnabled flag (P-MFA-05).
 * Turning it off again is a committee reset (protects against someone who grabbed an open session).
 */
function TwoStepCard({ on, email, refresh }: { on: boolean; email: string; refresh: () => Promise<void> }) {
  const [setup, setSetup] = useState(false);
  // Stay on the setup view until the student has seen and saved the backup codes, even though the
  // server flips `on` the moment the code is accepted.
  if (setup) {
    return (
      <Card className="space-y-3 p-4">
        <Enroll email={email} onVerified={async () => { await refresh(); setSetup(false); }} />
        <Button variant="ghost" size="sm" onClick={() => setSetup(false)}>Cancel</Button>
      </Card>
    );
  }
  return (
    <Card className="flex items-start gap-3 p-4">
      <ShieldCheck className="mt-0.5 size-5 shrink-0" />
      <div className="flex-1 space-y-2 text-sm">
        <p className="font-semibold">2-step verification {on ? <span className="text-success">· On</span> : <span className="text-muted">· Optional</span>}</p>
        {on ? (
          <p className="text-muted">You&apos;ll enter a code from your authenticator app every time you sign in. Lost your phone? Ask the election committee to reset it.</p>
        ) : (
          <>
            <p className="text-muted">Add a code from your phone at every sign-in, so nobody else can vote as you even if they get into your email.</p>
            <Button size="sm" variant="secondary" onClick={() => setSetup(true)}>Turn on 2-step</Button>
          </>
        )}
      </div>
    </Card>
  );
}
