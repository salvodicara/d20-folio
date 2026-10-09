// Type-only consumer: compiles against the emitted declarations alone (no app paths),
// proving the published types are self-contained. Checked by `pnpm core:build`.
import {
  deriveCharacter,
  parseCharacter,
  type CharacterSheet,
  type CharacterDoc,
} from "@d20-folio/core";

export function sheetOf(json: string): CharacterSheet | null {
  const parsed = parseCharacter(json);
  if (!parsed.success) return null;
  const doc: CharacterDoc = {
    id: "x",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...parsed.doc,
  };
  return deriveCharacter(doc);
}
