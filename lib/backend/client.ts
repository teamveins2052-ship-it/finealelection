"use client";

import { auth } from "@/lib/db/auth";
import { db } from "@/lib/db/firestore";
import { rtdb } from "@/lib/db/database";

/**
 * Shared handles for the screens (`backend().db / .auth / .rtdb`). Everything behind it
 * is Supabase now (lib/db/*, lib/supabase/client.ts). No Firebase code is loaded.
 */
export function backend() {
  if (typeof window === "undefined") throw new Error("backend() is browser-only");
  return { auth, db, rtdb };
}
