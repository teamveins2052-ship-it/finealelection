"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { addDoc, collection, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where } from "@/lib/db/firestore";
import { toast } from "sonner";
import { CheckCircle2, Circle, Eye, Flame, HandHeart, ImageOff, ImagePlus, Lock, MessageCircleQuestion, Plus, Trash2, Upload, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, Label, Skeleton, Textarea } from "@/components/ui/primitives";
import { useElection } from "@/hooks/use-election";
import { useSession } from "@/hooks/use-session";
import { backend } from "@/lib/backend/client";
import { invalidate } from "@/lib/client-data";
import { ids, NomineeProfileInput, type Nominee, type Post, type Question } from "@/lib/schema";
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
  const [posts, setPosts] = useState<WithId<Post>[] | null>(null);

  useEffect(() => {
    if (!nomineeId) return;
    const { db } = backend();
    const u1 = onSnapshot(doc(db, "nominees", nomineeId).withConverter(conv.nominee), (s) => setNominee(s.exists() ? s.data() : null));
    const u2 = onSnapshot(
      query(collection(db, "questions").withConverter(conv.question), where("nomineeId", "==", nomineeId), where("hidden", "==", false), orderBy("createdAt", "desc")),
      (s) => setQuestions(s.docs.map((d) => d.data())),
      () => setQuestions([]),
    );
    const u3 = onSnapshot(
      query(collection(db, "posts").withConverter(conv.post), where("nomineeId", "==", nomineeId), where("deleted", "==", false), orderBy("createdAt", "desc")),
      (s) => setPosts(s.docs.map((d) => d.data())),
      () => setPosts([]),
    );
    return () => {
      u1();
      u2();
      u3();
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
  const currentPostCount = posts !== null ? posts.length : nominee.postCount;
  const checklist = [
    { label: "Photo", done: !!nominee.photoUrl },
    { label: "Bio", done: nominee.bio.length > 0 },
    { label: "Promises", done: nominee.promises.length > 0 },
    { label: "First post", done: currentPostCount > 0 },
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
          { Icon: ImagePlus, label: "Posts", v: currentPostCount },
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
      <PostsList posts={posts} niatId={student.niatId} locked={locked} />
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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const onFileSelect = (f: File) => {
    if (!/^image\/(webp|jpeg|png)$/.test(f.type)) return toast.error("Photos only: JPG, PNG or WebP.");
    if (f.size > 2 * 1024 * 1024) return toast.error("Images must be 2 MB or less.");
    setSelectedFile(f);
    setPreviewUrl(URL.createObjectURL(f));
  };

  const clearSelected = () => {
    setSelectedFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    if (file.current) file.current.value = "";
  };

  const post = async () => {
    if (!selectedFile) {
      file.current?.click();
      return;
    }
    setBusy(true);
    try {
      const mediaUrl = await uploadMedia(selectedFile, "post", niatId);
      await addDoc(collection(backend().db, "posts"), {
        nomineeId: nominee._id,
        niatId,
        type: "photo",
        mediaUrl,
        caption: caption.trim().slice(0, 200),
        commentCount: 0,
        deleted: false,
        createdAt: serverTimestamp(),
      });
      clearSelected();
      setCaption("");
      invalidate(`nominee:${nominee._id}`);
      toast.success("Post published to your campaign profile!");
    } catch (e) {
      toast.error((e as Error).message || "Couldn't post.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="space-y-3 p-4">
      <h2 className="font-display text-lg font-semibold">New post</h2>

      {previewUrl ? (
        <div className="relative overflow-hidden rounded-md border border-border bg-surface-2 p-2">
          <div className="relative mx-auto aspect-video max-h-56 w-full overflow-hidden rounded">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="Preview" className="size-full object-contain" />
            <button
              type="button"
              onClick={clearSelected}
              className="absolute right-2 top-2 rounded-full bg-ink/75 p-1 text-bg hover:bg-ink transition-colors"
              aria-label="Remove selected image"
              disabled={busy}
            >
              <X className="size-4" />
            </button>
          </div>
          <p className="mt-2 text-center text-xs text-muted truncate">{selectedFile?.name}</p>
        </div>
      ) : null}

      <Textarea
        placeholder="Caption (optional, 200 chars)"
        maxLength={200}
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        disabled={locked || busy}
        aria-label="Caption"
      />

      <input
        ref={file}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(e) => e.target.files?.[0] && onFileSelect(e.target.files[0])}
      />

      {selectedFile ? (
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={post} loading={busy} disabled={locked}>
            <ImagePlus className="size-4" /> Publish post
          </Button>
          <Button variant="ghost" onClick={clearSelected} disabled={busy || locked}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button variant="secondary" className="w-full" onClick={() => file.current?.click()} loading={busy} disabled={locked}>
          <ImagePlus className="size-4" /> Choose photo & post
        </Button>
      )}

      <p className="text-xs text-muted">Images ≤ 2 MB (JPG, PNG, WebP). Saved securely to cloud storage.</p>
    </Card>
  );
}

function PostsList({ posts, niatId, locked }: { posts: WithId<Post>[] | null; niatId: string; locked: boolean }) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const handleDelete = async (postId: string) => {
    setDeletingId(postId);
    try {
      await updateDoc(doc(backend().db, "posts", postId), {
        deleted: true,
        deletedBy: niatId,
      });
      toast.success("Post deleted.");
      setConfirmId(null);
    } catch {
      toast.error("Couldn't delete post. Try again.");
    } finally {
      setDeletingId(null);
    }
  };

  if (posts === null) {
    return (
      <Card className="space-y-3 p-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-20 w-full" />
      </Card>
    );
  }

  return (
    <Card className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold">Your posts ({posts.length})</h2>
      </div>

      {posts.length === 0 ? (
        <EmptyState icon={ImageOff} title="No posts yet.">
          <p className="text-xs text-muted">Photos you post will appear on your campaign profile.</p>
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {posts.map((p) => {
            const isDeleting = deletingId === p._id;
            const isConfirming = confirmId === p._id;
            const dateStr = p.createdAt?.toDate
              ? p.createdAt.toDate().toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "";

            return (
              <div
                key={p._id}
                className="flex items-start gap-3 rounded-lg border border-border bg-surface-2 p-3 transition-colors"
              >
                {/* Thumbnail */}
                <div className="relative size-20 shrink-0 overflow-hidden rounded-md border border-border bg-surface">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.mediaUrl}
                    alt={p.caption || "Nominee post"}
                    className="size-full object-cover"
                    loading="lazy"
                  />
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-medium text-ink">
                    {p.caption ? p.caption : <span className="italic text-muted">No caption</span>}
                  </p>
                  {dateStr && <p className="mt-1 text-xs text-muted">{dateStr}</p>}

                  {/* Delete controls */}
                  <div className="mt-2 flex items-center gap-2">
                    {isConfirming ? (
                      <div className="flex items-center gap-2 animate-in fade-in duration-150">
                        <span className="text-xs font-semibold text-destructive">Delete this post?</span>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-7 px-2 text-xs"
                          loading={isDeleting}
                          onClick={() => handleDelete(p._id)}
                        >
                          Confirm
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          disabled={isDeleting}
                          onClick={() => setConfirmId(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={locked || isDeleting}
                        onClick={() => setConfirmId(p._id)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-destructive transition-colors disabled:opacity-50"
                        title="Delete post"
                      >
                        <Trash2 className="size-3.5" />
                        <span>Delete</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
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
  let token = await backend().auth.currentUser?.getIdToken().catch(() => null);
  if (!token) {
    const { supabase } = await import("@/lib/supabase/client");
    const { data } = await supabase().auth.getSession();
    token = data.session?.access_token ?? null;
  }
  if (!token) throw new Error("Session expired. Please sign in again to upload.");

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
