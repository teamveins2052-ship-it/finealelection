"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
} from "@/lib/db/auth";
import {
  ArrowLeft,
  Lock,
  Mail,
  MailCheck,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { Logo } from "@/components/shared/logo";
import { Stepper } from "@/components/auth/stepper";
import { Turnstile } from "@/components/shared/turnstile";
import { Button } from "@/components/ui/button";
import {
  Card,
  FieldError,
  Input,
  Label,
  Skeleton,
} from "@/components/ui/primitives";
import { backend } from "@/lib/backend/client";
import { EMAIL_LINK_KEY, NIAT_KEY, finishLogin } from "@/lib/auth-flow";
import { Email, NIAT_ID_REGEX } from "@/lib/schema";
import { call, errorMessage } from "@/lib/client-data";
import { EyeLetter } from "@/components/public/eye-letter";
import { useSession } from "@/hooks/use-session";
import { useElection } from "@/hooks/use-election";
import { fmtIST, studentPortalOpen } from "@/lib/election";

interface Details {
  niatId: string;
  name: string;
  maskedEmail: string;
  maskedPhone: string;
  maskedAdmission: string;
  batch: string;
  status: "active" | "pending" | "disabled";
}

// Password sign-in for test accounts only (never set NEXT_PUBLIC_TEST_LOGIN on the live site).
const DEV = process.env.NEXT_PUBLIC_TEST_LOGIN === "true";

const LOOKUP_CACHE = "niat.lookup";
const LOOKUP_TTL_MS = 10 * 60_000;

function readCachedLookup(niatId: string): Details | null {
  try {
    const c = JSON.parse(sessionStorage.getItem(LOOKUP_CACHE) ?? "null") as {
      at: number;
      d: Details;
    } | null;
    return c && c.d.niatId === niatId && Date.now() - c.at < LOOKUP_TTL_MS
      ? c.d
      : null;
  } catch {
    return null;
  }
}
function writeCachedLookup(d: Details) {
  try {
    sessionStorage.setItem(LOOKUP_CACHE, JSON.stringify({ at: Date.now(), d }));
  } catch {}
}

export function LoginFlow() {
  const params = useSearchParams();
  const router = useRouter();
  const niatId = (params.get("id") ?? "").trim().toUpperCase();
  const [token, setToken] = useState<string | null>(null);
  const [state, setState] = useState<
    | { s: "enter" }
    | { s: "loading" }
    | { s: "error"; message: string; notFound?: boolean }
    | { s: "details"; d: Details }
    | { s: "verify"; d: Details }
  >(niatId ? { s: "loading" } : { s: "enter" });

  const lookup = useCallback(async () => {
    if (!niatId) return setState({ s: "enter" });
    // Reloads and Back/forward reuse this tab's last answer (masked fields only), so a
    // student refreshing the page doesn't burn the per-ID rate limit (5 per 10 min).
    const cached = readCachedLookup(niatId);
    if (cached) return setState({ s: "details", d: cached });
    setState({ s: "loading" });
    try {
      // Cloud Function lookupStudent: masked fields only, rate-limited (P-API-01).
      const d = await call<{ niatId: string; turnstileToken: string }, Details>(
        "lookupStudent",
        { niatId, turnstileToken: token ?? "" },
      );
      writeCachedLookup(d);
      setState({ s: "details", d });
    } catch (e) {
      const code = (e as { code?: string }).code ?? "";
      setState({
        s: "error",
        message:
          code === "functions/unavailable" ||
          (code === "functions/internal" && !navigator.onLine)
            ? "You're offline or the server is unreachable. Try again."
            : code === "functions/resource-exhausted"
              ? "Too many tries for this NIAT ID. Wait 10 minutes, then try again."
              : errorMessage(e, "Lookup failed. Try again."),
        notFound: code === "functions/not-found",
      });
    }
  }, [niatId, token]);

  // Look up once per NIAT ID. Re-renders (and token refreshes) must not re-run it — each call
  // counts against the per-ID rate limit. "Try again" calls lookup() directly.
  // Already signed in (e.g. tapped "Login to vote" again on the home page) → straight to their space.
  const session = useSession();
  const election = useElection();
  const portalClosed =
    election.status === "ready" && !studentPortalOpen(election.phase);
  useEffect(() => {
    if (niatId || session.status !== "ready") return;
    if (session.student) router.replace("/dashboard");
    else if (session.admin) router.replace("/admin");
  }, [niatId, session, router]);

  const looked = useRef<string | null>(null);
  useEffect(() => {
    // Opened /login directly (e.g. a "Login to vote" button): ask for the NIAT ID here.
    if (!niatId) {
      looked.current = null;
      setState({ s: "enter" });
      return;
    }
    if (looked.current === niatId) return;
    if (!token && !readCachedLookup(niatId)) return;
    looked.current = niatId;
    lookup();
  }, [token, niatId, lookup]);

  return (
    // Phone: one column. Tablet: wider card. Desktop: poster panel on the left, sign-in on the right.
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pt-2 pb-8 sm:max-w-xl sm:px-6 lg:max-w-6xl lg:px-8">
      <header className="flex h-14 items-center lg:h-20">
        <Link
          href="/"
          aria-label="Back to home"
          className="-ml-2 grid size-11 place-items-center rounded-md hover:bg-surface-2"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <Logo />
      </header>
      <Turnstile onToken={setToken} />

      <div className="flex flex-1 flex-col justify-center gap-5 py-6 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] lg:items-center lg:gap-16 xl:gap-24">
        <LoginPoster step={state.s === "verify" ? 1 : 0} />
        <div className="flex flex-col gap-5">
          {portalClosed && election.status === "ready" && (
            <p
              role="status"
              className="rounded-2xl border-2 border-ink bg-highlight p-4 text-sm font-semibold"
            >
              {election.phase === "setup" || election.phase === "campaign" ? (
                <>
                  The voting portal opens{" "}
                  {fmtIST(election.settings.opensAt, "d MMM, h:mm a")} IST and
                  closes {fmtIST(election.settings.closesAt, "d MMM, h:mm a")}.
                  Nominees can sign in now to set up their profiles.
                </>
              ) : (
                <>
                  Voting closed on{" "}
                  {fmtIST(election.settings.closesAt, "d MMM, h:mm a")} IST. The
                  election committee will announce the results.
                </>
              )}
            </p>
          )}
          <Stepper
            steps={["Find you", "Verify email", "2-step"]}
            current={state.s === "verify" ? 1 : 0}
          />
          {state.s === "enter" && (
            <EnterIdStep
              onSubmit={(id) =>
                router.replace(`/login?id=${encodeURIComponent(id)}`)
              }
            />
          )}
          {state.s === "loading" && (
            <Card className="space-y-4 p-5 sm:p-7">
              <Skeleton className="h-7 w-40" />
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="mt-4 h-12 w-full" />
            </Card>
          )}

          {state.s === "error" && (
            <Card className="space-y-4 p-5 sm:p-7">
              <TriangleAlert className="size-8 text-warning" />
              <p className="font-semibold">{state.message}</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  onClick={() => router.replace("/login")}
                >
                  Change NIAT ID
                </Button>
                {!state.notFound && <Button onClick={lookup}>Try again</Button>}
              </div>
              {state.notFound && niatId && (
                <p className="text-sm text-muted">
                  Not on the list? Contact the election committee with your NIAT
                  ID and college email.
                </p>
              )}
            </Card>
          )}

          {state.s === "details" && (
            <DetailsStep
              d={state.d}
              onConfirm={() => setState({ s: "verify", d: state.d })}
            />
          )}
          {state.s === "verify" && (
            <VerifyStep
              d={state.d}
              onBack={() => setState({ s: "details", d: state.d })}
            />
          )}
          <p className="flex items-start gap-2 text-xs leading-5 text-muted">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
            Signing in takes your registered email plus a code from your phone
            (2-step verification). We never ask for passwords.
          </p>
        </div>
      </div>
    </main>
  );
}

const POSTER_STEPS = [
  {
    title: "Find you",
    body: "Enter your NIAT ID and check your masked details.",
  },
  {
    title: "Verify email",
    body: "Sign in with the Google account or email on the official sheet.",
  },
  {
    title: "2-step code",
    body: "Type the 6-digit code from your authenticator app.",
  },
];

/**
 * Tablet: a one-line poster headline above the card. Desktop: big poster headline on the
 * left with what each step means. Phones skip it so the form stays above the fold.
 */
function LoginPoster({ step }: { step: number }) {
  return (
    <>
      <p
        className="hidden text-center font-display text-[56px] leading-none uppercase sm:block lg:hidden"
        aria-hidden
      >
        L<EyeLetter />g in. V<EyeLetter />
        te.
      </p>
      <aside className="hidden lg:block">
        <p
          className="font-display text-[88px] leading-[0.9] uppercase xl:text-[104px]"
          aria-hidden
        >
          L<EyeLetter />g in.
          <br />
          V<EyeLetter />
          te.
          <br />
          Done.
        </p>
        <ol className="mt-10 max-w-md space-y-4">
          {POSTER_STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-4">
              <span
                className={`grid size-10 shrink-0 place-items-center rounded-full border-2 border-ink font-display ${i === step ? "bg-highlight" : i < step ? "bg-ink text-bg" : "bg-surface"}`}
              >
                {i + 1}
              </span>
              <span>
                <span className="block font-bold">{s.title}</span>
                <span className="block text-sm text-muted">{s.body}</span>
              </span>
            </li>
          ))}
        </ol>
      </aside>
    </>
  );
}

