// Type-only consumer: compiles against the emitted declarations alone (no app paths),
// proving the published types are self-contained. Checked by `pnpm core:build`.
import {
  catalogueActivities,
  deriveCharacter,
  parseCharacter,
  type Activity,
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

export async function spellActivities(): Promise<Activity[]> {
  const all = await catalogueActivities();
  return all
    .map(({ activity }) => activity)
    .filter((activity) => activity.source.kind === "spell");
}

// The pure core added for the new app compiles against the published types too.
import {
  applyMove,
  emptyPurse,
  lootMoves,
  parseNote,
  rollInitiative,
  sheetNumbers,
  type EncounterState,
  type NoteMarks,
  type SheetNumbers,
} from "@d20-folio/core";

export function acTotal(doc: CharacterDoc): number {
  const numbers: SheetNumbers<unknown> = sheetNumbers(doc);
  return numbers.ac.total;
}

export function startFight(now: number): EncounterState {
  return rollInitiative(null, {
    combatantId: "pc-u1",
    pcInitiatives: { "pc-u1": 12 },
    seeds: { u1: { characterId: "c1" } },
    attachedUids: ["u1"],
    now,
  });
}

export function lootToChest(): boolean {
  const [move] = lootMoves({ gp: 10 }, { to: { kind: "chest" } }, "m1", {
    by: "u1",
    at: 1,
    note: "",
  });
  return move !== undefined && applyMove({}, move) !== null && emptyPurse().gp === 0;
}

export function marks(text: string): NoteMarks {
  return parseNote(text);
}
