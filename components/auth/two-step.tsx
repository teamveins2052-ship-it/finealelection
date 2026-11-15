"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Download, KeyRound, Lock, LogOut, ShieldCheck, Smartphone, TriangleAlert } from "lucide-react";
import { Logo } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";
import { Card, FieldError, Input, Label, Skeleton } from "@/components/ui/primitives";
import { Stepper } from "./stepper";
import { logout } from "@/hooks/use-session";
import { call, errorMessage } from "@/lib/client-data";
import { fmtIST } from "@/lib/election";
import { MfaCodeInput } from "@/lib/schema";

interface Status { role: "admin" | "student"; required: boolean; enrolled: boolean; backupCodesLeft: number; lockedUntil: number | null }

/**
 * Second sign-in step for every role (admins always; students/nominees while the committee
 * requires it). Passing it sets a claim bound to *this* sign-in — rules and functions check
 * the same claim, so skipping this screen gets you nothing.
 */
/** Set while a user is between "code accepted" and "saved my backup codes" (see Enroll.confirm). */
export const ENROLLING_KEY = "niat.mfaEnrolling";
/** True only for a few minutes after the code was accepted (a closed tab can't leave it on). */
export const isEnrolling = () =>
  typeof window !== "undefined" && Date.now() - Number(sessionStorage.getItem(ENROLLING_KEY) ?? 0) < 5 * 60_000;

export function TwoStep({ onVerified, email, role = "student" }: { onVerified: () => Promise<void>; email: string; role?: "admin" | "student" }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setStatus(await call<Record<string, never>, Status>("mfaStatus", {}));
    } catch (e) {
      setError(errorMessage(e, "Couldn't load 2-step verification. Check your connection."));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const steps = (status?.role ?? role) === "admin" ? ["Sign in", "2-step"] : ["Find you", "Verify email", "2-step"];

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pt-2 pb-8 sm:max-w-lg">
      <header className="flex h-14 items-center justify-between">
        <Logo />
        <button onClick={() => logout()} className="inline-flex h-11 items-center gap-1.5 rounded-full px-3 text-sm font-bold text-muted hover:bg-surface-2">
          <LogOut className="size-4" /> Sign out
        </button>
      </header>
      <div className="flex flex-1 flex-col justify-center gap-5 py-6">
        <Stepper steps={steps} current={steps.length - 1} />
        {!status && !error && <Skeleton className="h-80 w-full rounded-xl" />}
        {error && !status && (
          <Card className="space-y-3 p-5">
            <FieldError>{error}</FieldError>
            <Button variant="outline" onClick={load}>Try again</Button>
          </Card>
        )}
        {status && (status.enrolled ? <Verify status={status} onVerified={onVerified} /> : <Enroll email={email} onVerified={onVerified} />)}
        <p className="flex items-start gap-2 text-xs leading-5 text-muted">
          <Lock className="mt-0.5 size-3.5 shrink-0" />
          Lost your phone? Ask the election committee to reset your 2-step verification. They&apos;ll never ask for your codes.
        </p>
      </div>
    </main>
  );
}

function CodeInput({ value, onChange, onComplete, autoFocus, id }: { value: string; onChange: (v: string) => void; onComplete?: (v: string) => void; autoFocus?: boolean; id: string }) {
  return (
    <Input
      id={id}
      value={value}
      autoFocus={autoFocus}
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="\d{6}"
      maxLength={6}
      placeholder="••••••"
      onChange={(e) => {
        const v = e.target.value.replace(/\D/g, "").slice(0, 6);
        onChange(v);
        if (v.length === 6) onComplete?.(v);
      }}
      className="h-16 text-center font-mono text-3xl tracking-[0.5em] placeholder:tracking-[0.5em]"
    />
  );
}

