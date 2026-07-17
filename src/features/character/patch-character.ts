/**
 * patchCharacter — the single sheet-write seam shared across the cockpit.
 *
 * Writes a partial patch onto the loaded character through the SAME
 * `characterStore.setCharacter` path the rest of the sheet uses (Constitution #1
 * — override-first, no forked persistence). Pure call into the store, so it is
 * safe to invoke from event handlers outside React render. No-op when no
 * character is loaded.
 *
 * Extracted so the header vitals (CombatHeader), the identity rail (LeftHud), and
 * any other cockpit surface dispatch through ONE helper instead of re-declaring
 * the same three-line store write (§4.5/§4.8 — reuse, no one-offs).
 */

import { useCharacterStore } from "@/stores/characterStore";
import type { CharacterData } from "@/types/character";

export function patchCharacter(partial: Partial<CharacterData>): void {
  const state = useCharacterStore.getState();
  // T4 — inert under read-only (a DM viewing a member's sheet): no write path, and
  // crucially `setCharacter` would otherwise CLEAR the readonly flag. The UI hides
  // every inline editor in read-only mode; this is the defense-in-depth backstop.
  if (state.readonly) return;
  const doc = state.character;
  if (!doc) return;
  state.setCharacter({
    ...doc,
    character: { ...doc.character, ...partial },
  });
}
