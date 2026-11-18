"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowLeft, FileEdit, Loader2, LogIn } from "lucide-react";
import { Logo } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/primitives";
import { supabase } from "@/lib/supabase/client";
import { EMAIL_LINK_KEY, NIAT_KEY, finishLogin } from "@/lib/auth-flow";

/**
 * Landing page after Google sign-in or an email sign-in link. Supabase puts the session in
 * the URL; supabase-js picks it up, then finishLogin checks the account matches the sheet.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let done = false;
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const query = new URLSearchParams(window.location.search);
    const failure = hash.get("error_description") ?? query.get("error_description");
    if (failure) {
      setError(
        /expired|invalid/i.test(failure)
          ? "This link is invalid or expired. Go back and request a new one."
          : "Sign-in didn't complete. Go back and try again.",
      );
      return;
    }
    const finish = async () => {
      if (done) return;
      done = true;
      localStorage.removeItem(EMAIL_LINK_KEY);
      const isAdmin = sessionStorage.getItem("niat.adminLogin") === "1";
      sessionStorage.removeItem("niat.adminLogin");
      const r = await finishLogin(isAdmin ? null : sessionStorage.getItem(NIAT_KEY));
      if (r.ok) router.replace(isAdmin ? "/admin" : r.to);
      else setError(r.message);
    };
    const { data } = supabase().auth.onAuthStateChange((_e, session) => {
      if (session) setTimeout(() => void finish(), 0);
    });
    // Session may already be set (fast parse) — check once, then give the URL parse a few seconds.
    void supabase().auth.getSession().then(({ data: d }) => d.session && finish());
    const timeout = setTimeout(
      () => !done && setError("This isn't a valid sign-in link. Go back and request a new one."),
      8000,
    );
    return () => {
      data.subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [router]);

  return (
    <div className="flex min-h-dvh flex-col bg-bg text-text">
      {/* Top Header */}
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" aria-label="NIAT Elections Home" className="transition-opacity hover:opacity-80">
          <Logo />
        </Link>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 font-sans text-xs font-bold uppercase tracking-wider text-muted hover:text-text sm:text-sm"
        >
          <ArrowLeft className="size-4" /> Home
        </Link>
      </header>

      {/* Main Body */}
      <main className="mx-auto flex flex-1 w-full max-w-lg flex-col items-center justify-center px-4 py-12 text-center sm:px-6">
        <Card className="flex w-full flex-col items-center p-8 sm:p-10 shadow-ink">
          {!error ? (
            /* Loading State */
            <div className="flex flex-col items-center py-6">
              <div className="grid size-16 place-items-center rounded-full border-[2.5px] border-ink bg-highlight/30 text-ink shadow-ink">
                <Loader2 className="size-8 animate-spin" />
              </div>
              <div className="mt-4 inline-flex items-center rounded-full border-2 border-ink bg-surface-2 px-3.5 py-1 font-display text-xs tracking-wider uppercase text-ink">
                Authenticating
              </div>
              <h1 className="mt-4 font-display text-2xl uppercase tracking-tight text-ink sm:text-3xl">
                Signing You In…
              </h1>
              <p className="mt-2 text-sm text-muted">
                Verifying your credentials against the official voter registry.
              </p>
            </div>
          ) : (
            /* Error State (e.g. Account Mismatch) */
            <div className="flex flex-col items-center w-full">
              <div className="grid size-16 place-items-center rounded-full border-[2.5px] border-ink bg-danger/10 text-danger shadow-ink">
                <AlertCircle className="size-8" strokeWidth={2.5} />
              </div>

              <div className="mt-4 inline-flex items-center rounded-full border-2 border-ink bg-danger/15 px-3.5 py-1 font-display text-xs tracking-wider uppercase text-danger">
                Account Mismatch
              </div>

              <h1 className="mt-4 font-display text-2xl uppercase tracking-tight text-ink sm:text-3xl">
                Sign-In Failed
              </h1>

              {/* Error Message Box */}
              <div className="mt-4 w-full rounded-xl border-2 border-ink/15 bg-surface-2 p-4 text-sm font-medium text-text">
                {error}
              </div>

              {/* Action Buttons */}
              <div className="mt-6 flex w-full flex-col gap-3">
                <Button
                  variant="primary"
                  onClick={() => router.replace("/login")}
                  className="w-full"
                >
                  <LogIn className="size-4" /> Back to Login
                </Button>

                <Link href="/login/request" className="w-full">
                  <Button variant="secondary" className="w-full">
                    <FileEdit className="size-4" /> Request a Correction
                  </Button>
                </Link>

                <Link href="/" className="mt-2 text-xs font-bold text-muted hover:text-ink">
                  Return to Homepage
                </Link>
              </div>
            </div>
          )}
        </Card>
      </main>

      {/* Footer */}
      <footer className="py-6 text-center text-xs text-muted">
        &copy; 2026 NIAT Campus Elections Committee &bull; Official Student Voting Portal
      </footer>
    </div>
  );
}
