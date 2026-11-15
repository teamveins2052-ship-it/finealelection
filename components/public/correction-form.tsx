"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Hourglass } from "lucide-react";
import { Logo } from "@/components/shared/logo";
import { Turnstile } from "@/components/shared/turnstile";
import { Button } from "@/components/ui/button";
import { Card, FieldError, Input, Label, Textarea } from "@/components/ui/primitives";
import { call, errorMessage } from "@/lib/client-data";
import { CorrectionRequestInput } from "@/lib/schema";
import { fmtIST } from "@/lib/election";

const FIELDS = [
  { key: "name", label: "Name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "admissionNo", label: "Admission no." },
] as const;
type FieldKey = (typeof FIELDS)[number]["key"];

/** A6 / DESIGN §6.4: correction request → account pending → login blocked until resolved. */
export function CorrectionForm() {
  const niatId = (useSearchParams().get("id") ?? "").toUpperCase();
  const [fields, setFields] = useState<FieldKey[]>([]);
  const [values, setValues] = useState<Partial<Record<FieldKey, string>>>({});
  const [contactEmail, setContactEmail] = useState("");
  const [note, setNote] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ requestId: string; at: number } | null>(null);

  const toggle = (k: FieldKey) => setFields((f) => (f.includes(k) ? f.filter((x) => x !== k) : [...f, k]));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const requested = Object.fromEntries(fields.map((f) => [f, values[f] ?? ""]));
    const parsed = CorrectionRequestInput.safeParse({ niatId, fields, requested, note, contactEmail, turnstileToken: token ?? "" });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return setError(
        fields.length === 0
          ? "Pick at least one detail that's wrong."
          : issue?.path[0] === "contactEmail"
            ? "Enter an email we can reach you at."
            : issue?.message ?? "Check the form and try again.",
      );
    }
    setBusy(true);
    setError(null);
    try {
      const r = await call<typeof parsed.data, { requestId: string }>("requestCorrection", parsed.data);
      setDone({ requestId: r.requestId, at: Date.now() });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md items-center px-4">
        <Card className="w-full space-y-3 p-5">
          <Hourglass className="size-10 text-warning" />
          <h1 className="font-display text-[22px] leading-7 font-semibold">Your request is with the admin</h1>
          <p className="text-muted">You&apos;ll get an email when it&apos;s fixed. Login is paused until then.</p>
          <p className="text-sm text-muted">
            Request <span className="font-mono">{done.requestId.slice(0, 8)}</span> · sent {fmtIST(done.at)}
          </p>
          <Link href="/" className="inline-flex h-11 items-center font-semibold text-primary">
            Back to start
          </Link>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-dvh w-full max-w-md px-4 pt-2 pb-8">
      <header className="flex h-14 items-center">
        <Link href={`/login?id=${niatId}`} aria-label="Back" className="-ml-2 grid size-11 place-items-center rounded-md hover:bg-surface-2">
          <ArrowLeft className="size-5" />
        </Link>
        <Logo />
      </header>
      <Card className="mt-4 p-5">
        <h1 className="font-display text-[22px] leading-7 font-semibold">Request a correction</h1>
        <p className="mt-1 text-sm text-muted">
          For <span className="font-mono">{niatId || "—"}</span>. While your request is open you can&apos;t sign in.
        </p>
        <form onSubmit={submit} className="mt-5 space-y-5" noValidate>
          <fieldset>
            <legend className="mb-2 text-xs font-medium tracking-wide text-muted">What&apos;s wrong?</legend>
            <div className="grid grid-cols-2 gap-2">
              {FIELDS.map((f) => (
                <label key={f.key} className="flex h-11 cursor-pointer items-center gap-2 rounded-sm border border-border bg-surface-2 px-3 text-sm has-checked:border-primary">
                  <input type="checkbox" checked={fields.includes(f.key)} onChange={() => toggle(f.key)} className="size-4 accent-[var(--primary)]" />
                  {f.label}
                </label>
              ))}
            </div>
          </fieldset>
          {fields.map((f) => (
            <div key={f}>
              <Label htmlFor={`v-${f}`}>Correct {FIELDS.find((x) => x.key === f)!.label.toLowerCase()}</Label>
              <Input id={`v-${f}`} value={values[f] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [f]: e.target.value }))} />
            </div>
          ))}
          <div>
            <Label htmlFor="contact">Email we can reach you at</Label>
            <Input id="contact" type="email" inputMode="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="note">Note (optional)</Label>
            <Textarea id="note" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <Turnstile onToken={setToken} />
          <FieldError>{error}</FieldError>
          <Button type="submit" size="lg" className="w-full" loading={busy}>
            Send request
          </Button>
        </form>
      </Card>
    </main>
  );
}
