"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Ban, CalendarClock, Home, Hourglass, ListChecks, MonitorSmartphone, Sparkles, User, Vote } from "lucide-react";
import { Logo } from "@/components/shared/logo";
import { CountdownChip, OfflineBar } from "@/components/shared/status";
import { Button } from "@/components/ui/button";
import { Card, ProgressRing, Skeleton } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/sheet";
import { logout, useSession, useTwoStep } from "@/hooks/use-session";
import { useElection } from "@/hooks/use-election";
import { isEnrolling, TwoStep } from "@/components/auth/two-step";
import { useVotedPositions } from "@/hooks/use-my-votes";
import { call, getPositions } from "@/lib/client-data";
import { fmtIST, studentPortalOpen } from "@/lib/election";
import { cn } from "@/lib/utils";

/** Shared frame for student + nominee screens: guards every account state (DESIGN §8). */
export function StudentShell({ children, nomineeOnly }: { children: React.ReactNode; nomineeOnly?: boolean }) {
  const session = useSession();
  const router = useRouter();
  const twoStep = useTwoStep();
  const election = useElection();

  useEffect(() => {
    if (session.status === "signedOut") router.replace("/");
  }, [session.status, router]);

  // Welcome email on first sign-in (free hosting has no Firestore trigger). The server dedupes
  // per student; the session flag just avoids a call on every page.
  const niatId = session.status === "ready" ? session.student?.niatId : undefined;
  useEffect(() => {
    if (!niatId) return;
    const key = `niat.welcomed.${niatId}`;
    if (sessionStorage.getItem(key)) return;
    call("welcome", {})
      .then(() => sessionStorage.setItem(key, "1"))
      .catch(() => undefined);
  }, [niatId, twoStep.verified]);

  if (session.status !== "ready") return <ShellSkeleton />;

  const { student, admin, kicked } = session;
  if (!student) {
    return (
      <Centered>
        <p className="font-semibold">{admin ? "You're signed in as election committee." : "This account isn't linked to a student record."}</p>
        {admin ? (
          <Button onClick={() => router.push("/admin")}>Open admin panel</Button>
        ) : (
          <Button variant="secondary" onClick={() => logout().then(() => router.replace("/"))}>Sign out</Button>
        )}
      </Centered>
    );
  }
  if (student.status === "pending") {
    return (
      <Centered>
        <Hourglass className="size-12 text-warning" />
        <h1 className="font-display text-[22px] font-semibold">Your request is with the admin</h1>
        <p className="text-muted">You&apos;ll get an email when it&apos;s fixed. Login is paused until then.</p>
        <Button variant="secondary" onClick={() => logout().then(() => router.replace("/"))}>Sign out</Button>
      </Centered>
    );
  }
  if (student.status === "disabled") {
    return (
      <Centered>
        <Ban className="size-12 text-muted" />
        <h1 className="font-display text-[22px] font-semibold">Contact the election committee</h1>
        <p className="text-muted">This account can&apos;t vote right now.</p>
        <Button variant="secondary" onClick={() => logout().then(() => router.replace("/"))}>Sign out</Button>
      </Centered>
    );
  }
  // 2-step gate (rules enforce the same thing; this just shows the right screen).
  if (election.status === "loading" || twoStep.verified === null) return <ShellSkeleton />;
  // Students only get in from voting open (19 Nov 9 AM); nominees can prepare their Studio earlier.
  if (election.status === "ready" && !studentPortalOpen(election.phase) && !student.isNominee) {
    return (
      <Centered>
        <CalendarClock className="size-12 text-primary" />
        {election.phase === "setup" || election.phase === "campaign" ? (
          <>
            <h1 className="font-display text-[22px] font-semibold">The voting portal isn&apos;t open yet</h1>
            <p className="text-muted">
              Come back on <b className="text-text">{fmtIST(election.settings.opensAt, "d MMM, h:mm a")}</b> IST. Voting closes{" "}
              {fmtIST(election.settings.closesAt, "d MMM, h:mm a")}.
            </p>
          </>
        ) : (
          <>
            <h1 className="font-display text-[22px] font-semibold">Voting has closed</h1>
            <p className="text-muted">
              The portal closed on <b className="text-text">{fmtIST(election.settings.closesAt, "d MMM, h:mm a")}</b> IST. Thank you for
              voting — the election committee will announce the results.
            </p>
          </>
        )}
        <Button variant="secondary" onClick={() => logout().then(() => router.replace("/"))}>Sign out</Button>
      </Centered>
    );
  }
  // Optional for students unless the election requires it for everyone; opted-in students always need it.
  const mfaRequired = student.mfaEnabled === true || (election.status === "ready" ? election.settings.requireStudentMfa : true);
  if (mfaRequired && !twoStep.verified && !isEnrolling()) return <TwoStep email={session.email} onVerified={twoStep.refresh} />;

  if (nomineeOnly && !student.isNominee) {
    return (
      <Centered>
        <p className="font-semibold">The studio is only for nominees.</p>
        <Button onClick={() => router.push("/dashboard")}>Go home</Button>
      </Centered>
    );
  }

  return (
    <div className="min-h-dvh pb-[calc(72px+env(safe-area-inset-bottom))] lg:pb-8 max-w-full overflow-x-hidden">
      <OfflineBar />
      <Header isNominee={student.isNominee} />
      <main className="mx-auto w-full max-w-[1720px] px-3.5 sm:px-6 lg:px-10 xl:px-12 pt-4 lg:pt-8 min-w-0 max-w-full overflow-x-hidden">{children}</main>
      <BottomNav isNominee={student.isNominee} />
      <Sheet open={kicked} onClose={() => undefined} dismissible={false} title="Signed in elsewhere">
        <div className="space-y-4 text-center">
          <MonitorSmartphone className="mx-auto size-10 text-primary" />
          <h2 className="font-display text-xl font-semibold">You were signed in on another device</h2>
          <p className="text-sm text-muted">For security, only one device can be signed in at a time.</p>
          <Button className="w-full" onClick={() => logout().then(() => router.replace(`/login?id=${student.niatId}`))}>
            Sign in again
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

function useActivePositionCount() {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    getPositions().then((p) => setN(p.filter((x) => x.active).length)).catch(() => setN(null));
  }, []);
  return n;
}

