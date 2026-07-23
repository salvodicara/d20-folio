/**
 * Toast intents — the toasts-as-data contract (docs/ARCHITECTURE.md).
 *
 * The store/engine emits a STRUCTURED intent instead of a localized string: a
 * `kind` discriminant plus raw args (numbers + stable ids / stored strings, never
 * translatable display prose). The UI layer (`UndoToasts` via `useToasts`)
 * localizes it at render through `lib/views/toast-intent.ts`. Living in `types/`
 * keeps the store (engine-core) free of any `lib/views` dependency while the
 * presenter that consumes this type lives in the views layer.
 *
 * NOTE on the concentration `spell` fields: `session.concentration` is a stored
 * free-text spell label (not an id in the current schema), so it passes through
 * verbatim — it is stored user data, not a translatable SRD string. The id args
 * (`conditionId`, `defenseId`) resolve to localized names in the view.
 */
import type { SessionDefenseKind } from "@/types/character";

export type ToastIntent =
  | { kind: "concentration-dropped"; spell: string }
  | {
      kind: "concentration-save";
      spell: string;
      dc: number;
      /**
       * The character's CON-save total for THIS save — base CON save plus the
       * concentration-only grant bonus (Bladesong Focus +INT, War Caster-style
       * riders via `resolveConcentrationSaveBonus`). Raw number; the view
       * formats the sign (AX exposure audit).
       */
      saveBonus: number;
      /**
       * RA-15 — the character has NET Advantage on this CON save to maintain
       * Concentration (War Caster / Eldritch Mind). The view adds one word.
       */
      advantage: boolean;
    }
  | { kind: "concentration-replaced"; previous: string; next: string }
  | { kind: "stopped-concentrating"; spell: string }
  | { kind: "condition-removed"; conditionId: string }
  /**
   * PLAY-NO-EDIT — a session defense chip was removed (the play-time mirror of
   * `condition-removed`). `defenseId` is a stable id: a `DamageType` for the
   * damage kinds, a `ConditionId` for `conditionImmunity` — the view resolves
   * the localized name.
   */
  | { kind: "defense-removed"; defenseKind: SessionDefenseKind; defenseId: string };