function EnterIdStep({ onSubmit }: { onSubmit: (id: string) => void }) {
  const [id, setId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = id.trim().toUpperCase();
    if (v.length < 6)
      return setError("Enter your full NIAT ID, e.g. N25H01A0001.");
    if (!NIAT_ID_REGEX.test(v) && !/^[A-Z0-9]{6,20}$/.test(v))
      return setError("That doesn't look like a NIAT ID.");
    onSubmit(v);
  };
  return (
    <Card className="p-5 sm:p-7">
      <form onSubmit={submit} className="space-y-3" noValidate>
        <h1 className="font-display text-[22px] leading-7">Log in to vote</h1>
        <Label htmlFor="login-niat">Your NIAT ID</Label>
        <Input
          id="login-niat"
          autoFocus
          value={id}
          onChange={(e) => {
            setId(e.target.value.toUpperCase());
            setError(null);
          }}
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          placeholder="e.g. N25H01A0001"
          aria-invalid={!!error}
          aria-describedby={error ? "login-niat-err" : undefined}
          className="font-mono tracking-wider uppercase placeholder:font-sans placeholder:tracking-normal placeholder:normal-case"
        />
        <FieldError>
          {error && <span id="login-niat-err">{error}</span>}
        </FieldError>
        <Button type="submit" size="lg" className="w-full">
          Continue
        </Button>
      </form>
    </Card>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-3 last:border-0">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className={mono ? "font-mono text-sm" : "text-sm font-semibold"}>
        {value}
      </dd>
    </div>
  );
}

