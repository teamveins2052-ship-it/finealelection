"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/hooks/use-session";
import { DontLookUpHero } from "@/components/public/dont-look-up-hero";

export default function LandingPage() {
  const router = useRouter();
  const session = useSession();

  useEffect(() => {
    if (session.status === "ready") {
      if (session.student) {
        try {
          localStorage.setItem("niat_intro_seen", "1");
        } catch {}
        router.replace("/dashboard");
      } else if (session.admin) {
        router.replace("/admin");
      }
    }
  }, [session, router]);

  return <DontLookUpHero />;
}