function Header({ isNominee }: { isNominee: boolean }) {
  const total = useActivePositionCount();
  const voted = useVotedPositions();
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1720px] items-center justify-between gap-3 px-4 sm:px-6 lg:h-16 lg:px-10 xl:px-12">
        <Link href="/dashboard" aria-label="Home" className="shrink-0">
          <Logo />
        </Link>
        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
          {navItems(isNominee).map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={cn("rounded-full px-4 py-2 text-sm font-bold whitespace-nowrap", pathname.startsWith(n.href) ? "bg-ink text-bg" : "text-muted hover:bg-surface-2 hover:text-text")}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex shrink-0 items-center gap-2">
          <CountdownChip className="hidden whitespace-nowrap sm:inline-flex" />
          {total !== null && <ProgressRing done={Math.min(voted.size, total)} total={total} size={30} />}
        </div>
      </div>
    </header>
  );
}

function navItems(isNominee: boolean) {
  return [
    { href: "/dashboard", label: "Home", Icon: Home },
    { href: "/vote", label: "Vote", Icon: Vote },
    { href: "/my-votes", label: "My Votes", Icon: ListChecks },
    { href: "/profile", label: "Profile", Icon: User },
    ...(isNominee ? [{ href: "/studio", label: "Studio", Icon: Sparkles }] : []),
  ];
}

function BottomNav({ isNominee }: { isNominee: boolean }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <ul className="mx-auto flex max-w-md">
        {navItems(isNominee).map(({ href, label, Icon }) => {
          const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href)) || (href === "/vote" && pathname.startsWith("/nominee"));
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn("flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold", active ? "text-primary" : "text-muted")}
              >
                <Icon className="size-5" strokeWidth={active ? 2.25 : 1.75} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md items-center px-4">
      <Card className="flex w-full flex-col items-center gap-4 p-6 text-center">{children}</Card>
    </main>
  );
}

function ShellSkeleton() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 pt-4">
      <Skeleton className="h-10 w-48" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-20 w-full" />
    </div>
  );
}
