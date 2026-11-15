"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, query, where, type Timestamp } from "firebase/firestore";
import { AlertTriangle, CheckCircle2, Info, PauseCircle, WifiOff, X } from "lucide-react";
import { firebase } from "@/lib/firebase/client";
import { fmtCountdown } from "@/lib/election";
import { useElection, useNow } from "@/hooks/use-election";
import { cn } from "@/lib/utils";

interface BannerData {
  id: string;
  variant: "info" | "warning" | "success" | "image";
  text: string;
  imageUrl?: string;
  link?: string;
}

/** E1: admin banners, dismissible per session (DESIGN §4 Banner). */
export function Banners({ className }: { className?: string }) {
  const [items, setItems] = useState<BannerData[]>([]);
  const [hidden, setHidden] = useState<string[]>([]);

  useEffect(() => {
    setHidden(JSON.parse(sessionStorage.getItem("niat.hiddenBanners") ?? "[]"));
    const now = Date.now();
    getDocs(query(collection(firebase().db, "banners"), where("active", "==", true)))
      .then((snap) =>
        setItems(
          snap.docs
            .filter((d) => (d.get("startsAt") as Timestamp).toMillis() <= now && (d.get("endsAt") as Timestamp).toMillis() > now)
            .map((d) => ({ id: d.id, ...(d.data() as Omit<BannerData, "id">) })),
        ),
      )
      .catch(() => setItems([]));
  }, []);

  const hide = (id: string) => {
    const next = [...hidden, id];
    setHidden(next);
    sessionStorage.setItem("niat.hiddenBanners", JSON.stringify(next));
  };

  const visible = items.filter((b) => !hidden.includes(b.id));
  if (!visible.length) return null;
  const style = {
    info: { cls: "border-info/30 bg-info/10", Icon: Info, color: "text-info" },
    warning: { cls: "border-warning/30 bg-warning/10", Icon: AlertTriangle, color: "text-warning" },
    success: { cls: "border-success/30 bg-success/10", Icon: CheckCircle2, color: "text-success" },
    image: { cls: "border-border bg-surface", Icon: Info, color: "text-primary" },
  };
  return (
    <div className={cn("space-y-2", className)}>
      {visible.map((b) => {
        const s = style[b.variant];
        const body = (
          <>
            {b.variant === "image" && b.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={b.imageUrl} alt={b.text} className="aspect-[3/1] w-full rounded-md object-cover" />
            ) : (
              <span className="flex items-start gap-2.5">
                <s.Icon className={cn("mt-0.5 size-5 shrink-0", s.color)} />
                <span className="text-sm leading-5">{b.text}</span>
              </span>
            )}
          </>
        );
        return (
          <div key={b.id} className={cn("relative rounded-lg border p-3 pr-12", s.cls)}>
            {b.link ? (
              <a href={b.link} className="block underline-offset-2 hover:underline">
                {body}
              </a>
            ) : (
              body
            )}
            <button onClick={() => hide(b.id)} aria-label="Dismiss" className="absolute top-1 right-1 grid size-11 place-items-center text-muted">
              <X className="size-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function PausedBanner() {
  const e = useElection();
  if (e.status !== "ready" || !e.settings.paused || e.phase !== "voting") return null;
  return (
    <div role="status" className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning/10 p-3">
      <PauseCircle className="mt-0.5 size-5 shrink-0 text-warning" />
      <p className="text-sm leading-5">
        Voting is paused by the election committee. Your votes are safe.
        {e.settings.pausedReason ? <span className="block text-muted">{e.settings.pausedReason}</span> : null}
      </p>
    </div>
  );
}

export function OfflineBar() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    setOffline(!navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  if (!offline) return null;
  return (
    <div role="status" className="sticky top-0 z-50 flex h-8 items-center justify-center gap-2 bg-warning text-xs font-semibold text-black">
      <WifiOff className="size-3.5" /> You&apos;re offline — changes will sync
    </div>
  );
}

/** "Closes in 05:12:44" / "Opens in 2d 14h" chip. */
export function CountdownChip({ className }: { className?: string }) {
  const e = useElection();
  const now = useNow();
  if (e.status !== "ready") return <span className={cn("inline-block h-6 w-28 animate-pulse rounded-full bg-surface-2", className)} />;
  const { settings, phase } = e;
  let text = "";
  if (phase === "voting") text = settings.paused ? "Paused" : `Closes in ${fmtCountdown(settings.closesAt - now)}`;
  else if (phase === "setup" || phase === "campaign") text = `Opens in ${fmtCountdown(settings.opensAt - now)}`;
  else if (phase === "closed") text = "Voting closed";
  else text = "Results out";
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center rounded-full px-3 text-xs font-extrabold tabular-nums",
        phase === "voting" && !settings.paused ? "bg-ink text-bg" : "border border-ink/30 bg-surface text-muted",
        className,
      )}
    >
      {text}
    </span>
  );
}
