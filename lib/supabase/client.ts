"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser Supabase client (publishable key). It is used ONLY for sign-in and for Realtime
 * subscriptions to the two browser-readable tables (rt, _changes). Every data read/write
 * goes through our server (/api/db, /api/fn), where the security rules run.
 */
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (typeof window === "undefined") throw new Error("supabase() is browser-only");
  client ??= createClient(URL_, KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "implicit", storageKey: "niat-auth" },
    realtime: { params: { eventsPerSecond: 5 } },
  });
  return client;
}

/** Current access token (refreshed automatically by supabase-js), or null when signed out. */
export async function accessToken(): Promise<string | null> {
  const { data } = await supabase().auth.getSession();
  return data.session?.access_token ?? null;
}
