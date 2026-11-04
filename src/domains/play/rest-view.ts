/**
 * The Play screen's rest dialogs (approved prototypes rest-short, rest-long), read from
 * the engine's own preview (`restPreview`), so they never promise what the rest doesn't
 * do: the Hit Point Dice a Short Rest can spend, and what either rest gives back or
 * ends, named for the table. The heal is the player's entered roll plus Constitution
 * (golden rule 21: the app never rolls for them), through `shortRestHealing`.
 */
import { canCharacterRest, isCharacterAlive } from "@/lib/character-status";
import type { Locale } from "@/lib/locale";
import { effectiveMaxHp } from "@/lib/aggregate-character";
import { hitDicePool, hitDiceTotalRange, type HitDieSize } from "@/lib/play/hit-dice";
import { longRestCharacter } from "@/lib/play/rests";
import { restPreview, type RestKind } from "@/lib/play/rest-preview";
import { shortRestHealing } from "@/lib/play/short-rest-healing";
import { deriveStatuses } from "@/lib/status";
import { grantSourceLabel, localizeTrackers } from "@/lib/views/tracker-view";
import type { CharacterDoc } from "@/types/character";

export type RestLine =
  | { kind: "hp"; from: number; to: number }
  | { kind: "slots"; amount: number; all: boolean }
  | { kind: "hit-dice"; amount: number; total: number }
  | { kind: "exhaustion"; from: number; to: number }
  | { kind: "tracker"; name: string; amount: number };

export interface RestView {
  kind: RestKind;
  /** The dice left to spend, biggest first, and how many the character has. */
  hitDice: { available: number; total: number; dice: HitDieSize[] };
  hp: { current: number; max: number };
  recovers: RestLine[];
  /** The active states the rest ends, by name. */
  ends: string[];
  /** Why the rest can't begin (2024: it needs at least 1 Hit Point, and life). */
  blocked: "zero-hp" | "dead" | null;
}

export function restView(doc: CharacterDoc, kind: RestKind, locale: Locale): RestView {
  const preview = restPreview(doc, kind);
  const { session } = doc;
  const after = kind === "long" ? longRestCharacter(doc) : null;
  const max = effectiveMaxHp(doc.character, after?.session ?? session);
  const trackers = new Map(localizeTrackers(doc, locale).map((tr) => [tr.id, tr.label]));
  const recovers: RestLine[] = [];
  let slots = 0;
  for (const r of preview.recovers) {
    if (r.kind === "hp")
      recovers.push({
        kind: "hp",
        from: session.hp.current,
        to: session.hp.current + r.amount,
      });
    else if (r.kind === "hit-dice")
      recovers.push({ kind: "hit-dice", amount: r.amount, total: preview.hitDice.total });
    else if (r.kind === "exhaustion")
      recovers.push({
        kind: "exhaustion",
        from: session.exhaustion,
        to: session.exhaustion - r.amount,
      });
    else if (r.kind === "slot") slots += r.amount;
    else
      recovers.push({
        kind: "tracker",
        name: trackers.get(r.id) ?? r.id,
        amount: r.amount,
      });
  }
  if (slots > 0) {
    const spent = Object.values(session.spellSlots).reduce((sum, s) => sum + s.used, 0);
    recovers.push({ kind: "slots", amount: slots, all: slots === spent });
  }
  const dice = hitDicePool(doc.character)
    .flatMap(({ die, count }) => Array.from({ length: count }, () => die))
    .sort((a, b) => b - a)
    .slice(0, preview.hitDice.available);
  const names = new Map(
    deriveStatuses(doc).map((s) => [s.key, grantSourceLabel(s.source, locale)])
  );
  return {
    kind,
    hitDice: { ...preview.hitDice, dice },
    hp: { current: session.hp.current, max },
    recovers,
    ends: preview.ends.map((key) => names.get(key) ?? key),
    blocked: canCharacterRest(doc.status, session)
      ? null
      : isCharacterAlive(doc.status, session)
        ? "zero-hp"
        : "dead",
  };
}

/** A Short Rest's heal for `count` dice and the roll the player typed, or null while
 *  the roll is not one those dice can make. No dice heal nothing and need no roll. */
export function shortRestHeal(
  doc: CharacterDoc,
  count: number,
  typed: string
): { heal: number | null; valid: boolean } {
  if (count <= 0) return { heal: 0, valid: true };
  const roll = Number(typed.trim());
  const range = hitDiceTotalRange(hitDicePool(doc.character), count);
  const valid =
    typed.trim() !== "" &&
    Number.isInteger(roll) &&
    roll >= range.min &&
    roll <= range.max;
  return valid
    ? { heal: shortRestHealing(doc, count, roll), valid }
    : { heal: null, valid };
}
