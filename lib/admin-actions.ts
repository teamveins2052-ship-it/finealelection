"use client";

import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { firebase } from "@/lib/firebase/client";
import { call } from "@/lib/client-data";
import { phaseOf, type PublicSettings } from "@/lib/election";

/**
 * Admins write settings directly; rules check date order + updatedBy == caller +
 * server timestamp (P-SET-02), and the onSettingsWritten trigger audits every change.
 */
export async function updateSettings(email: string, current: PublicSettings, patch: Partial<Record<string, unknown>> & Partial<PublicSettings>) {
  const merged = { ...current, ...patch } as PublicSettings;
  const toDate = (ms: number) => new Date(ms);
  const payload: Record<string, unknown> = { updatedBy: email, updatedAt: serverTimestamp(), phase: phaseOf(merged) };
  for (const [k, v] of Object.entries(patch)) {
    payload[k] = ["campaignOpensAt", "opensAt", "closesAt", "siteClosesAt"].includes(k) ? toDate(v as number) : v;
  }
  await updateDoc(doc(firebase().db, "settings", "election"), payload);
  // Mirror to RTDB + audit right away (free hosting has no settings trigger).
  await call("syncElection", {}).catch(() => undefined);
}
