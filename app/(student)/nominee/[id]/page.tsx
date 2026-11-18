"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { collection, deleteDoc, doc, getDoc, getDocs, orderBy, query, serverTimestamp, setDoc, where } from "@/lib/db/firestore";
import { toast } from "sonner";
import { ArrowLeft, BadgeCheck, Check, Flame, HandHeart, ImageOff, Lock, MessageCircleQuestion, Plus, Users, Vote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, ErrorState, LiveDot, Skeleton, Textarea } from "@/components/ui/primitives";
import { VoteSheet } from "@/components/vote/vote-sheet";
import { AnimatedNumber } from "@/components/vote/animated-number";
import { useAsync } from "@/hooks/use-async";
import { useElection } from "@/hooks/use-election";
import { useVotedPositions } from "@/hooks/use-my-votes";
import { useTallies } from "@/hooks/use-realtime";
import { useSession } from "@/hooks/use-session";
import { call, errorMessage, getNominee, getPositions, invalidate } from "@/lib/client-data";
import { backend } from "@/lib/backend/client";
import { canVote, pct } from "@/lib/election";
import { AskQuestionInput, ids } from "@/lib/schema";
import { conv } from "@/lib/schema/converters";
import { cn } from "@/lib/utils";

const TABS = ["Bio", "If I win", "Posts", "Q&A"] as const;

