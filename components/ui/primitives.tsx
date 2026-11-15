import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl border border-border bg-surface shadow-card", className)} {...props} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-surface-2", className)} />;
}

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-12 w-full rounded-xl border-2 border-ink bg-surface px-4 text-base font-semibold placeholder:font-normal placeholder:text-muted disabled:opacity-60 aria-[invalid=true]:border-danger",
        className,
      )}
      {...props}
    />
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn("min-h-24 w-full rounded-xl border-2 border-ink bg-surface p-3 text-base placeholder:text-muted", className)}
        {...props}
      />
    );
  },
);

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1.5 block text-xs font-medium tracking-wide text-muted", className)} {...props} />;
}

export function FieldError({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="mt-1.5 text-sm text-danger">
      {children}
    </p>
  );
}

type Tone = "success" | "warning" | "danger" | "info" | "neutral" | "primary";
const tones: Record<Tone, string> = {
  success: "bg-success/12 text-success",
  warning: "bg-warning/15 text-warning",
  danger: "bg-danger/12 text-danger",
  info: "bg-info/12 text-info",
  neutral: "bg-surface-2 text-muted",
  primary: "border border-ink bg-surface text-text",
};

export function Chip({ tone = "neutral", className, ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn("inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-bold whitespace-nowrap", tones[tone], className)}
      {...props}
    />
  );
}

export function LiveDot({ label = "LIVE" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-extrabold tracking-widest text-text">
      <span className="size-2 animate-pulse-dot rounded-full bg-danger" aria-hidden />
      {label}
    </span>
  );
}

export function EmptyState({ icon: Icon, title, children }: { icon: React.ComponentType<{ className?: string }>; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <Icon className="size-10 text-muted" />
      <p className="font-semibold">{title}</p>
      {children}
    </div>
  );
}

export function ErrorState({ message = "Couldn't load this.", onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <p className="text-muted">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="shadow-ink h-11 rounded-full border-2 border-ink bg-surface px-5 text-sm font-extrabold uppercase">
          Try again
        </button>
      )}
    </div>
  );
}

export function VoteBar({ value, color, label }: { value: number; color?: string; label: string }) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
      className="h-2 w-full overflow-hidden rounded-full bg-surface-2"
    >
      {/* scaleX instead of width: animates on the compositor, no layout (DESIGN §11). */}
      <div
        className="h-full origin-left rounded-full transition-transform duration-[600ms] ease-out"
        style={{ transform: `scaleX(${Math.min(value, 100) / 100})`, background: color ?? "var(--primary)", opacity: 0.85 }}
      />
    </div>
  );
}

export function ProgressRing({ done, total, size = 36 }: { done: number; total: number; size?: number }) {
  const r = size / 2 - 3;
  const c = 2 * Math.PI * r;
  const frac = total ? done / total : 0;
  return (
    <span className="inline-flex items-center gap-1.5" aria-label={`${done} of ${total} voted`}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={4} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={frac === 1 ? "var(--success)" : "var(--ink)"}
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          className="transition-[stroke-dashoffset] duration-500"
        />
      </svg>
      <span className="font-display text-sm font-semibold tabular-nums">
        {done}/{total}
      </span>
    </span>
  );
}
