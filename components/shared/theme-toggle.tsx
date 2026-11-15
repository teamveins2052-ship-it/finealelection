"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <button
      type="button"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      aria-label="Toggle dark mode"
      className="grid size-11 place-items-center rounded-md text-muted hover:bg-surface-2"
    >
      {/* Both icons rendered and swapped by CSS so server and client markup match. */}
      <Sun className="size-5 dark:hidden" strokeWidth={1.75} />
      <Moon className="hidden size-5 dark:block" strokeWidth={1.75} />
    </button>
  );
}
