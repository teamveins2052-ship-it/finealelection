"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, FieldError } from "@/components/ui/primitives";
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
      setError(/expired|invalid/i.test(failure) ? "This link is invalid or expired. Go back and request a new one." : "Sign-in didn't complete. Go back and try again.");
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
    const timeout = setTimeout(() => !done && setError("This isn't a valid sign-in link. Go back and request a new one."), 8000);
    return () => {
      data.subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [router]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md items-center px-4">
      <Card className="w-full space-y-4 p-5">
        {!error && (
          <p className="flex items-center gap-2 text-muted">
            <Loader2 className="size-5 animate-spin" /> Signing you in…
          </p>
        )}
        <FieldError>{error}</FieldError>
        {error && (
          <Button variant="secondary" onClick={() => router.replace("/login")}>
            Back to login
          </Button>
        )}
      </Card>
    </main>
  );
}
