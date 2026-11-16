"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { addDoc, collection, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where } from "@/lib/db/firestore";
import { toast } from "sonner";
import { CheckCircle2, Circle, Eye, Flame, HandHeart, ImagePlus, Lock, MessageCircleQuestion, Plus, Trash2, Upload } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, Label, Skeleton, Textarea } from "@/components/ui/primitives";
import { useElection } from "@/hooks/use-election";
import { useSession } from "@/hooks/use-session";
import { backend } from "@/lib/backend/client";
import { invalidate } from "@/lib/client-data";
import { ids, NomineeProfileInput, type Nominee, type Question } from "@/lib/schema";
import { conv, type WithId } from "@/lib/schema/converters";
import { cn } from "@/lib/utils";

/** N2 / DESIGN §6.13: nominee dashboard. Stats never include who voted (D-06). */
export default function StudioPage() {
  const session = useSession();
  const election = useElection();
  const student = session.status === "ready" ? session.student : null;
  const nomineeId = student?.nomineeOf ? ids.nominee(student.nomineeOf, student.niatId) : null;
  const [nominee, setNominee] = useState<WithId<Nominee> | null>(null);
  const [questions, setQuestions] = useState<WithId<Question>[] | null>(null);

  useEffect(() => {
    if (!nomineeId) return;
    const { db } = backend();
    const u1 = onSnapshot(doc(db, "nominees", nomineeId).withConverter(conv.nominee), (s) => setNominee(s.exists() ? s.data() : null));
    const u2 = onSnapshot(
      query(collection(db, "questions").withConverter(conv.question), where("nomineeId", "==", nomineeId), where("hidden", "==", false), orderBy("createdAt", "desc")),
      (s) => setQuestions(s.docs.map((d) => d.data())),
      () => setQuestions([]),
    );
    return () => {
      u1();
      u2();
    };
  }, [nomineeId]);

  if (!student || !nomineeId || !nominee) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-60 w-full" />
      </div>
    );
  }
  const locked = election.status === "ready" && Date.now() >= election.settings.closesAt;
  const unanswered = questions?.filter((q) => !q.answer).length ?? 0;
  const checklist = [
    { label: "Photo", done: !!nominee.photoUrl },
    { label: "Bio", done: nominee.bio.length > 0 },
    { label: "Promises", done: nominee.promises.length > 0 },
    { label: "First post", done: nominee.postCount > 0 },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-display text-[28px] leading-[34px] lg:text-[40px] lg:leading-[44px]">Studio</h1>
        <Link href={`/nominee/${nomineeId}`} className="inline-flex h-11 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-semibold">
          <Eye className="size-4" /> See as voters see it
        </Link>
      </div>
      {locked && (
        <p className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 p-3 text-sm">
          <Lock className="size-4" /> Voting has closed — your profile is now read-only.
        </p>
      )}

      <Card className="p-4">
        <p className="mb-3 text-sm font-semibold">Profile checklist</p>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {checklist.map((c) => (
            <li key={c.label} className={cn("flex items-center gap-2 text-sm", c.done ? "text-success" : "text-muted")}>
              {c.done ? <CheckCircle2 className="size-4" /> : <Circle className="size-4" />} {c.label}
            </li>
          ))}
        </ul>
      </Card>

      <section aria-label="Stats" className="grid grid-cols-4 gap-2">
        {[
          { Icon: Flame, label: "Fire", v: nominee.reactionCounts.fire },
          { Icon: HandHeart, label: "Claps", v: nominee.reactionCounts.clap },
          { Icon: MessageCircleQuestion, label: "Questions", v: questions?.length ?? 0 },
          { Icon: ImagePlus, label: "Posts", v: nominee.postCount },
        ].map(({ Icon, label, v }) => (
          <Card key={label} className="p-3 text-center">
            <Icon className="mx-auto size-4 text-muted" />
            <p className="font-display text-xl font-bold tabular-nums">{v}</p>
            <p className="text-xs text-muted">{label}</p>
          </Card>
        ))}
      </section>

      <div className="grid items-start gap-5 lg:grid-cols-2">
      <div className="space-y-5">
      <ProfileEditor nominee={nominee} niatId={student.niatId} locked={locked} />
      <PostUploader nominee={nominee} niatId={student.niatId} locked={locked} />
      </div>

      <section className="space-y-3 lg:sticky lg:top-24">
        <h2 className="font-display text-lg font-semibold">
          Q&A inbox {unanswered > 0 && <span className="ml-1 rounded-full bg-ink px-2 py-0.5 font-sans text-xs text-bg">{unanswered}</span>}
        </h2>
        <p className="text-xs text-muted">Questions are anonymous — you&apos;ll never see who asked.</p>
        {questions === null && <Skeleton className="h-24 w-full" />}
        {questions?.length === 0 && <EmptyState icon={MessageCircleQuestion} title="No questions yet." />}
        {questions &&
          [...questions.filter((q) => !q.answer), ...questions.filter((q) => q.answer)].map((q) => (
            <AnswerCard key={q._id} q={q} locked={locked} />
          ))}
      </section>
      </div>
    </div>
  );
}