function Verify({ status, onVerified }: { status: Status; onVerified: () => Promise<void> }) {
  const [code, setCode] = useState("");
  const [backup, setBackup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = useState(status.lockedUntil);
  const inFlight = useRef(false);

  const submit = async (value: string) => {
    if (inFlight.current) return;
    const parsed = MfaCodeInput.safeParse({ code: value });
    if (!parsed.success) return setError(backup ? "Backup codes look like ABCD-2345." : "Enter the 6-digit code from your app.");
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const r = await call<{ code: string }, { usedBackup: boolean; backupCodesLeft: number }>("mfaVerify", parsed.data);
      if (r.usedBackup) toast.warning(`Backup code used — ${r.backupCodesLeft} left.`);
      await onVerified();
    } catch (e) {
      const msg = errorMessage(e, "Couldn't verify. Try again.");
      if (msg.startsWith("Too many")) setLockedUntil(Date.now() + 15 * 60_000);
      setError(msg);
      setCode("");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  if (lockedUntil && lockedUntil > Date.now()) {
    return (
      <Card className="space-y-3 p-6 text-center">
        <TriangleAlert className="mx-auto size-10 text-danger" />
        <h1 className="font-display text-xl">Too many wrong codes</h1>
        <p className="text-sm text-muted">For your safety, 2-step is locked until {fmtIST(lockedUntil, "h:mm a")}. Try again then, or ask the committee for help.</p>
      </Card>
    );
  }

  return (
    <Card className="space-y-5 p-6">
      <div className="space-y-2">
        <span className="grid size-12 place-items-center rounded-full bg-highlight"><ShieldCheck className="size-6" /></span>
        <h1 className="font-display text-[26px] leading-8">2-step verification</h1>
        <p className="text-sm text-muted">
          {backup ? "Enter one of the backup codes you saved when you set this up. Each works once." : "Open your authenticator app and enter the 6-digit code for NIAT Elections."}
        </p>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); submit(code); }} className="space-y-3" noValidate>
        <Label htmlFor="mfa-code">{backup ? "Backup code" : "Authentication code"}</Label>
        {backup ? (
          <Input id="mfa-code" value={code} autoFocus autoComplete="off" placeholder="ABCD-2345" maxLength={9}
            onChange={(e) => setCode(e.target.value.toUpperCase())} className="h-14 text-center font-mono text-xl tracking-widest" />
        ) : (
          <CodeInput id="mfa-code" value={code} onChange={setCode} onComplete={submit} autoFocus />
        )}
        <FieldError>{error}</FieldError>
        <Button type="submit" size="lg" className="w-full" loading={busy}>Verify</Button>
      </form>
      <button onClick={() => { setBackup((b) => !b); setCode(""); setError(null); }} className="inline-flex h-11 items-center gap-2 text-sm font-bold underline-offset-4 hover:underline">
        <KeyRound className="size-4" /> {backup ? "Use my authenticator app instead" : `Use a backup code (${status.backupCodesLeft} left)`}
      </button>
    </Card>
  );
}

