"use client";

import { useEffect, useState } from "react";
import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc, type Timestamp } from "@/lib/db/firestore";
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import { toast } from "sonner";
import { Megaphone, Plus } from "lucide-react";
import { PageTitle } from "@/components/admin/shell";
import { Button } from "@/components/ui/button";
import { Card, Chip, EmptyState, Input, Label, Skeleton } from "@/components/ui/primitives";
import { useSession } from "@/hooks/use-session";
import { backend } from "@/lib/backend/client";
import { TZ, fmtIST } from "@/lib/election";

interface B { id: string; variant: "info" | "warning" | "success" | "image"; text: string; link?: string; imageUrl?: string; startsAt: Timestamp; endsAt: Timestamp; active: boolean }
const toLocal = (ms: number) => formatInTimeZone(ms, TZ, "yyyy-MM-dd'T'HH:mm");

/** E1: banners with schedule (P-BAN-02). Times entered and shown in IST. */
export default function BannersPage() {
  const session = useSession();
  const [items, setItems] = useState<B[] | null>(null);
  const [form, setForm] = useState({ variant: "info" as B["variant"], text: "", link: "", imageUrl: "", startsAt: toLocal(Date.now()), endsAt: toLocal(Date.now() + 86400_000) });
  const [busy, setBusy] = useState(false);

  useEffect(() => onSnapshot(query(collection(backend().db, "banners"), orderBy("startsAt", "desc")), (s) => setItems(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<B, "id">) }))), () => setItems([])), []);

  const create = async () => {
    if (!form.text.trim() || form.text.length > 160) return toast.error("Banner text is required (max 160 characters).");
    const startsAt = fromZonedTime(form.startsAt, TZ);
    const endsAt = fromZonedTime(form.endsAt, TZ);
    if (endsAt <= startsAt) return toast.error("End must be after start.");
    if (form.variant === "image" && !form.imageUrl) return toast.error("Image banners need an image URL.");
    setBusy(true);
    try {
      await addDoc(collection(backend().db, "banners"), {
        variant: form.variant, text: form.text.trim(), ...(form.link ? { link: form.link } : {}), ...(form.imageUrl ? { imageUrl: form.imageUrl } : {}),
        startsAt, endsAt, active: true, createdBy: session.status === "ready" ? session.email : "", createdAt: serverTimestamp(),
      });
      setForm((f) => ({ ...f, text: "", link: "", imageUrl: "" }));
      toast.success("Banner published");
    } catch {
      toast.error("Couldn't publish the banner.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageTitle title="Banners" />
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-2">
          {items === null && <Skeleton className="h-40" />}
          {items?.length === 0 && <EmptyState icon={Megaphone} title="No banners yet." />}
          {items?.map((b) => {
            const live = b.active && b.startsAt.toMillis() <= Date.now() && b.endsAt.toMillis() > Date.now();
            return (
              <Card key={b.id} className="flex items-start gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{b.text}</p>
                  <p className="text-xs text-muted">{b.variant} · {fmtIST(b.startsAt.toMillis())} → {fmtIST(b.endsAt.toMillis())}</p>
                </div>
                <Chip tone={live ? "success" : "neutral"}>{live ? "live" : b.active ? "scheduled" : "off"}</Chip>
                <Button size="sm" variant="outline" onClick={() => updateDoc(doc(backend().db, "banners", b.id), { active: !b.active })}>{b.active ? "Turn off" : "Turn on"}</Button>
                <Button size="sm" variant="ghost" onClick={() => confirm("Delete this banner?") && deleteDoc(doc(backend().db, "banners", b.id))}>Delete</Button>
              </Card>
            );
          })}
        </div>
        <Card className="h-fit space-y-3 p-4">
          <h2 className="font-semibold">New banner</h2>
          <div><Label htmlFor="b-var">Style</Label>
            <select id="b-var" value={form.variant} onChange={(e) => setForm({ ...form, variant: e.target.value as B["variant"] })} className="h-10 w-full rounded-sm border border-border bg-surface-2 px-3">
              <option value="info">Info</option><option value="warning">Warning</option><option value="success">Success</option><option value="image">Image</option>
            </select></div>
          <div><Label htmlFor="b-text">Text ({form.text.length}/160)</Label><Input id="b-text" className="h-10" maxLength={160} value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} /></div>
          {form.variant === "image" && <div><Label htmlFor="b-img">Image URL</Label><Input id="b-img" className="h-10" value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} /></div>}
          <div><Label htmlFor="b-link">Link (optional)</Label><Input id="b-link" className="h-10" value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label htmlFor="b-s">Starts (IST)</Label><Input id="b-s" type="datetime-local" className="h-10 px-2 text-sm" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} /></div>
            <div><Label htmlFor="b-e">Ends (IST)</Label><Input id="b-e" type="datetime-local" className="h-10 px-2 text-sm" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} /></div>
          </div>
          <Button className="w-full" onClick={create} loading={busy}><Plus className="size-4" /> Publish</Button>
        </Card>
      </div>
    </>
  );
}