function DetailsStep({ d, onConfirm }: { d: Details; onConfirm: () => void }) {
  if (d.status === "pending") {
    return (
      <Card className="space-y-3 p-5 sm:p-7">
        <p className="text-4xl" aria-hidden>
          ⏳
        </p>
        <h1 className="font-display text-[22px] leading-7 font-semibold">
          Your request is with the admin
        </h1>
        <p className="text-muted">
          You&apos;ll get an email when it&apos;s fixed. Login is paused until
          then.
        </p>
        <Link
          href="/login"
          className="inline-block text-sm font-semibold underline underline-offset-2"
        >
          Use a different NIAT ID
        </Link>
      </Card>
    );
  }
  return (
    <Card className="p-5 sm:p-7">
      <h1 className="font-display text-[28px] leading-[34px] font-bold">
        Is this you?
      </h1>
      <dl className="mt-4">
        <Row label="Name" value={d.name} />
        <Row label="NIAT ID" value={d.niatId} mono />
        <Row label="Batch" value={d.batch} />
        <Row label="Email" value={d.maskedEmail} mono />
        <Row label="Phone" value={d.maskedPhone} mono />
        {d.maskedAdmission && <Row label="Hall ticket no." value={d.maskedAdmission} mono />}
      </dl>
      <Button size="lg" className="mt-5 w-full" onClick={onConfirm}>
        Yes, that&apos;s me
      </Button>
      <Link
        href={`/login/request?id=${encodeURIComponent(d.niatId)}`}
        className="mt-3 flex h-11 items-center justify-center text-sm font-semibold text-primary"
      >
        Something&apos;s wrong
      </Link>
    </Card>
  );
}

