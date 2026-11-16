"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { collection, deleteDoc, doc, getDoc, getDocs, orderBy, query, serverTimestamp, setDoc, where } from "@/lib/db/firestore";
import { toast } from "sonner";
import { ArrowLeft, Flame, HandHeart, ImageOff, Lock, MessageCircleQuestion, Users, Vote } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
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
        <Skeleton className="size-24 rounded-full" />
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
    <div className="space-y-5 pb-24">
      <Link href={`/vote/${position._id}`} className="-ml-2 inline-flex h-11 items-center gap-1 px-2 text-sm text-muted">
        <ArrowLeft className="size-4" /> {position.name}
      </Link>

      <div className="lg:grid lg:grid-cols-[340px_1fr] lg:items-start lg:gap-10">
      <section className="flex flex-col items-center gap-2 text-center lg:sticky lg:top-24 lg:rounded-xl lg:border lg:border-border lg:bg-surface lg:p-6 lg:shadow-card">
        <Avatar src={nominee.photoUrl} name={nominee.name} color={position.color} size={96} ring={nominee.hasActiveStory} />
        <h1 className="font-display text-[22px] leading-7 font-semibold">{nominee.name}</h1>
        <p className="text-sm text-muted">
          Batch {nominee.batch} · {position.name}
        </p>
        <p className="flex items-center gap-2 text-sm">
          <LiveDot />
          <span className="font-display font-semibold tabular-nums">
            <AnimatedNumber value={votes} /> votes · {pct(votes, tally?.total ?? 0)}%
          </span>
        </p>
        <Reactions nomineeId={nominee._id} niatId={student.niatId} initial={nominee.reactionCounts} />
      </section>

      <div className="mt-5 space-y-5 lg:mt-0">
      <div role="tablist" aria-label="Profile sections" className="sticky top-14 z-10 -mx-4 flex border-b border-border bg-bg/95 px-4 backdrop-blur sm:-mx-6 sm:px-6 lg:top-16 lg:mx-0 lg:px-0">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn("h-12 flex-1 border-b-2 text-sm font-semibold", tab === t ? "border-primary text-primary" : "border-transparent text-muted")}
          >
            {t}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {tab === "Bio" && (nominee.bio ? <p className="leading-7 whitespace-pre-line">{nominee.bio}</p> : <EmptyState icon={Users} title="No bio yet." />)}
        {tab === "If I win" &&
          (nominee.promises.length ? (
            <ol className="space-y-3">
              {nominee.promises.map((p, i) => (
                <li key={i} className="flex gap-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full font-display font-bold text-primary-fg" style={{ background: position.color }}>
                    {i + 1}
                  </span>
                  <p className="pt-1 text-lg leading-7">{p}</p>
                </li>
              ))}
            </ol>
          ) : (
            <EmptyState icon={Users} title="No promises yet." />
          ))}
        {tab === "Posts" && <Posts nomineeId={nominee._id} />}
        {tab === "Q&A" && <QandA nomineeId={nominee._id} firstName={nominee.name.split(" ")[0]} isSelf={isSelf} />}
      </div>
      </div>
      </div>

      <div className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-30 border-t border-border bg-surface/95 p-3 backdrop-blur lg:bottom-0">
        <div className="mx-auto max-w-md">
          {already ? (
            <p className="py-3 text-center text-sm font-semibold text-success">You&apos;ve already voted in this club.</p>
          ) : !open ? (
            <p className="py-3 text-center text-sm text-muted">
              {settings?.paused ? "Voting is paused." : election.status === "ready" && (election.phase === "setup" || election.phase === "campaign") ? "Voting hasn't opened yet." : "Voting is closed."}
            </p>
          ) : selfBlocked ? (
            <p className="py-3 text-center text-sm text-muted">Nominees can&apos;t vote in their own race.</p>
          ) : (
            <Button size="lg" className="w-full" onClick={() => setSheet(true)}>
              <Vote className="size-5" /> Vote for {nominee.name.split(" ")[0]}
            </Button>
          )}
        </div>
      </div>

      <VoteSheet open={sheet} onClose={() => setSheet(false)} voterId={student.niatId} firstName={student.name.split(" ")[0]} position={position} nominee={nominee} />
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
              "inline-flex h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition-transform active:scale-95",
              mine === t ? "border-2 border-ink bg-highlight text-text shadow-ink" : "border-2 border-ink/20 bg-surface",
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
