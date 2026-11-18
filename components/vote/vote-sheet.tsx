"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import { Check, Clock, Share2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Sheet } from "@/components/ui/sheet";
import { castVote } from "@/lib/vote";
import { rememberLocalVote, useMyVote } from "@/hooks/use-my-votes";
import type { Nominee, Position } from "@/lib/schema";

type Stage = "confirm" | "submitting" | "queued" | "done" | "error";

/** DESIGN §6.9: confirm → spinner → ReceiptCard. "This is final." */
export function VoteSheet({
  open,
  onClose,
  voterId,
  firstName,
  position,
  nominee,
}: {
  open: boolean;
  onClose: () => void;
  voterId: string;
  firstName: string;
  position: Position & { _id: string };
  nominee: Nominee & { _id: string };
}) {
  const [stage, setStage] = useState<Stage>("confirm");
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setStage("submitting");
    const r = await castVote(voterId, position._id, nominee._id, () => {
      if (!navigator.onLine) setStage("queued");
    });
    if (r.ok) {
      rememberLocalVote(position._id, nominee._id);
      navigator.vibrate?.(30);
      setStage("done");
    } else {
      setError(r.message);
      setStage("error");
    }
  };

  const close = () => {
    if (stage === "submitting" || stage === "queued") return;
    onClose();
    setTimeout(() => {
      setStage("confirm");
      setError(null);
    }, 200);
  };

  return (
    <Sheet open={open} onClose={close} title="Confirm your vote" dismissible={stage !== "submitting" && stage !== "queued"}>
      {(stage === "confirm" || stage === "submitting") && (
        <div className="space-y-5 pt-2 text-center">
          <Avatar src={nominee.photoUrl} name={nominee.name} color={position.color} size={72} className="mx-auto" />
          <h2 className="font-display text-xl leading-7 font-semibold">
            Vote for <span className="text-primary">{nominee.name}</span> as {position.name}?
          </h2>
          <p className="flex items-center justify-center gap-2 rounded-md bg-warning/10 p-3 text-sm">
            <TriangleAlert className="size-4 shrink-0 text-warning" />
            This is final. You can&apos;t change or undo your vote.
          </p>
          <div className="space-y-2">
            <Button size="lg" className="w-full" onClick={confirm} loading={stage === "submitting"}>
              Confirm vote
            </Button>
            <Button variant="ghost" className="w-full" onClick={close} disabled={stage === "submitting"}>
              Go back
            </Button>
          </div>
        </div>
      )}
      {stage === "queued" && (
        <div className="space-y-3 py-6 text-center">
          <Clock className="mx-auto size-10 text-warning" />
          <p className="font-semibold">You&apos;re offline — your vote is saved and will submit automatically</p>
          <p className="text-sm text-muted">Submitting… keep this page open.</p>
        </div>
      )}
      {stage === "done" && <ReceiptCard position={position} voterId={voterId} firstName={firstName} onClose={close} />}
      {stage === "error" && (
        <div className="space-y-4 py-4 text-center">
          <TriangleAlert className="mx-auto size-10 text-danger" />
          <p className="font-semibold">{error}</p>
          <Button variant="secondary" onClick={close}>
            OK
          </Button>
        </div>
      )}
    </Sheet>
  );
}

function ReceiptCard({ position, firstName, onClose }: { position: Position & { _id: string }; voterId: string; firstName: string; onClose: () => void }) {
  const vote = useMyVote(position._id, true);
  const reduce = useReducedMotion();
  const code = vote?.receiptCode;

  const share = async () => {
    // D-16: the badge names the club, never the nominee.
    const text = `I voted in ${position.club} at NIAT Elections '26 ✓ — ${firstName}`;
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        toast.success("Copied — paste it anywhere");
      }
    } catch {
      /* share sheet dismissed */
    }
  };

  return (
    <div className="space-y-4 py-2 text-center">
      <span className="mx-auto grid size-16 place-items-center rounded-full bg-success/15">
        <svg viewBox="0 0 24 24" className="size-9 text-success" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={{ pathLength: reduce ? 1 : 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.4 }} />
        </svg>
      </span>
      <h2 className="font-display text-xl font-semibold">Vote recorded</h2>
      <p className="text-sm text-muted">Keep your receipt code.</p>
      <div className="flex items-center justify-center gap-2 rounded-md bg-surface-2 p-3">
        {code ? (
          <span className="font-mono text-lg font-semibold tracking-wider">{code}</span>
        ) : (
          <span className="text-sm text-muted">Generating receipt…</span>
        )}
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={share}>
          <Share2 className="size-4" /> Share badge
        </Button>
        <Button className="flex-1" onClick={onClose}>
          <Check className="size-4" /> Done
        </Button>
      </div>
    </div>
  );
}
