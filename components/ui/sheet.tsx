"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Bottom sheet on mobile, centred dialog on desktop (DESIGN §4 ConfirmSheet). Built on
 * <dialog> so focus trapping, Esc-to-close and the inert background come from the browser.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  dismissible = true,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  dismissible?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        if (dismissible) onClose();
      }}
      onClick={(e) => {
        if (dismissible && e.target === ref.current) onClose();
      }}
      className={cn(
        "m-0 mt-auto w-full max-w-none rounded-t-xl border border-border bg-surface p-0 text-text backdrop:bg-black/50 sm:m-auto sm:max-w-md sm:rounded-xl",
        className,
      )}
    >
      {open && (
        <div className="relative p-5 pb-[max(20px,env(safe-area-inset-bottom))]">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border sm:hidden" aria-hidden />
          {dismissible && (
            <button onClick={onClose} aria-label="Close" className="absolute top-3 right-3 grid size-11 place-items-center rounded-md text-muted hover:bg-surface-2">
              <X className="size-5" />
            </button>
          )}
          {children}
        </div>
      )}
    </dialog>
  );
}
