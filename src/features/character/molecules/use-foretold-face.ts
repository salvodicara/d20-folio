/**
 * A recorded d20 (Portent: «replace that roll with one of your foretelling rolls») picked
 * as the roll of a classic d20 entry: which one is picked, and spending exactly that one
 * when the roll is applied. Typing another face drops the pick (the caller calls `drop`).
 */
import { useState } from "react";

import { recordedD20Faces, type RecordedD20Face } from "@/lib/play/tracker-rolls";
import { useCharacterStore } from "@/stores/characterStore";
import type { CharacterDoc } from "@/types/character";

export interface ForetoldFace {
  recorded: RecordedD20Face[];
  picked: RecordedD20Face | null;
  /** Pick a recorded roll (again: unpick). */
  choose: (face: RecordedD20Face) => void;
  drop: () => void;
  /** Spend the picked roll; its undo, or null when none was picked. */
  spend: () => (() => void) | null;
}

export function useForetoldFace(doc: CharacterDoc | null): ForetoldFace {
  const [picked, setPicked] = useState<RecordedD20Face | null>(null);
  return {
    recorded: doc ? recordedD20Faces(doc) : [],
    picked,
    choose: (face) =>
      setPicked((now) =>
        now?.trackerId === face.trackerId && now.index === face.index ? null : face
      ),
    drop: () => setPicked(null),
    spend: () => {
      if (!picked) return null;
      setPicked(null);
      return useCharacterStore
        .getState()
        .spendTrackerRoll(picked.trackerId, picked.index);
    },
  };
}
