"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { firebase } from "@/lib/firebase/client";
import { conv, type WithId } from "@/lib/schema/converters";
import type { CorrectionRequest, Nominee, Position, Student, Tally } from "@/lib/schema";

export interface AdminData {
  students: WithId<Student>[] | null;
  positions: WithId<Position>[] | null;
  nominees: WithId<Nominee>[] | null;
  tallies: Record<string, Tally> | null;
  requests: WithId<CorrectionRequest>[] | null;
  error: string | null;
}

const Ctx = createContext<AdminData>({ students: null, positions: null, nominees: null, tallies: null, requests: null, error: null });

/**
 * Admins get true real-time via Firestore listeners (few users → cheap; PRD §5 principle 4).
 * One set of listeners shared by every admin page.
 */
export function AdminDataProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<AdminData>({ students: null, positions: null, nominees: null, tallies: null, requests: null, error: null });

  useEffect(() => {
    const { db } = firebase();
    const fail = (e: Error) => setData((d) => ({ ...d, error: e.message }));
    const unsubs = [
      onSnapshot(collection(db, "students").withConverter(conv.student), (s) => setData((d) => ({ ...d, students: s.docs.map((x) => x.data()) })), fail),
      onSnapshot(query(collection(db, "positions").withConverter(conv.position), orderBy("order")), (s) => setData((d) => ({ ...d, positions: s.docs.map((x) => x.data()) })), fail),
      onSnapshot(collection(db, "nominees").withConverter(conv.nominee), (s) => setData((d) => ({ ...d, nominees: s.docs.map((x) => x.data()) })), fail),
      onSnapshot(collection(db, "tallies"), (s) => setData((d) => ({ ...d, tallies: Object.fromEntries(s.docs.map((x) => [x.id, x.data() as Tally])) })), fail),
      onSnapshot(
        query(collection(db, "correctionRequests"), orderBy("createdAt", "desc")),
        (s) => setData((d) => ({ ...d, requests: s.docs.map((x) => ({ ...(x.data() as CorrectionRequest), _id: x.id })) })),
        fail,
      ),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  return <Ctx.Provider value={data}>{children}</Ctx.Provider>;
}

export const useAdminData = () => useContext(Ctx);
