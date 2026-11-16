"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { TwoStep } from "@/components/auth/two-step";
import { Stepper } from "@/components/auth/stepper";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { GoogleAuthProvider, signInWithEmailAndPassword, signInWithPopup } from "firebase/auth";
import {
  BarChart3, Bell, ClipboardList, Download, Eye, FileSpreadsheet, Flag, Gauge, Inbox, LogOut, Megaphone, Menu, Settings, ShieldAlert, Trophy, Users, Vote, X,
} from "lucide-react";
import { Logo } from "@/components/shared/logo";
import { GoogleG } from "@/components/public/login-flow";
import { Button } from "@/components/ui/button";
import { Card, FieldError, Input, Skeleton } from "@/components/ui/primitives";
import { AdminDataProvider, useAdminData } from "./data";
import { logout, useSession, useTwoStep } from "@/hooks/use-session";
import { firebase } from "@/lib/firebase/client";
import { call, errorMessage } from "@/lib/client-data";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/admin", label: "Overview", Icon: Gauge },
  { href: "/admin/results", label: "Results", Icon: Trophy },
  { href: "/admin/voters", label: "Voters", Icon: Eye, voterAdmin: true },
  { href: "/admin/students", label: "Students", Icon: Users },
  { href: "/admin/import", label: "Import sheet", Icon: FileSpreadsheet },
  { href: "/admin/requests", label: "Requests", Icon: Inbox, badge: true },
  { href: "/admin/positions", label: "Positions & Nominees", Icon: Vote },
  { href: "/admin/content", label: "Content", Icon: Flag },
  { href: "/admin/banners", label: "Banners", Icon: Megaphone },
  { href: "/admin/emails", label: "Emails", Icon: Bell },
  { href: "/admin/analytics", label: "Analytics", Icon: BarChart3 },
  { href: "/admin/audit", label: "Audit Log", Icon: ClipboardList },
  { href: "/admin/export", label: "Export", Icon: Download },
  { href: "/admin/settings", label: "Settings", Icon: Settings },
];

/** Quiet, dense, desktop-first admin frame (DESIGN §7); sidebar collapses to a drawer on mobile. */
const IDLE_MS = 30 * 60_000;
const MAX_SESSION_SEC = 12 * 3600;

export function AdminShell({ children }: { children: React.ReactNode }) {
  const session = useSession();
  const twoStep = useTwoStep();
  if (session.status === "loading") return <div className="p-8"><Skeleton className="h-40 w-full" /></div>;
  if (session.status === "signedOut") return <AdminLogin />;
  if (!session.admin) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md items-center px-4">
        <Card className="w-full space-y-4 p-6 text-center">
          <ShieldAlert className="mx-auto size-10 text-danger" />
          <p className="font-semibold">{session.email} isn&apos;t on the admin list.</p>
          <FirstAdminSetup />
          <Button variant="secondary" onClick={() => logout()}>Sign out</Button>
        </Card>
      </main>
    );
  }
  // Admins always need 2-step (P-ADM: rules require the claim for every admin read/write).
  if (twoStep.verified === null) return <div className="p-8"><Skeleton className="h-40 w-full" /></div>;
  if (!twoStep.verified) return <TwoStep email={session.email} onVerified={twoStep.refresh} role="admin" />;
  return (
    <AdminDataProvider>
      <SessionGuard />
      <Frame canViewVoters={session.admin.canViewVoters} email={session.email}>
        {children}
      </Frame>
    </AdminDataProvider>
  );
}

/** Signs admins out after 30 min of inactivity or once the sign-in is 12 h old (rules deny after that anyway). */
function SessionGuard() {
  const router = useRouter();
  useEffect(() => {
    let last = Date.now();
    const bump = () => { last = Date.now(); };
    const events = ["pointerdown", "keydown", "scroll", "visibilitychange"] as const;
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const t = setInterval(async () => {
      const user = firebase().auth.currentUser;
      const authTime = Number((await user?.getIdTokenResult())?.claims.auth_time ?? 0);
      const tooOld = authTime > 0 && Date.now() / 1000 - authTime > MAX_SESSION_SEC;
      if (Date.now() - last > IDLE_MS || tooOld) {
        toast.message(tooOld ? "Your admin session expired. Sign in again." : "Signed out after 30 minutes of inactivity.");
        await logout();
        router.replace("/admin");
      }
    }, 30_000);
    return () => {
      clearInterval(t);
      events.forEach((e) => window.removeEventListener(e, bump));
    };
  }, [router]);
  return null;
}