/** DESIGN §6.8: nominee profile with sticky Vote button. */
export default function NomineePage() {
  const { id } = useParams<{ id: string }>();
  const session = useSession();
  const election = useElection();
  const tallies = useTallies();
  const data = useAsync(async () => {
    const [nominee, positions] = await Promise.all([getNominee(id), getPositions()]);
    return { nominee, position: positions.find((p) => p._id === nominee?.positionId) ?? null };
  }, [id]);
  const [tab, setTab] = useState<(typeof TABS)[number]>("Bio");
  const [sheet, setSheet] = useState(false);
  const voted = useVotedPositions();

  if (data.status === "loading") {
    return (
      <div className="flex flex-col items-center gap-3 pt-4">
        <Skeleton className="aspect-[3/4.3] w-full max-w-sm rounded-[28px]" />
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-56" />
        <Skeleton className="mt-4 h-40 w-full" />
      </div>
    );
  }
  if (data.status === "error") return <ErrorState onRetry={data.retry} />;
  const { nominee, position } = data.data;
  if (!nominee || !position || !nominee.active) return <EmptyState icon={Users} title="This nominee isn't on the ballot." />;
  if (session.status !== "ready" || !session.student) return null;

  const student = session.student;
  const tally = tallies.data?.[position._id];
  const votes = tally?.counts[nominee._id] ?? 0;
  const already = voted.has(position._id);
  const settings = election.status === "ready" ? election.settings : null;
  const isSelf = nominee.niatId === student.niatId;
  const selfBlocked = isSelf && settings?.nomineesCanSelfVote === false;
  const open = settings ? canVote(settings) : false;

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-28 md:pb-12">
      {/* Top Bar: Back Link & Club Badge */}
      <div className="flex items-center justify-between">
        <Link
          href={`/vote/${position._id}`}
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-surface-2/80 px-3.5 text-xs font-bold text-ink transition hover:bg-border/60"
        >
          <ArrowLeft className="size-3.5" /> Back to {position.name}
        </Link>
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold"
          style={{ background: `${position.color}18`, color: position.color }}
        >
          {position.club}
        </span>
      </div>

      {/* Responsive Layout: 1-col on mobile, balanced 2-col on tablet & desktop */}
      <div className="grid gap-6 md:grid-cols-[340px_1fr] lg:grid-cols-[360px_1fr] lg:gap-8 items-start">
        {/* Left Column: Photo Card + Desktop Action Box */}
        <div className="space-y-4 md:sticky md:top-24">
          <section className="relative mx-auto aspect-[3/4.2] w-full max-w-sm overflow-hidden rounded-[28px] border-[5px] border-surface bg-ink shadow-card">
            <ProfilePhoto src={nominee.photoUrl} name={nominee.name} color={position.color} />
            <div aria-hidden className="absolute inset-x-0 bottom-0 h-[58%] backdrop-blur-md [mask-image:linear-gradient(to_top,black_40%,transparent)]" />
            <div aria-hidden className="absolute inset-x-0 bottom-0 h-[62%] bg-gradient-to-t from-black/85 via-black/45 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 space-y-2.5 p-5 text-white">
              <h1 className="flex items-center gap-1.5 text-[22px] leading-7 font-bold">
                <span className="truncate">{nominee.name}</span>
                <BadgeCheck className="size-5 shrink-0 fill-white text-ink" aria-label="Official nominee" />
              </h1>
              <p className="line-clamp-2 text-xs leading-relaxed text-white/80">
                {nominee.bio?.trim() || `Batch ${nominee.batch} · ${position.name}`}
              </p>
              <p className="flex items-center gap-2 text-xs font-semibold text-white/85">
                <LiveDot />
                <span className="tabular-nums">
                  <AnimatedNumber value={votes} /> votes · {pct(votes, tally?.total ?? 0)}%
                </span>
                <span className="text-white/50">·</span>
                <span className="truncate">{position.club}</span>
              </p>
              <div className="flex items-center gap-2 pt-1">
                <Reactions nomineeId={nominee._id} niatId={student.niatId} initial={nominee.reactionCounts} />
                {open && !already && !selfBlocked && (
                  <button
                    onClick={() => setSheet(true)}
                    className="ml-auto inline-flex h-10 items-center gap-1.5 rounded-full bg-white px-4 text-xs font-bold text-ink shadow-sm transition-transform active:scale-95"
                  >
                    Vote <Plus className="size-3.5" />
                  </button>
                )}
                {already && (
                  <span className="ml-auto inline-flex h-10 items-center gap-1.5 rounded-full bg-white/20 px-3.5 text-xs font-semibold backdrop-blur">
                    <Check className="size-3.5" /> Voted
                  </span>
                )}
              </div>
            </div>
          </section>

          {/* Desktop/Tablet Dedicated CTA */}
          <div className="hidden md:block rounded-2xl border border-border bg-surface p-4 shadow-sm">
            {already ? (
              <div className="flex items-center justify-center gap-2 py-2 text-sm font-bold text-success">
                <Check className="size-4.5" /> You voted in this club
              </div>
            ) : !open ? (
              <p className="py-2 text-center text-xs font-medium text-muted">
                {settings?.paused ? "Voting is paused." : election.status === "ready" && (election.phase === "setup" || election.phase === "campaign") ? "Voting hasn't opened yet." : "Voting is closed."}
              </p>
            ) : selfBlocked ? (
              <p className="py-2 text-center text-xs font-medium text-muted">Nominees can&apos;t vote in their own race.</p>
            ) : (
              <Button size="lg" className="w-full h-12 rounded-xl text-sm font-bold shadow-md hover:opacity-95" onClick={() => setSheet(true)}>
                <Vote className="size-4.5" /> Vote for {nominee.name.split(" ")[0]}
              </Button>
            )}
          </div>
        </div>

        {/* Right Column: Segmented Tabs & Content Panel */}
        <div className="space-y-4 min-w-0">
          <div
            role="tablist"
            aria-label="Profile sections"
            className="flex rounded-2xl border border-border bg-surface p-1.5 shadow-xs"
          >
            {TABS.map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={cn(
                  "flex-1 py-2 text-xs sm:text-sm font-bold rounded-xl transition-all",
                  tab === t
                    ? "bg-ink text-bg shadow-xs"
                    : "text-muted hover:text-ink hover:bg-surface-2/60"
                )}
              >
                {t}
              </button>
            ))}
          </div>

          <div
            role="tabpanel"
            className="rounded-2xl border border-border bg-surface p-5 sm:p-7 shadow-sm min-h-[340px]"
          >
            {tab === "Bio" &&
              (nominee.bio ? (
                <p className="leading-relaxed text-sm sm:text-base text-ink whitespace-pre-line">{nominee.bio}</p>
              ) : (
                <div className="flex flex-col items-center justify-center py-14 text-center">
                  <div className="grid size-12 place-items-center rounded-full bg-surface-2 text-muted mb-3">
                    <Users className="size-6" />
                  </div>
                  <p className="font-bold text-ink text-sm">No bio published yet</p>
                  <p className="text-xs text-muted mt-1 max-w-xs">
                    {nominee.name} hasn&apos;t added their biography yet. Check out their promises or ask a question in Q&amp;A.
                  </p>
                </div>
              ))}

            {tab === "If I win" &&
              (nominee.promises.length ? (
                <ol className="space-y-3">
                  {nominee.promises.map((p, i) => (
                    <li key={i} className="flex items-start gap-3 p-3.5 rounded-xl border border-border/60 bg-surface-2/30">
                      <span
                        className="grid size-7 shrink-0 place-items-center rounded-lg font-display text-xs font-bold text-white shadow-xs"
                        style={{ background: position.color }}
                      >
                        {i + 1}
                      </span>
                      <p className="text-sm font-medium leading-relaxed text-ink pt-0.5">{p}</p>
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="flex flex-col items-center justify-center py-14 text-center">
                  <div className="grid size-12 place-items-center rounded-full bg-surface-2 text-muted mb-3">
                    <Users className="size-6" />
                  </div>
                  <p className="font-bold text-ink text-sm">No promises listed yet</p>
                  <p className="text-xs text-muted mt-1 max-w-xs">
                    Campaign commitments and plans will appear here once published.
                  </p>
                </div>
              ))}

            {tab === "Posts" && <Posts nomineeId={nominee._id} />}
            {tab === "Q&A" && <QandA nomineeId={nominee._id} firstName={nominee.name.split(" ")[0]} isSelf={isSelf} />}
          </div>
        </div>
      </div>

      {/* Mobile-only Sticky Vote Bar (hidden on tablet and desktop screens) */}
      <div className="fixed inset-x-0 bottom-[calc(60px+env(safe-area-inset-bottom))] z-30 border-t border-border bg-surface/95 p-3 backdrop-blur shadow-lg md:hidden">
        <div className="mx-auto max-w-md">
          {already ? (
            <p className="py-2 text-center text-sm font-bold text-success">You&apos;ve already voted in this club.</p>
          ) : !open ? (
            <p className="py-2 text-center text-xs text-muted">
              {settings?.paused ? "Voting is paused." : election.status === "ready" && (election.phase === "setup" || election.phase === "campaign") ? "Voting hasn't opened yet." : "Voting is closed."}
            </p>
          ) : selfBlocked ? (
            <p className="py-2 text-center text-xs text-muted">Nominees can&apos;t vote in their own race.</p>
          ) : (
            <Button size="lg" className="w-full h-11 rounded-xl text-sm font-bold shadow-md" onClick={() => setSheet(true)}>
              <Vote className="size-4.5" /> Vote for {nominee.name.split(" ")[0]}
            </Button>
          )}
        </div>
      </div>

      <VoteSheet open={sheet} onClose={() => setSheet(false)} voterId={student.niatId} firstName={student.name.split(" ")[0]} position={position} nominee={nominee} />
    </div>
  );
}

/** Full-card photo; without one, the initials on a club-colour gradient. */
function ProfilePhoto({ src, name, color }: { src: string | null; name: string; color: string }) {
  const [failed, setFailed] = useState(false);
  const initials = name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  if (src && !failed) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={name} onError={() => setFailed(true)} className="absolute inset-0 size-full object-cover" />;
  }
  return (
    <div className="absolute inset-0 grid place-items-start justify-center pt-[22%]" style={{ background: `linear-gradient(165deg, ${color}, ${color}55 70%)` }}>
      <span aria-hidden className="font-display text-[96px] leading-none font-bold text-white/90 drop-shadow">{initials}</span>
    </div>
  );
}

