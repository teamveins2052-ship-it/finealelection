"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, Home, RefreshCw } from "lucide-react";
import { Logo } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/primitives";

export default function GlobalErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app-error]", error);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col bg-bg text-text">
      {/* Header */}
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" aria-label="NIAT Elections Home">
          <Logo />
        </Link>
      </header>

      {/* Main Error Card */}
      <main className="mx-auto flex flex-1 w-full max-w-lg flex-col items-center justify-center px-4 py-12 text-center sm:px-6">
        <Card className="flex w-full flex-col items-center p-8 sm:p-10 shadow-ink">
          {/* Alert Icon */}
          <div className="grid size-16 place-items-center rounded-full border-[2.5px] border-ink bg-danger/10 text-danger shadow-ink">
            <AlertTriangle className="size-8" strokeWidth={2.5} />
          </div>

          <div className="mt-4 inline-flex items-center rounded-full border-2 border-ink bg-surface-2 px-3.5 py-1 font-display text-xs tracking-wider uppercase text-ink">
            Application Error
          </div>

          <h1 className="mt-4 font-display text-2xl uppercase tracking-tight text-ink sm:text-3xl">
            Something Went Wrong
          </h1>
          <p className="mt-2 text-sm text-muted">
            {error?.message && !error.message.includes("Digest")
              ? error.message
              : "An unexpected error occurred while loading this page. Please try again."}
          </p>

          {/* Action Buttons */}
          <div className="mt-8 flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
            <Button variant="primary" onClick={() => reset()} className="w-full sm:w-auto">
              <RefreshCw className="size-4" /> Try Again
            </Button>
            <Link href="/" className="w-full sm:w-auto">
              <Button variant="secondary" className="w-full sm:w-auto">
                <Home className="size-4" /> Back to Home
              </Button>
            </Link>
          </div>

          <p className="mt-6 text-xs text-muted">
            If this issue persists, please{" "}
            <Link href="/login/request" className="font-bold underline underline-offset-4 hover:text-ink">
              contact the election committee
            </Link>.
          </p>
        </Card>
      </main>

      {/* Footer */}
      <footer className="py-6 text-center text-xs text-muted">
        &copy; 2026 NIAT Campus Elections Committee &bull; Official Student Voting Portal
      </footer>
    </div>
  );
}
