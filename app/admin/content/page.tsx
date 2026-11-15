"use client";

import { useEffect, useState } from "react";
import { collection, doc, limit, onSnapshot, orderBy, query, updateDoc } from "firebase/firestore";
import { toast } from "sonner";
import { Flag } from "lucide-react";
import { PageTitle } from "@/components/admin/shell";
import { useAdminData } from "@/components/admin/data";
import { Button } from "@/components/ui/button";
import { Card, Chip, EmptyState, Skeleton } from "@/components/ui/primitives";
import { useSession } from "@/hooks/use-session";
import { firebase } from "@/lib/firebase/client";
import { fmtIST } from "@/lib/election";
import { conv, type WithId } from "@/lib/schema/converters";
import type { Post, Question } from "@/lib/schema";
import { cn } from "@/lib/utils";

/** D10: hide questions (P-QNA-03), soft-delete posts (P-PST-03). Authors stay hidden here. */
export default function ContentPage() {
  const { nominees } = useAdminData();
  const session = useSession();
  const [tab, setTab] = useState<"questions" | "posts">("questions");
  const [questions, setQuestions] = useState<WithId<Question>[] | null>(null);
  const [posts, setPosts] = useState<WithId<Post>[] | null>(null);

  useEffect(() => {
    const { db } = firebase();
    const u1 = onSnapshot(query(collection(db, "questions").withConverter(conv.question), orderBy("createdAt", "desc"), limit(200)), (s) => setQuestions(s.docs.map((d) => d.data())), () => setQuestions([]));
    const u2 = onSnapshot(query(collection(db, "posts").withConverter(conv.post), orderBy("createdAt", "desc"), limit(200)), (s) => setPosts(s.docs.map((d) => d.data())), () => setPosts([]));
    return () => { u1(); u2(); };
  }, []);

  const name = (id: string) => nominees?.find((n) => n._id === id)?.name ?? id;
  const email = session.status === "ready" ? session.email : "";

  return (
    <>
      <PageTitle title="Content moderation" />
      <div className="mb-4 flex gap-1">
        {(["questions", "posts"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cn("h-10 rounded-md px-4 text-sm font-semibold capitalize", tab === t ? "bg-primary/10 text-primary" : "text-muted hover:bg-surface-2")}>{t}</button>
        ))}
      </div>
      {tab === "questions" && (questions === null ? <Skeleton className="h-60" /> : questions.length === 0 ? <EmptyState icon={Flag} title="No questions yet." /> : (
        <div className="space-y-2">
          {questions.map((q) => (
            <Card key={q._id} className={cn("flex items-start gap-3 p-3", q.hidden && "opacity-60")}>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted">To {name(q.nomineeId)} · {q.createdAt ? fmtIST(q.createdAt.toMillis()) : ""}</p>
                <p className="font-semibold">{q.text}</p>
                {q.answer && <p className="text-sm text-muted">↳ {q.answer}</p>}
              </div>
              {q.hidden && <Chip>hidden</Chip>}
              <Button size="sm" variant={q.hidden ? "outline" : "destructive"} onClick={() => updateDoc(doc(firebase().db, "questions", q._id), { hidden: !q.hidden }).then(() => toast.success(q.hidden ? "Restored" : "Hidden")).catch(() => toast.error("Couldn't update"))}>
                {q.hidden ? "Unhide" : "Hide"}
              </Button>
            </Card>
          ))}
        </div>
      ))}
      {tab === "posts" && (posts === null ? <Skeleton className="h-60" /> : posts.length === 0 ? <EmptyState icon={Flag} title="No posts yet." /> : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {posts.map((p) => (
            <Card key={p._id} className={cn("overflow-hidden", p.deleted && "opacity-50")}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.type === "video" ? (p.posterUrl ?? "") : p.mediaUrl} alt="" loading="lazy" className="aspect-square w-full bg-surface-2 object-cover" />
              <div className="space-y-2 p-2">
                <p className="truncate text-xs text-muted">{name(p.nomineeId)} · {p.type}</p>
                {p.caption && <p className="line-clamp-2 text-xs">{p.caption}</p>}
                {p.deleted ? <Chip>deleted</Chip> : (
                  <Button size="sm" variant="destructive" className="w-full" onClick={() => updateDoc(doc(firebase().db, "posts", p._id), { deleted: true, deletedBy: email }).then(() => toast.success("Post removed")).catch(() => toast.error("Couldn't remove"))}>Delete</Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      ))}
    </>
  );
}
