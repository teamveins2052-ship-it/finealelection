"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, PartyPopper, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/shared/logo";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { Banners, CountdownChip, OfflineBar } from "@/components/shared/status";
import { Button } from "@/components/ui/button";
import { FieldError, Input, LiveDot, Skeleton, VoteBar } from "@/components/ui/primitives";
import { useElection } from "@/hooks/use-election";
import { useWall } from "@/hooks/use-realtime";
import { useSession } from "@/hooks/use-session";
import { NIAT_ID_REGEX } from "@/lib/schema";
import { IntroLoader, ReplayIntroLink } from "@/components/public/intro-loader";
import { EyeLetter } from "@/components/public/eye-letter";
import { FoldText } from "@/components/ui/fold-text";

// Canvas crowd is decorative: load it after the page is interactive, never on the server.
const CrowdScene = dynamic(() => import("@/components/public/crowd-scene").then((m) => m.CrowdScene), { ssr: false });
import { fmtIST } from "@/lib/election";

// Sized so both sticker buttons sit side by side even on a 360 px phone.
const HERO_BTN = "px-4 text-xs min-[380px]:px-6 min-[380px]:text-sm";

export function Landing() {
  const router = useRouter();
  const session = useSession();
  const election = useElection();
  const wall = useWall();
  const [id, setId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [howOpen, setHowOpen] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = id.trim().toUpperCase();
    if (v.length < 6) return setError("Enter your full NIAT ID, e.g. N25H01A0693.");
    if (!NIAT_ID_REGEX.test(v) && !/^[A-Z0-9]{6,20}$/.test(v)) return setError("That doesn't look like a NIAT ID.");
    router.push(`/login?id=${encodeURIComponent(v)}`);
  };

  if (election.status === "ready" && election.phase === "concluded") {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <PartyPopper className="size-12 text-primary" />
        <h1 className="font-display text-[28px] leading-[34px] font-bold">Election concluded. Thank you!</h1>
        {wall.data && (
          <p className="text-muted">
            {wall.data.votersCount.toLocaleString("en-IN")} students voted · {wall.data.turnoutPct}% turnout
          </p>
        )}
      </main>
    );
  }

  const signedIn = session.status === "ready" && (session.student || session.admin);

  return (
    <>
      <IntroLoader />
      <OfflineBar />
      <CrowdScene />
      <main className="relative z-10 mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pt-2 pb-6 sm:max-w-2xl sm:px-6 lg:max-w-6xl lg:px-8">
        <header className="flex h-14 items-center justify-between lg:h-20">
          <Logo />
          <ThemeToggle />
        </header>
        <Banners className="mx-auto mt-2 w-full max-w-2xl" />

        {/* Top padding leaves room for the voting machine that looms in from the top edge. */}
        <section className="flex flex-1 flex-col justify-center gap-6 pt-[14dvh] pb-8 sm:pt-[20dvh] lg:pt-[6dvh]">
          <div className="space-y-4 text-center">
            {/* Poster-style stacked headline in the chunky display face. */}
            <h1 className="font-display text-[44px] leading-[0.92] uppercase min-[380px]:text-[56px] sm:text-[84px] lg:text-[120px]">
              <span className="sr-only">Your campus. Your vote.</span>
              <span aria-hidden>
                Your
                <br />
                campus.
                <br />
                Y<EyeLetter />ur v<EyeLetter />te.
              </span>
            </h1>
            <RotatingTagline />
          </div>

          {signedIn ? (
            <div className="flex justify-center gap-3 sm:gap-4">
              <Button className={HERO_BTN} onClick={() => router.push(session.student ? "/dashboard" : "/admin")}>
                {session.student ? "Dashboard" : "Admin panel"} <ArrowRight className="size-5" />
              </Button>
              <Button type="button" variant="secondary" className={HERO_BTN} aria-expanded={howOpen} aria-controls="how-it-works" onClick={() => setHowOpen((o) => !o)}>
                How it works
              </Button>
            </div>
          ) : (
            <form onSubmit={submit} className="mx-auto w-full max-w-sm space-y-3" noValidate>
              <label htmlFor="niatId" className="sr-only">
                Enter your NIAT ID
              </label>
              <Input
                id="niatId"
                value={id}
                onChange={(e) => {
                  setId(e.target.value.toUpperCase());
                  setError(null);
                }}
                inputMode="text"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                placeholder="Your NIAT ID, e.g. N25H01A0693"
                aria-invalid={!!error}
                aria-describedby={error ? "niat-err" : undefined}
                className="text-center font-mono tracking-wider uppercase placeholder:font-sans placeholder:tracking-normal placeholder:normal-case"
              />
              <FieldError>{error && <span id="niat-err">{error}</span>}</FieldError>
              {/* Two sticker buttons side by side (fit even at 360 px). */}
              <div className="flex justify-center gap-3 pt-1 sm:gap-4">
                <Button type="submit" className={HERO_BTN}>
                  Continue <ArrowRight className="size-5" />
                </Button>
                <Button type="button" variant="secondary" className={HERO_BTN} aria-expanded={howOpen} aria-controls="how-it-works" onClick={() => setHowOpen((o) => !o)}>
                  How it works
                </Button>
              </div>
            </form>
          )}

          <HowItWorks open={howOpen} />

          <div className="space-y-3 pt-2 text-center">
            <LiveWall wall={wall} phase={election.status === "ready" ? election.phase : null} />
            <div className="flex justify-center">
              <CountdownChip />
            </div>
          </div>

          {election.status === "ready" && election.phase === "results" && (
            <Link href="/results" className="paper-halo text-center font-semibold text-primary">
              Results are out →
            </Link>
          )}
        </section>

        <footer className="paper-halo mx-auto max-w-xl space-y-3 text-center text-xs leading-5 text-muted">
          <p className="flex items-start justify-center gap-1.5">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" />
            <span>
              Votes are anonymous to students and nominees. The election committee&apos;s voter-admins can see individual
              votes for auditing, and every such view is logged. Your data is deleted after the election.
            </span>
          </p>
          <p>
            <Link href="/admin" className="underline underline-offset-2">
              Election committee sign-in
            </Link>
            <span aria-hidden> · </span>
            <ReplayIntroLink />
          </p>
        </footer>
      </main>
    </>
  );
}

