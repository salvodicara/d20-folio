/**
 * `useTable` — the React binding of the table store (stage 6 design §4).
 *
 * This module is the ONLY one in `src/features/play/table/` that knows the app's singletons:
 * the `Firestore` instance, the wall clock and the seq clock. `table-store.ts` takes all three
 * as arguments precisely so it can be driven by fakes in a unit test, and so the seam that
 * reaches for `@/lib/firebase` is one file wide.
 *
 * One listener per mounted screen (golden rule 24): the store is created while rendering and
 * connected from an effect, so a remount — StrictMode's double-mount above all — re-opens the
 * listener its own cleanup closed.
 */
import { useEffect, useMemo } from "react";
import { useStore } from "zustand";
import { CORE_MECHANICS } from "@/data/combat/core-catalogue";
import { buildCatalogue } from "@/lib/combat/catalogue";
import { createSeqClock } from "@/lib/combat-io";
import { db } from "@/lib/firebase";
import {
  createTableStore,
  liveTableRef,
  type TableRole,
  type TableState,
} from "./table-store";

/**
 * The static catalogue, conformed once for the whole app: the `core:*` set every creature has
 * (design §2 D2). Every OTHER executable mechanic rides the encounter log, so this never grows
 * with the bestiary and never makes the fold depend on what a client happens to have loaded.
 */
const { catalogue } = buildCatalogue(CORE_MECHANICS);

/**
 * Subscribe to the campaign's one live table and fold it.
 *
 * `role` is data, not a privilege: `dm` is `uid === campaign.dmUid || profile.role === "admin"`
 * (design §2 D6), and the rules — not this hook — are what actually permit a write.
 */
export function useTable(campaignId: string, role: TableRole): TableState {
  const { uid, dm } = role;
  const store = useMemo(
    () =>
      createTableStore({
        db,
        ref: liveTableRef(db, campaignId),
        role: { uid, dm },
        catalogue,
        seq: createSeqClock(uid),
        now: Date.now,
      }),
    [campaignId, uid, dm]
  );
  useEffect(() => store.getState().connect(), [store]);
  return useStore(store);
}
