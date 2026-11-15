"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isSignInWithEmailLink, signInWithEmailLink } from "firebase/auth";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, FieldError, Input, Label } from "@/components/ui/primitives";
import { firebase } from "@/lib/firebase/client";
import { EMAIL_LINK_KEY, NIAT_KEY, finishLogin } from "@/lib/auth-flow";
import { Email } from "@/lib/schema";

/** Email-link completion. Opened on another device → ask for the email again (Firebase requirement). */
export default function AuthCallbackPage() {
  const router = useRouter();
  const [needEmail, setNeedEmail] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const complete = async (address: string) => {
    setBusy(true);
    setError(null);
    try {
      await signInWithEmailLink(firebase().auth, address, window.location.href);
      localStorage.removeItem(EMAIL_LINK_KEY);
      const r = await finishLogin(sessionStorage.getItem(NIAT_KEY));
      if (r.ok) router.replace(r.to);
      else setError(r.message);
    } catch {
      setError("This link is invalid or expired. Go back and request a new one.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!isSignInWithEmailLink(firebase().auth, window.location.href)) {
      setError("This isn't a valid sign-in link.");
      return;
    }
    const stored = localStorage.getItem(EMAIL_LINK_KEY);
    if (stored) complete(stored);
    else setNeedEmail(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md items-center px-4">
      <Card className="w-full space-y-4 p-5">
        {busy && (
          <p className="flex items-center gap-2 text-muted">
            <Loader2 className="size-5 animate-spin" /> Signing you in…
          </p>
        )}
        {needEmail && !busy && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const p = Email.safeParse(email);
              if (p.success) complete(p.data);
              else setError("Enter a valid email address.");
            }}
            className="space-y-3"
          >
            <h1 className="font-display text-[22px] font-semibold">Confirm your email</h1>
            <Label htmlFor="cb-email">You opened the link on a different device. Type your registered email.</Label>
            <Input id="cb-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Button type="submit" className="w-full">
              Sign in
            </Button>
          </form>
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