const TAGLINES = [
  "Your vote. Your voice. Use it.",
  "One vote can change your campus. Make yours count.",
  "You have the right to choose. Use your vote for a better campus.",
  "Your voice matters. Vote for the change you want to see.",
  "Don't just watch the change. Vote for it.",
];

/** Cycles the taglines in order every 5 s, in the same spot (fixed height → no layout jump); each folds open. */
function RotatingTagline() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % TAGLINES.length), 5000);
    return () => clearInterval(t);
  }, []);
  return (
    // Screen readers get one stable sentence instead of a line that changes every 5 s.
    <div className="paper-halo relative mx-auto flex min-h-[3.25rem] max-w-xs items-center justify-center text-base text-muted sm:max-w-xl sm:min-h-[2rem] lg:text-lg">
      <span className="sr-only">{TAGLINES[0]}</span>
      {/* Keyed so each new quote mounts fresh and folds open letter by letter (React Bits FoldText).
          Fast stagger so even the longest quote is fully open well inside the 5 s slot. */}
      <p key={i} aria-hidden>
        <FoldText
          text={TAGLINES[i]}
          foldStyle="paper"
          splitBy="char"
          hinge="top"
          trigger="mount"
          foldAngle={92}
          duration={0.45}
          stagger={0.012}
          ease="power3.out"
          creaseShading={0.55}
          className="!leading-normal !tracking-normal"
        />
      </p>
    </div>
  );
}

const STEPS = [
  { n: "1", title: "Enter your NIAT ID", body: "We show your masked details so you know it's you." },
  { n: "2", title: "Sign in", body: "Use the Google account or email on the official sheet, then your 2-step code." },
  { n: "3", title: "Vote once per club", body: "Pick one nominee in each club. Votes are final and counted live." },
];

function HowItWorks({ open }: { open: boolean }) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.ol
          id="how-it-works"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="mx-auto grid w-full max-w-3xl gap-3 sm:grid-cols-3"
        >
          {STEPS.map((s) => (
            <li key={s.n} className="rounded-2xl border-2 border-ink bg-surface p-4 shadow-ink">
              <span className="font-display text-2xl">{s.n}</span>
              <p className="mt-1 font-bold">{s.title}</p>
              <p className="mt-1 text-sm text-muted">{s.body}</p>
            </li>
          ))}
        </motion.ol>
      )}
    </AnimatePresence>
  );
}

function LiveWall({ wall, phase }: { wall: ReturnType<typeof useWall>; phase: string | null }) {
  const election = useElection();
  const recent = useMemo(
    () => Object.values(wall.data?.recent ?? {}).sort((a, b) => b.at - a.at),
    [wall.data],
  );
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => x + 1), 3000);
    return () => clearInterval(t);
  }, []);

  if (phase === "setup" || phase === "campaign") {
    return election.status === "ready" ? (
      <p className="text-muted">Voting opens {fmtIST(election.settings.opensAt)} IST</p>
    ) : null;
  }
  if (wall.loading) return <Skeleton className="mx-auto h-[88px] w-64" />;
  if (!wall.data) return <p className="text-muted">Live counts appear once voting starts.</p>;

  const tick = recent.length ? recent[i % recent.length] : null;
  return (
    <div className="paper-halo mx-auto w-full max-w-xs space-y-2">
      <p className="flex items-center justify-center gap-2">
        <LiveDot />
        <span className="font-display text-2xl font-bold tabular-nums" aria-live="off">
          {wall.data.totalVotes.toLocaleString("en-IN")}
        </span>
        <span className="text-muted">votes cast</span>
      </p>
      <div className="h-5 overflow-hidden text-sm text-muted">
        <AnimatePresence mode="wait" initial={false}>
          {tick && (
            <motion.p key={`${tick.at}-${i}`} initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -12, opacity: 0 }}>
              Someone just voted in {tick.club}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
      <VoteBar value={wall.data.turnoutPct} label="Turnout" />
      <p className="text-xs text-muted tabular-nums">{wall.data.turnoutPct}% turnout</p>
    </div>
  );
}
