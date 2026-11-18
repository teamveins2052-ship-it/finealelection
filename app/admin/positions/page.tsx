"use client";

import { useMemo, useState } from "react";
import { doc, serverTimestamp, setDoc, updateDoc } from "@/lib/db/firestore";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Plus, Search, X } from "lucide-react";
import { PageTitle } from "@/components/admin/shell";
import { useAdminData } from "@/components/admin/data";
import { CLUB_COLORS, CLUB_ICON_NAMES, ClubIcon } from "@/components/shared/club-icon";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, Chip, Input, Label, Skeleton, Textarea } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/sheet";
import { call, errorMessage, invalidate } from "@/lib/client-data";
import { backend } from "@/lib/backend/client";
import { PositionId, type Position } from "@/lib/schema";
import type { WithId } from "@/lib/schema/converters";

/** D4 / N1: positions (admin write, P-POS-02) + nominee toggles via setNominee (locked once voting opens). */
export default function PositionsPage() {
  const { positions, nominees } = useAdminData();
  const [editing, setEditing] = useState<WithId<Position> | "new" | null>(null);
  const [adding, setAdding] = useState<WithId<Position> | null>(null);
  if (!positions || !nominees) return <Skeleton className="h-96" />;

  const move = async (p: WithId<Position>, dir: -1 | 1) => {
    const i = positions.findIndex((x) => x._id === p._id);
    const other = positions[i + dir];
    if (!other) return;
    const { db } = backend();
    await Promise.all([
      updateDoc(doc(db, "positions", p._id), { order: other.order, updatedAt: serverTimestamp() }),
      updateDoc(doc(db, "positions", other._id), { order: p.order, updatedAt: serverTimestamp() }),
    ]).catch(() => toast.error("Couldn't reorder."));
    invalidate("positions");
  };

  const remove = async (niatId: string, positionId: string) => {
    try {
      await call("setNominee", { niatId, positionId, active: false });
      toast.success("Nominee removed");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <>
      <PageTitle title="Positions & Nominees">
        <Button size="sm" onClick={() => setEditing("new")}><Plus className="size-4" /> New position</Button>
      </PageTitle>
      <div className="space-y-3">
        {positions.map((p, i) => {
          const list = nominees.filter((n) => n.positionId === p._id && n.active);
          return (
            <Card key={p._id} className="border-t-4 p-4" style={{ borderTopColor: p.color }}>
              <div className="flex flex-wrap items-center gap-3">
                <ClubIcon name={p.icon} color={p.color} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{p.name} {!p.active && <Chip className="ml-1">inactive</Chip>}</p>
                  <p className="text-xs text-muted">{p.club} · <span className="font-mono">{p._id}</span></p>
                </div>
                <Button size="sm" variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => move(p, -1)}><ArrowUp className="size-4" /></Button>
                <Button size="sm" variant="ghost" aria-label="Move down" disabled={i === positions.length - 1} onClick={() => move(p, 1)}><ArrowDown className="size-4" /></Button>
                <Button size="sm" variant="outline" onClick={() => setEditing(p)}>Edit</Button>
                <Button size="sm" onClick={() => setAdding(p)}><Plus className="size-4" /> Nominee</Button>
              </div>
              <ul className="mt-3 flex flex-wrap gap-2">
                {list.map((n) => (
                  <li key={n._id} className="flex items-center gap-2 rounded-full border border-border bg-surface-2 py-1 pr-1 pl-1.5 text-sm">
                    <Avatar src={n.photoUrl} name={n.name} color={p.color} size={24} /> {n.name}
                    <button aria-label={`Remove ${n.name}`} onClick={() => remove(n.niatId, p._id)} className="grid size-7 place-items-center rounded-full text-muted hover:bg-border"><X className="size-3.5" /></button>
                  </li>
                ))}
                {list.length === 0 && <li className="text-sm text-muted">No nominees yet.</li>}
              </ul>
            </Card>
          );
        })}
      </div>
      {editing && <PositionEditor position={editing === "new" ? null : editing} nextOrder={(positions.at(-1)?.order ?? 0) + 1} onClose={() => setEditing(null)} />}
      {adding && <AddNominee position={adding} onClose={() => setAdding(null)} />}
    </>
  );
}