function VerifyStep({ d, onBack }: { d: Details; onBack: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"google" | "link" | "dev" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [linkSent, setLinkSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [devEmail, setDevEmail] = useState("");
  const [devPass, setDevPass] = useState("password123");

  useEffect(() => {
    sessionStorage.setItem(NIAT_KEY, d.niatId);
  }, [d.niatId]);
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const done = async () => {
    const r = await finishLogin(d.niatId);
    if (r.ok) router.replace(r.to);
    else setError(r.message);
  };

  const google = async () => {
    setBusy("google");
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      // Full-page redirect to Google; /auth/callback finishes the login (NIAT_KEY is saved above).
      await signInWithPopup(backend().auth, provider);
    } catch {
      setError("Google sign-in isn't available right now. Use the email link instead.");
      setBusy(null);
    }
  };

  const sendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = Email.safeParse(email);
    if (!parsed.success) return setError("Enter a valid email address.");
    setBusy("link");
    setError(null);
    try {
      // checkStudentEmail compares server-side and answers only { match }.
      const json = await call<
        { niatId: string; email: string },
        { match: boolean }
      >("checkStudentEmail", { niatId: d.niatId, email: parsed.data });
      if (!json.match)
        return setError(
          `That isn't the email registered for ${d.niatId} (${d.maskedEmail}). Check for typos or request a correction.`,
        );
      // The link goes ONLY to the sheet's email — proven by the match above (D-01).
      // The server re-checks the match, then emails a one-time Supabase sign-in link.
      await call("sendLoginLink", { email: parsed.data, niatId: d.niatId });
      localStorage.setItem(EMAIL_LINK_KEY, parsed.data);
      setLinkSent(true);
      setCooldown(60);
    } catch (e) {
      setError(
        errorMessage(e, "Couldn't send the link. Try again in a moment."),
      );
    } finally {
      setBusy(null);
    }
  };

  const devSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("dev");
    setError(null);
    try {
      await signInWithEmailAndPassword(
        backend().auth,
        devEmail.trim(),
        devPass,
      );
      await done();
    } catch {
      setError(
        "Test sign-in failed. Check the email and password.",
      );
    } finally {
      setBusy(null);
    }
  };

  if (linkSent) {
    return (
      <Card className="space-y-3 p-5 sm:p-7 text-center">
        <MailCheck className="mx-auto size-12 text-primary" />
        <h1 className="font-display text-[22px] leading-7 font-semibold">
          Check {d.maskedEmail}
        </h1>
        <p className="text-muted">
          Tap the link in the email to sign in. It expires in 1 hour.
        </p>
        <Button
          variant="ghost"
          disabled={cooldown > 0}
          onClick={() => setLinkSent(false)}
        >
          {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend link"}
        </Button>
      </Card>
    );
  }

  return (
    <Card className="p-5 sm:p-7">
      <button
        onClick={onBack}
        className="-mt-1 mb-2 inline-flex h-11 items-center gap-1 text-sm text-muted"
      >
        <ArrowLeft className="size-4" /> Back
      </button>
      <h1 className="font-display text-[22px] leading-7 font-semibold">
        Verify it&apos;s you, {d.name.split(" ")[0]}
      </h1>
      <p className="mt-1 text-sm text-muted">
        Sign in with your registered email.
      </p>

      <Button
        variant="google"
        size="lg"
        className="mt-5 w-full"
        onClick={google}
        loading={busy === "google"}
        disabled={!!busy}
      >
        <GoogleG /> Continue with Google
      </Button>
      <p className="mt-1.5 text-center text-xs text-muted">
        Use {d.maskedEmail}
      </p>

      <div className="my-5 flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-border" /> or{" "}
        <span className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={sendLink} noValidate>
        <Label htmlFor="email">Type your full registered email</Label>
        <Input
          id="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={d.maskedEmail}
        />
        <Button
          type="submit"
          variant="secondary"
          size="lg"
          className="mt-3 w-full"
          loading={busy === "link"}
          disabled={!!busy}
        >
          <Mail className="size-5" /> Email me a sign-in link
        </Button>
      </form>

      <FieldError>{error}</FieldError>
      {error && (
        <Link
          href={`/login/request?id=${encodeURIComponent(d.niatId)}`}
          className="mt-2 inline-block text-sm font-semibold text-primary"
        >
          Request a correction
        </Link>
      )}

      {DEV && (
        <details className="mt-6 rounded-md border border-dashed border-border p-3">
          <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-muted">
            <Lock className="size-4" /> Emulator test sign-in
          </summary>
          <form onSubmit={devSignIn} className="mt-3 space-y-2">
            <Input
              aria-label="Test email"
              placeholder="voter@niat.test"
              value={devEmail}
              onChange={(e) => setDevEmail(e.target.value)}
            />
            <Input
              aria-label="Test password"
              type="password"
              value={devPass}
              onChange={(e) => setDevPass(e.target.value)}
            />
            <Button
              type="submit"
              variant="outline"
              className="w-full"
              loading={busy === "dev"}
              disabled={!!busy}
            >
              Sign in (emulator only)
            </Button>
          </form>
        </details>
      )}
    </Card>
  );
}

export function GoogleG() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden>
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
      />
    </svg>
  );
}
