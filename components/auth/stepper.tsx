import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/** Login progress: e.g. "Find you → Verify email → 2-step". `current` is 0-based. */
export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="flex items-center gap-2" aria-label="Sign-in progress">
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} className={cn("flex min-w-0 items-center gap-2", active || i < steps.length - 1 ? "flex-1" : "")} aria-current={active ? "step" : undefined}>
            <span
              className={cn(
                "grid size-7 shrink-0 place-items-center rounded-full border-2 text-xs font-extrabold",
                done && "border-ink bg-ink text-bg",
                active && "border-ink bg-highlight text-text",
                !done && !active && "border-ink/25 text-muted",
              )}
            >
              {done ? <Check className="size-4" strokeWidth={3} /> : i + 1}
            </span>
            {/* Small phones: only the current step is named, so labels never get cut off. */}
            <span className={cn("truncate text-xs font-bold", active ? "text-text" : "sr-only text-muted min-[400px]:not-sr-only")}>{label}</span>
            {i < steps.length - 1 && <span className={cn("h-0.5 min-w-3 flex-1 rounded-full", done ? "bg-ink" : "bg-ink/15")} aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}
