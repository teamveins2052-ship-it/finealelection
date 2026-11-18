import Link from "next/link";
import { ArrowLeft, Home, Vote } from "lucide-react";
import { Logo } from "@/components/shared/logo";
import { EyeLetter } from "@/components/public/eye-letter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/primitives";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col bg-bg text-text">
      {/* Top Header */}
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="transition-opacity hover:opacity-80" aria-label="NIAT Elections Home">
          <Logo />
        </Link>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 font-sans text-xs font-bold uppercase tracking-wider text-muted hover:text-text sm:text-sm"
        >
          <ArrowLeft className="size-4" /> Home
        </Link>
      </header>

      {/* Main 404 Canvas */}
      <main className="mx-auto flex flex-1 w-full max-w-2xl flex-col items-center justify-center px-4 py-12 text-center sm:px-6">
        <Card className="flex w-full flex-col items-center p-8 sm:p-12 shadow-ink">
          {/* Playful 404 with EyeLetter in the middle */}
          <div className="flex items-center justify-center font-display text-7xl tracking-tighter text-ink select-none sm:text-9xl">
            <span>4</span>
            <div className="mx-1 -mt-2 inline-flex scale-90 sm:scale-110">
              <EyeLetter />
            </div>
            <span>4</span>
          </div>

          {/* Badge */}
          <div className="mt-4 inline-flex items-center rounded-full border-2 border-ink bg-highlight px-3.5 py-1 font-display text-xs tracking-wider uppercase text-ink">
            Page Not Found
          </div>

          {/* Title and Description */}
          <h1 className="mt-4 font-display text-2xl uppercase tracking-tight text-ink sm:text-4xl">
            Lost In The Polls?
          </h1>
          <p className="mt-2 max-w-md font-sans text-sm text-muted sm:text-base">
            The page you are looking for doesn&apos;t exist, was moved, or the link you followed is no longer active.
          </p>

          {/* Action Buttons */}
          <div className="mt-8 flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
            <Link href="/" className="w-full sm:w-auto">
              <Button variant="primary" className="w-full sm:w-auto">
                <Home className="size-4" /> Go to Homepage
              </Button>
            </Link>
            <Link href="/login" className="w-full sm:w-auto">
              <Button variant="secondary" className="w-full sm:w-auto">
                <Vote className="size-4" /> Login to Vote
              </Button>
            </Link>
          </div>

          {/* Help link */}
          <p className="mt-8 text-xs text-muted">
            Need help?{" "}
            <Link href="/login/request" className="font-bold underline underline-offset-4 hover:text-ink">
              Request support or data correction
            </Link>
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