function Frame({ children, canViewVoters, email }: { children: React.ReactNode; canViewVoters: boolean; email: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { requests } = useAdminData();
  const openCount = requests?.filter((r) => r.status === "open").length ?? 0;

  const nav = (
    <nav aria-label="Admin" className="flex flex-col gap-0.5 p-3">
      {NAV.filter((n) => !n.voterAdmin || canViewVoters).map(({ href, label, Icon, badge }) => {
        const active = href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={() => setOpen(false)}
            className={cn("flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium", active ? "bg-primary/10 text-primary" : "text-muted hover:bg-surface-2 hover:text-text")}
          >
            <Icon className="size-4" />
            <span className="flex-1">{label}</span>
            {badge && openCount > 0 && <span className="rounded-full bg-warning px-1.5 text-xs font-bold text-black">{openCount}</span>}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="hidden border-r border-border bg-surface lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col">
        <div className="flex h-14 items-center border-b border-border px-4"><Logo /></div>
        <div className="flex-1 overflow-y-auto">{nav}</div>
        <div className="border-t border-border p-3 text-xs text-muted">
          <p className="truncate">{email}</p>
          <p>{canViewVoters ? "Voter-admin" : "Admin"}</p>
        </div>
      </aside>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 lg:hidden" onClick={() => setOpen(false)}>
          <aside className="h-full w-72 overflow-y-auto bg-surface" onClick={(e) => e.stopPropagation()}>
            <div className="flex h-14 items-center justify-between border-b border-border px-4">
              <Logo />
              <button aria-label="Close menu" onClick={() => setOpen(false)} className="grid size-11 place-items-center"><X className="size-5" /></button>
            </div>
            {nav}
          </aside>
        </div>
      )}
      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-bg/90 px-4 backdrop-blur">
          <button aria-label="Open menu" onClick={() => setOpen(true)} className="grid size-11 place-items-center rounded-md lg:hidden"><Menu className="size-5" /></button>
          <span className="flex-1 text-sm font-semibold text-muted">Election admin</span>
          <Button variant="ghost" size="sm" onClick={() => logout().then(() => router.replace("/"))}>
            <LogOut className="size-4" /> <span className="hidden sm:inline">Sign out</span>
          </Button>
        </header>
        <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

function AdminLogin() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("password123");
  const dev = process.env.NEXT_PUBLIC_USE_EMULATORS === "true";

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      // Plain sentence per failure type (DESIGN §9) — not one message for everything.
      const code = (e as { code?: string }).code ?? "";
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return;
      setError(
        code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found" || code === "auth/invalid-email"
          ? "Wrong email or password."
          : code === "auth/popup-blocked"
            ? "Your browser blocked the Google window. Allow pop-ups for this site and try again."
            : code === "auth/network-request-failed"
              ? "You're offline or the server is unreachable. Try again."
              : code === "auth/too-many-requests"
                ? "Too many attempts. Wait a few minutes and try again."
                : "Sign-in didn't complete. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm items-center px-4">
      <Card className="w-full space-y-4 p-6">
        <Logo />
        <Stepper steps={["Sign in", "2-step"]} current={0} />
        <h1 className="font-display text-xl">Election committee sign-in</h1>
        <p className="text-sm text-muted">Use your committee Google account. You&apos;ll confirm with your authenticator app next.</p>
        <Button variant="google" className="w-full" loading={busy} onClick={() => run(() => signInWithPopup(firebase().auth, new GoogleAuthProvider()))}>
          <GoogleG /> Continue with Google
        </Button>
        {dev && (
          <form className="space-y-2 border-t border-dashed border-border pt-4" onSubmit={(e) => { e.preventDefault(); run(() => signInWithEmailAndPassword(firebase().auth, email.trim(), pass)); }}>
            <p className="text-xs font-semibold text-muted">Emulator test sign-in (admin@niat.test / judge@niat.test)</p>
            <Input aria-label="Email" placeholder="admin@niat.test" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Input aria-label="Password" type="password" value={pass} onChange={(e) => setPass(e.target.value)} />
            <Button type="submit" variant="outline" className="w-full" loading={busy}>Sign in</Button>
          </form>
        )}
        <FieldError>{error}</FieldError>
      </Card>
    </main>
  );
}

/**
 * Brand-new project only: the person named in BOOTSTRAP_ADMIN_EMAIL creates the first admin,
 * the election settings and placeholder positions. The server refuses everyone else, and
 * refuses forever once any admin exists.
 */
function FirstAdminSetup() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await call("bootstrapElection", {});
      toast.success("Election set up — you're the first admin.");
      window.location.reload(); // re-read the new admin record
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2 rounded-xl border-2 border-dashed border-ink/25 p-4 text-left">
      <p className="text-sm font-bold">Setting up a new election?</p>
      <p className="text-xs text-muted">Only the organiser named during deployment can do this, and only once.</p>
      <Button size="sm" className="w-full" onClick={run} loading={busy}>Set up this election</Button>
      <FieldError>{error}</FieldError>
    </div>
  );
}

/** Page header used by every admin screen. */
export function PageTitle({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <h1 className="font-display text-[22px] font-semibold">{title}</h1>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export function StatCard({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "warning" | "success" | "danger" }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className={cn("mt-1 font-display text-2xl font-bold tabular-nums", tone === "warning" && "text-warning", tone === "success" && "text-success", tone === "danger" && "text-danger")}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </Card>
  );
}
