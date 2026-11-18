"use client";

import Link from "next/link";
import { AlertTriangle, Home, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-dvh flex-col items-center justify-center bg-[#F2F1EC] p-4 font-sans text-[#111111]">
        <div className="flex w-full max-w-md flex-col items-center rounded-2xl border-[2.5px] border-[#111111] bg-[#FBFAF7] p-8 text-center shadow-[4px_4px_0_0_#111111]">
          <div className="grid size-16 place-items-center rounded-full border-[2.5px] border-[#111111] bg-[#C63D33]/15 text-[#C63D33]">
            <AlertTriangle className="size-8" strokeWidth={2.5} />
          </div>

          <h1 className="mt-4 font-display text-2xl uppercase tracking-tight text-[#111111]">
            System Error
          </h1>
          <p className="mt-2 text-sm text-[#5C5B56]">
            {error?.message || "An unexpected error occurred. Please refresh or try again."}
          </p>

          <div className="mt-6 flex w-full flex-col gap-3">
            <Button variant="primary" onClick={() => reset()} className="w-full">
              <RefreshCw className="size-4" /> Try Again
            </Button>
            <Link href="/" className="w-full">
              <Button variant="secondary" className="w-full">
                <Home className="size-4" /> Back to Home
              </Button>
            </Link>
          </div>
        </div>
      </body>
    </html>
  );
}
