"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/** Square avatar; falls back to initials on a club-colour tint (DESIGN §3.6). */
export function Avatar({
  src,
  name,
  color = "#667085",
  size = 48,
  className,
  ring,
}: {
  src?: string | null;
  name: string;
  color?: string;
  size?: number;
  className?: string;
  ring?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const initials = name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return (
    <span
      className={cn("relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full", ring && "p-[2px]", className)}
      style={{
        width: size,
        height: size,
        background: ring ? "linear-gradient(135deg, var(--ink), var(--highlight))" : undefined,
      }}
    >
      <span
        className="grid size-full place-items-center overflow-hidden rounded-full font-display font-bold"
        style={{ background: `${color}26`, color, fontSize: size * 0.36 }}
      >
        {src && !failed ? (
          // Media is on R2 behind Cloudflare's CDN; explicit size prevents layout shift.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" width={size} height={size} loading="lazy" onError={() => setFailed(true)} className="size-full object-cover" />
        ) : (
          <span aria-hidden>{initials}</span>
        )}
      </span>
    </span>
  );
}