export function Enroll({ email, onVerified }: { email: string; onVerified: () => Promise<void> }) {
  const router = useRouter();
  const [stage, setStage] = useState<"intro" | "scan" | "codes">("intro");
  const [setup, setSetup] = useState<{ secret: string; otpauthUri: string; qr: string } | null>(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await call<Record<string, never>, { secret: string; otpauthUri: string }>("mfaEnrollStart", {});
      const QR = await import("qrcode"); // only loaded on this screen
      const qr = await QR.toDataURL(r.otpauthUri, { margin: 1, width: 220, color: { dark: "#111111", light: "#FBFAF7" } });
      setSetup({ ...r, qr });
      setStage("scan");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (value: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    // The server marks an opted-in student (mfaEnabled) a moment before this browser's token
    // carries the new 2-step claim. This flag tells the shell not to swap in the "enter code"
    // screen meanwhile — otherwise the one-time backup codes would never be shown.
    sessionStorage.setItem(ENROLLING_KEY, String(Date.now()));
    try {
      const r = await call<{ code: string }, { backupCodes: string[] }>("mfaEnrollConfirm", { code: value });
      setCodes(r.backupCodes);
      setStage("codes");
    } catch (e) {
      sessionStorage.removeItem(ENROLLING_KEY);
      setError(errorMessage(e));
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    const text = `NIAT Elections '26 — 2-step backup codes\nAccount: ${email}\nEach code works once. Keep them private.\n\n${codes.join("\n")}\n`;
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "niat-elections-backup-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (stage === "intro") {
    return (
      <Card className="space-y-5 p-6">
        <span className="grid size-12 place-items-center rounded-full bg-highlight"><ShieldCheck className="size-6" /></span>
        <h1 className="font-display text-[26px] leading-8">Protect your account</h1>
        <p className="text-sm text-muted">Set up 2-step verification once. After that, signing in needs your email <b>and</b> a code from your phone — so nobody else can vote as you.</p>
        <ol className="space-y-3 text-sm">
          {[
            "Install Google Authenticator, Microsoft Authenticator or Authy (free).",
            "Scan the QR code we show you.",
            "Type the 6-digit code to confirm, then save your backup codes.",
          ].map((t, i) => (
            <li key={i} className="flex gap-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full border-2 border-ink text-xs font-extrabold">{i + 1}</span>
              <span className="pt-0.5">{t}</span>
            </li>
          ))}
        </ol>
        <FieldError>{error}</FieldError>
        <Button size="lg" className="w-full" onClick={start} loading={busy}><Smartphone className="size-5" /> Set up 2-step</Button>
      </Card>
    );
  }

  if (stage === "scan" && setup) {
    return (
      <Card className="space-y-5 p-6">
        <h1 className="font-display text-[26px] leading-8">Scan with your app</h1>
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={setup.qr} alt="QR code for your authenticator app" width={180} height={180} className="rounded-lg border-2 border-ink" />
          <div className="w-full space-y-2 text-sm">
            <p className="text-muted">Can&apos;t scan? Choose &ldquo;Enter a setup key&rdquo; in the app and type:</p>
            <button
              onClick={() => navigator.clipboard.writeText(setup.secret).then(() => toast.success("Key copied"))}
              className="flex w-full items-center justify-between gap-2 rounded-lg border-2 border-ink/20 bg-surface-2 p-3 text-left font-mono text-xs break-all"
              aria-label="Copy setup key"
            >
              {setup.secret.match(/.{1,4}/g)?.join(" ")} <Copy className="size-4 shrink-0" />
            </button>
            <p className="text-xs text-muted">Account: {email} · Type: time-based</p>
          </div>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); confirm(code); }} className="space-y-3" noValidate>
          <Label htmlFor="enroll-code">Enter the 6-digit code shown in the app</Label>
          <CodeInput id="enroll-code" value={code} onChange={setCode} onComplete={confirm} autoFocus />
          <FieldError>{error}</FieldError>
          <Button type="submit" size="lg" className="w-full" loading={busy} disabled={code.length !== 6}>Confirm</Button>
        </form>
      </Card>
    );
  }

  return (
    <Card className="space-y-5 p-6">
      <h1 className="font-display text-[26px] leading-8">Save your backup codes</h1>
      <p className="text-sm text-muted">If you lose your phone, each code lets you sign in once. This is the only time they&apos;re shown.</p>
      <ul className="grid grid-cols-2 gap-2 rounded-xl border-2 border-ink bg-surface-2 p-4 font-mono text-sm font-semibold">
        {codes.map((c) => <li key={c} className="text-center">{c}</li>)}
      </ul>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="flex-1" onClick={() => navigator.clipboard.writeText(codes.join("\n")).then(() => toast.success("Codes copied"))}><Copy className="size-4" /> Copy</Button>
        <Button variant="outline" size="sm" className="flex-1" onClick={download}><Download className="size-4" /> Download</Button>
      </div>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="mt-0.5 size-5 accent-[var(--ink)]" />
        I&apos;ve saved these codes somewhere safe.
      </label>
      <Button size="lg" className="w-full" disabled={!saved || busy} loading={busy} onClick={async () => { setBusy(true); await onVerified(); sessionStorage.removeItem(ENROLLING_KEY); setBusy(false); router.refresh(); }}>
        Continue
      </Button>
    </Card>
  );
}
