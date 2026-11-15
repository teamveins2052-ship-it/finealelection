import { forwardRef } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "destructive" | "google" | "outline";
type Size = "sm" | "md" | "lg";

// "Sticker" pills in the display face: thick ink outline + hard offset shadow; hover tilts, press flattens (globals.css).
const sticker = "btn-sticker rounded-full font-display uppercase tracking-wide";
const variants: Record<Variant, string> = {
  primary: `${sticker} border-[2.5px] border-ink bg-primary text-primary-fg shadow-ink-primary`,
  secondary: `${sticker} border-[2.5px] border-ink bg-surface text-text shadow-ink`,
  outline: `${sticker} border-[2.5px] border-ink bg-surface text-text shadow-ink`,
  destructive: `${sticker} border-2 border-ink bg-danger text-white shadow-ink`,
  google: `${sticker} border-2 border-ink bg-white text-[#1f1f1f] font-sans font-extrabold normal-case tracking-normal shadow-ink`,
  ghost: "rounded-full font-bold text-text hover:bg-surface-2",
};
const sizes: Record<Size, string> = { sm: "h-10 px-4 text-xs", md: "h-12 px-6 text-sm", lg: "h-14 px-6 text-base sm:px-8 sm:text-lg" };

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

/** Loading keeps the label (no width jump) and adds an inline spinner (DESIGN §4). */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, disabled, className, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex min-w-11 items-center justify-center gap-2 transition-[transform,box-shadow] duration-150 ease-out select-none disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});