/** N7: one reaction per student per nominee — public support, not votes. */
function Reactions({ nomineeId, niatId, initial }: { nomineeId: string; niatId: string; initial: { fire: number; clap: number } }) {
  const [mine, setMine] = useState<"fire" | "clap" | null>(null);
  const [counts, setCounts] = useState(initial);
  const ref = doc(backend().db, "reactions", ids.reaction(niatId, nomineeId));

  useEffect(() => {
    // Reading a reaction we never made is denied by rules (P-RCT-01) → treat as none.
    getDoc(ref).then((s) => setMine(s.exists() ? (s.get("type") as "fire" | "clap") : null)).catch(() => setMine(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomineeId, niatId]);

  const react = async (type: "fire" | "clap") => {
    const prev = mine;
    const next = prev === type ? null : type;
    setMine(next);
    setCounts((c) => ({
      fire: c.fire + (next === "fire" ? 1 : 0) - (prev === "fire" ? 1 : 0),
      clap: c.clap + (next === "clap" ? 1 : 0) - (prev === "clap" ? 1 : 0),
    }));
    try {
      if (next) await setDoc(ref, { niatId, nomineeId, type: next, updatedAt: serverTimestamp() });
      else await deleteDoc(ref);
      void call("syncReactions", { nomineeId }).catch(() => undefined); // recount on the server
      invalidate(`nominee:${nomineeId}`);
      invalidate(`nominees:`);
    } catch {
      setMine(prev);
      setCounts(initial);
      toast.error("Couldn't save your reaction.");
    }
  };

  return (
    <div className="flex gap-2">
      {(["fire", "clap"] as const).map((t) => {
        const Icon = t === "fire" ? Flame : HandHeart;
        return (
          <button
            key={t}
            onClick={() => react(t)}
            aria-pressed={mine === t}
            aria-label={t === "fire" ? "Fire reaction" : "Clap reaction"}
            className={cn(
              "inline-flex h-11 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition-transform active:scale-95",
              mine === t ? "bg-highlight text-ink" : "bg-white/15 text-white backdrop-blur",
            )}
          >
            <Icon className="size-4" /> <span className="tabular-nums">{counts[t]}</span>
          </button>
        );
      })}
    </div>
  );
}

function Posts({ nomineeId }: { nomineeId: string }) {
  const posts = useAsync(async () => {
    const snap = await getDocs(
      query(collection(backend().db, "posts").withConverter(conv.post), where("nomineeId", "==", nomineeId), where("deleted", "==", false), orderBy("createdAt", "desc")),
    );
    const now = Date.now();
    return snap.docs.map((d) => d.data()).filter((p) => p.type !== "story" && (!p.expiresAt || p.expiresAt.toMillis() > now));
  }, [nomineeId]);
  const [viewer, setViewer] = useState<string | null>(null);

  if (posts.status === "loading") return <div className="grid grid-cols-3 gap-1">{[0, 1, 2].map((i) => <Skeleton key={i} className="aspect-square" />)}</div>;
  if (posts.status === "error") return <ErrorState onRetry={posts.retry} />;
  if (!posts.data.length) return <EmptyState icon={ImageOff} title="No posts yet." />;
  return (
    <>
      <div className="grid grid-cols-3 gap-1">
        {posts.data.map((p) => (
          <button key={p._id} onClick={() => setViewer(p._id)} className="relative aspect-square overflow-hidden rounded-sm bg-surface-2" aria-label={p.caption || "Open post"}>
            {p.type === "video" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.posterUrl ?? ""} alt="" loading="lazy" className="size-full object-cover" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.mediaUrl} alt="" loading="lazy" className="size-full object-cover" />
            )}
          </button>
        ))}
      </div>
      {viewer && (() => {
        const p = posts.data.find((x) => x._id === viewer)!;
        return (
          <div role="dialog" aria-label="Post" className="fixed inset-0 z-50 flex flex-col bg-black" onClick={() => setViewer(null)}>
            <div className="flex flex-1 items-center justify-center p-2">
              {p.type === "video" ? (
                <video src={p.mediaUrl} poster={p.posterUrl} controls muted playsInline preload="none" className="max-h-full max-w-full" onClick={(e) => e.stopPropagation()} />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.mediaUrl} alt={p.caption} className="max-h-full max-w-full object-contain" />
              )}
            </div>
            {p.caption && <p className="p-4 text-sm text-white">{p.caption}</p>}
            <button className="m-4 h-12 rounded-md bg-white/15 font-semibold text-white">Close</button>
          </div>
        );
      })()}
    </>
  );
}