function PositionEditor({ position, nextOrder, onClose }: { position: WithId<Position> | null; nextOrder: number; onClose: () => void }) {
  const [f, setF] = useState({
    id: position?._id ?? "", name: position?.name ?? "", club: position?.club ?? "", color: position?.color ?? CLUB_COLORS[0],
    icon: position?.icon ?? "Users", description: position?.description ?? "", active: position?.active ?? true,
  });
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const id = position?._id ?? f.id.trim().toLowerCase();
    if (!PositionId.safeParse(id).success) return toast.error("ID: 2–40 lowercase letters, numbers and dashes, e.g. sports-president");
    if (f.name.trim().length < 2 || f.club.trim().length < 2) return toast.error("Name and club are required.");
    setBusy(true);
    try {
      const ref = doc(backend().db, "positions", id);
      const base = { name: f.name.trim(), club: f.club.trim(), color: f.color, icon: f.icon, description: f.description.trim().slice(0, 300), active: f.active, updatedAt: serverTimestamp() };
      if (position) await updateDoc(ref, base);
      else await setDoc(ref, { ...base, id, order: nextOrder, nomineeCount: 0, createdAt: serverTimestamp() });
      invalidate("positions");
      toast.success("Position saved");
      onClose();
    } catch {
      toast.error("Couldn't save the position.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open onClose={onClose} title="Position" className="sm:max-w-lg">
      <div className="space-y-3">
        <h2 className="font-display text-lg font-semibold">{position ? "Edit position" : "New position"}</h2>
        {!position && <div><Label htmlFor="p-id">ID (slug)</Label><Input id="p-id" className="h-10 font-mono" value={f.id} onChange={(e) => setF({ ...f, id: e.target.value })} placeholder="sports-president" /></div>}
        <div><Label htmlFor="p-name">Name</Label><Input id="p-name" className="h-10" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div><Label htmlFor="p-club">Club</Label><Input id="p-club" className="h-10" value={f.club} onChange={(e) => setF({ ...f, club: e.target.value })} /></div>
        <div>
          <Label>Colour</Label>
          <div className="flex gap-2">{CLUB_COLORS.map((c) => <button key={c} aria-label={c} aria-pressed={f.color === c} onClick={() => setF({ ...f, color: c })} className="size-9 rounded-full ring-offset-2 aria-pressed:ring-2 aria-pressed:ring-text" style={{ background: c }} />)}</div>
        </div>
        <div>
          <Label>Icon</Label>
          <div className="flex flex-wrap gap-2">{CLUB_ICON_NAMES.map((n) => <button key={n} aria-label={n} aria-pressed={f.icon === n} onClick={() => setF({ ...f, icon: n })} className="grid size-10 place-items-center rounded-md border border-border aria-pressed:border-primary aria-pressed:bg-primary/10"><ClubIcon name={n} color={f.color} preferIcon /></button>)}</div>
        </div>
        <div><Label htmlFor="p-desc">Description</Label><Textarea id="p-desc" maxLength={300} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} className="size-4 accent-[var(--primary)]" /> Active (shown on ballot)</label>
        <Button className="w-full" onClick={save} loading={busy}>Save</Button>
      </div>
    </Sheet>
  );
}

function AddNominee({ position, onClose }: { position: WithId<Position>; onClose: () => void }) {
  const { students } = useAdminData();
  const [q, setQ] = useState("");
  const [customId, setCustomId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const eligiblePool = useMemo(() => {
    return (students ?? []).filter((s) => s.status === "active" && !s.isNominee);
  }, [students]);

  const matches = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return eligiblePool.slice(0, 30);
    return eligiblePool.filter((s) => s.niatId.toLowerCase().includes(n) || s.name.toLowerCase().includes(n)).slice(0, 30);
  }, [eligiblePool, q]);

  const add = async (rawId: string) => {
    const niatId = rawId.trim().toUpperCase();
    if (!niatId) return toast.error("Enter a valid NIAT ID");
    setBusy(niatId);
    try {
      await call("setNominee", { niatId, positionId: position._id, active: true });
      invalidate("positions");
      toast.success(`Nominee ${niatId} added for ${position.name}`);
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet open onClose={onClose} title="Add nominee" className="sm:max-w-lg">
      <div className="space-y-4">
        <div>
          <h2 className="font-display text-lg font-semibold">Add nominee · {position.name}</h2>
          <p className="text-xs text-muted">Assign any active student as a candidate for this club.</p>
        </div>

        {/* Direct NIAT ID Assignment */}
        <div className="rounded-lg border border-border bg-surface p-3 space-y-2">
          <Label htmlFor="custom-niat" className="text-xs font-semibold">Assign by NIAT ID</Label>
          <div className="flex gap-2">
            <Input
              id="custom-niat"
              className="h-9 uppercase font-mono text-sm"
              placeholder="e.g. N25H01A0001"
              value={customId}
              onChange={(e) => setCustomId(e.target.value.toUpperCase())}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(customId); } }}
            />
            <Button size="sm" onClick={() => add(customId)} loading={busy === customId} disabled={!customId.trim()}>
              Assign
            </Button>
          </div>
        </div>

        {/* Search & List */}
        <div>
          <Label className="text-xs font-semibold mb-1 block">Or search from student directory</Label>
          <div className="relative">
            <Search className="absolute top-3 left-3 size-4 text-muted" />
            <Input autoFocus className="h-10 pl-9" placeholder="Search by student name or NIAT ID" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>

        <ul className="max-h-80 overflow-y-auto divide-y divide-border rounded-md border border-border">
          {matches.map((s) => (
            <li key={s.niatId} className="flex items-center gap-3 p-2.5 hover:bg-surface-2 transition-colors">
              <span className="flex-1 min-w-0">
                <span className="block font-semibold truncate text-sm">{s.name}</span>
                <span className="font-mono text-xs text-muted">{s.niatId} · Batch {s.batch}</span>
              </span>
              <Button size="sm" variant="secondary" onClick={() => add(s.niatId)} loading={busy === s.niatId}>
                Add
              </Button>
            </li>
          ))}
          {matches.length === 0 && (
            <li className="py-6 text-center text-sm text-muted">
              {q ? "No matching eligible students found." : "Loading students..."}
            </li>
          )}
        </ul>
      </div>
    </Sheet>
  );
}
