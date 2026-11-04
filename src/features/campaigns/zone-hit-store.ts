/**
 * My zones' turn-change questions (M9, `zoneTurnHits`): «Goblin finisce il turno: è
 * dentro Guardiani Spirituali?». They wait under the zone on Play until answered
 * («Dentro: tira» opens the tray, «Fuori» lets it go), until the zone ends, or until
 * the next turn change brings its own questions.
 */
import { create } from "zustand";

import type { ZoneTurnHit } from "@/lib/zones";

export interface PendingZoneHit extends ZoneTurnHit {
  key: string;
  creatureName: string;
}

interface ZoneHitStore {
  hits: PendingZoneHit[];
  /** A turn changed: these are the questions now. */
  turnChanged: (hits: PendingZoneHit[]) => void;
  remove: (key: string) => void;
  /** Keep only the questions of zones still on the field. */
  keepZones: (zoneIds: ReadonlySet<string>) => void;
}

export const useZoneHitStore = create<ZoneHitStore>((set) => ({
  hits: [],
  turnChanged: (hits) => set({ hits }),
  remove: (key) => set((s) => ({ hits: s.hits.filter((h) => h.key !== key) })),
  keepZones: (zoneIds) =>
    set((s) => {
      const hits = s.hits.filter((h) => zoneIds.has(h.zone.id));
      return hits.length === s.hits.length ? s : { hits };
    }),
}));
