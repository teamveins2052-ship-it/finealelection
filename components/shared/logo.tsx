import { Check } from "lucide-react";

/** Ballot-tick mark + wordmark (DESIGN §2). Official NIAT logo only with college permission. */
export function Logo() {
  return (
    <span className="inline-flex items-center gap-2 font-display text-base whitespace-nowrap sm:text-lg">
      <span className="grid size-8 place-items-center rounded-sm bg-primary text-primary-fg" aria-hidden>
        <Check className="size-5" strokeWidth={3} />
      </span>
      NIAT Elections &apos;26
    </span>
  );
}