function ProfileEditor({ nominee, niatId, locked }: { nominee: WithId<Nominee>; niatId: string; locked: boolean }) {
  const [bio, setBio] = useState(nominee.bio);
  const [promises, setPromises] = useState<string[]>(nominee.promises.length ? nominee.promises : [""]);
  const [photoUrl, setPhotoUrl] = useState(nominee.photoUrl);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const save = async () => {
    const parsed = NomineeProfileInput.safeParse({ photoUrl: photoUrl ?? null, bio, promises: promises.map((p) => p.trim()).filter(Boolean) });
    // MediaUrl validation only applies to newly uploaded photos; keep an existing URL as-is.
    const data = parsed.success ? parsed.data : null;
    if (!data && !(photoUrl === nominee.photoUrl)) return toast.error(parsed.error?.issues[0]?.message ?? "Check your profile.");
    setBusy(true);
    try {
      await updateDoc(doc(backend().db, "nominees", nominee._id), {
        photoUrl: photoUrl ?? null,
        bio: bio.trim().slice(0, 300),
        promises: promises.map((p) => p.trim()).filter(Boolean).slice(0, 6).map((p) => p.slice(0, 120)),
        updatedAt: serverTimestamp(),
      });
      invalidate(`nominee:${nominee._id}`);
      invalidate(`nominees:${nominee.positionId}`);
      toast.success("Profile saved — voters see it now.");
    } catch {
      toast.error("Couldn't save. Editing closes when voting closes.");
    } finally {
      setBusy(false);
    }
  };

  const upload = async (f: File) => {
    if (!/^image\/(webp|jpeg|png)$/.test(f.type)) return toast.error("Use a JPG, PNG or WebP image.");
    if (f.size > 2 * 1024 * 1024) return toast.error("Images must be 2 MB or less.");
    setUploading(true);
    try {
      setPhotoUrl(await uploadMedia(f, "avatar", niatId));
      toast.success("Photo uploaded — tap Save to publish.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card className="space-y-4 p-4">
      <h2 className="font-display text-lg font-semibold">Your profile</h2>
      <div className="flex items-center gap-4">
        <Avatar src={photoUrl} name={nominee.name} size={72} />
        <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        <Button variant="secondary" size="sm" onClick={() => file.current?.click()} loading={uploading} disabled={locked}>
          <Upload className="size-4" /> Change photo
        </Button>
      </div>
      <div>
        <Label htmlFor="bio">Bio ({bio.length}/300)</Label>
        <Textarea id="bio" maxLength={300} value={bio} onChange={(e) => setBio(e.target.value)} disabled={locked} />
      </div>
      <fieldset className="space-y-2">
        <legend className="mb-1.5 text-xs font-medium tracking-wide text-muted">If I win… (up to 6, 120 chars each)</legend>
        {promises.map((p, i) => (
          <div key={i} className="flex gap-2">
            <input
              aria-label={`Promise ${i + 1}`}
              value={p}
              maxLength={120}
              disabled={locked}
              onChange={(e) => setPromises((xs) => xs.map((x, j) => (j === i ? e.target.value : x)))}
              className="h-11 flex-1 rounded-sm border border-border bg-surface-2 px-3"
            />
            <button aria-label="Remove promise" disabled={locked} onClick={() => setPromises((xs) => xs.filter((_, j) => j !== i))} className="grid size-11 place-items-center rounded-md text-muted hover:bg-surface-2">
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
        {promises.length < 6 && !locked && (
          <Button variant="ghost" size="sm" onClick={() => setPromises((xs) => [...xs, ""])}>
            <Plus className="size-4" /> Add promise
          </Button>
        )}
      </fieldset>
      <Button className="w-full" onClick={save} loading={busy} disabled={locked}>
        Save profile
      </Button>
    </Card>
  );
}

function PostUploader({ nominee, niatId, locked }: { nominee: WithId<Nominee>; niatId: string; locked: boolean }) {
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const post = async (f: File) => {
    if (!/^image\/(webp|jpeg|png)$/.test(f.type)) return toast.error("Photos and posters only here: JPG, PNG or WebP.");
    if (f.size > 2 * 1024 * 1024) return toast.error("Images must be 2 MB or less.");
    setBusy(true);
    try {
      const mediaUrl = await uploadMedia(f, "post", niatId);
      await addDoc(collection(backend().db, "posts"), {
        nomineeId: nominee._id, niatId, type: "photo", mediaUrl, caption: caption.trim().slice(0, 200),
        commentCount: 0, deleted: false, createdAt: serverTimestamp(),
      });
      setCaption("");
      toast.success("Posted.");
    } catch (e) {
      toast.error((e as Error).message || "Couldn't post.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="space-y-3 p-4">
      <h2 className="font-display text-lg font-semibold">New post</h2>
      <Textarea placeholder="Caption (optional, 200 chars)" maxLength={200} value={caption} onChange={(e) => setCaption(e.target.value)} disabled={locked} aria-label="Caption" />
      <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => e.target.files?.[0] && post(e.target.files[0])} />
      <Button variant="secondary" className="w-full" onClick={() => file.current?.click()} loading={busy} disabled={locked}>
        <ImagePlus className="size-4" /> Choose photo & post
      </Button>
      <p className="text-xs text-muted">Images ≤ 2 MB. Uploads need Cloudflare R2 to be configured.</p>
    </Card>
  );
}

function AnswerCard({ q, locked }: { q: WithId<Question>; locked: boolean }) {
  const [text, setText] = useState(q.answer ?? "");
  const [editing, setEditing] = useState(!q.answer);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await updateDoc(doc(backend().db, "questions", q._id), { answer: text.trim().slice(0, 600), answeredAt: serverTimestamp() });
      setEditing(false);
      toast.success("Answer published.");
    } catch {
      toast.error("Couldn't save your answer.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="space-y-2 p-4">
      <p className="font-semibold">{q.text}</p>
      {editing && !locked ? (
        <>
          <Textarea value={text} maxLength={600} onChange={(e) => setText(e.target.value)} aria-label="Your answer" />
          <Button size="sm" onClick={save} loading={busy}>
            Publish answer
          </Button>
        </>
      ) : (
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm leading-6 text-muted">{q.answer}</p>
          {!locked && (
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              Edit
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

async function uploadMedia(f: File, kind: "avatar" | "post", niatId: string): Promise<string> {
  const token = await backend().auth.currentUser?.getIdToken();
  const res = await fetch(`/api/media/upload-url?niatId=${encodeURIComponent(niatId)}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ kind, contentType: f.type, sizeBytes: f.size }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message ?? "Upload failed.");
  const put = await fetch(json.uploadUrl, { method: "PUT", headers: json.headers, body: f });
  if (!put.ok) throw new Error("Upload failed. Try a smaller image.");
  return json.publicUrl as string;
}
