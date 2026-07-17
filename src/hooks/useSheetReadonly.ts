/**
 * useSheetReadonly — T4 (DM sees full party sheets).
 *
 * The ONE signal every cockpit surface reads to decide whether to render its edit
 * / play-action affordances. It mirrors the character store's `readonly` flag,
 * which `loadReadonly()` sets when a DM opens a member's sheet (and which makes
 * every store mutation inert). Components hide buttons / show static read views
 * when this is `true`; the store guard is the defense-in-depth backstop behind
 * them. A plain selector so a surface re-renders only when readonly flips.
 */

import { useCharacterStore } from "@/stores/characterStore";

export function useSheetReadonly(): boolean {
  return useCharacterStore((s) => s.readonly);
}