/** N5: anonymous Q&A — identity lives only in questionAuthors (P-ANO). */
function QandA({ nomineeId, firstName, isSelf }: { nomineeId: string; firstName: string; isSelf: boolean }) {
  const qs = useAsync(async () => {
    const snap = await getDocs(
      query(collection(backend().db, "questions").withConverter(conv.question), where("nomineeId", "==", nomineeId), where("hidden", "==", false), orderBy("createdAt", "desc")),
    );
    const all = snap.docs.map((d) => d.data());
    return [...all.filter((q) => q.answer), ...all.filter((q) => !q.answer)];
  }, [nomineeId]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const ask = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = AskQuestionInput.safeParse({ nomineeId, text });
    if (!parsed.success) return toast.error("Questions need 3–300 characters.");
    setBusy(true);
    try {
      await call("askQuestion", parsed.data);
      setText("");
      toast.success(`Sent anonymously. ${firstName} will see it in their inbox.`);
      if (qs.status === "ready") qs.reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {!isSelf && (
        <form onSubmit={ask} className="space-y-2">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={300} placeholder={`Ask ${firstName} something…`} aria-label="Your question" />
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-1.5 text-xs text-muted">
              <Lock className="size-3.5" /> Your name is never shown to the nominee.
            </p>
            <Button type="submit" size="sm" loading={busy}>
              Ask anonymously
            </Button>
          </div>
        </form>
      )}
      {qs.status === "loading" && <Skeleton className="h-24 w-full" />}
      {qs.status === "error" && <ErrorState onRetry={qs.retry} />}
      {qs.status === "ready" && !qs.data.length && <EmptyState icon={MessageCircleQuestion} title="No questions yet." />}
      {qs.status === "ready" &&
        qs.data.map((q) => (
          <Card key={q._id} className="space-y-2 p-4">
            <p className="font-semibold">{q.text}</p>
            {q.answer ? <p className="text-sm leading-6 text-muted">{q.answer}</p> : <p className="text-xs text-muted italic">Not answered yet</p>}
          </Card>
        ))}
    </div>
  );
}
