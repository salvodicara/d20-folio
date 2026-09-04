/**
 * `LabelId` → text, for the whole play surface.
 *
 * The engine is locale-free by construction: an `Entity`, a `Mechanic` and a receipt carry
 * STABLE ids, never display strings (golden rule 7). Somebody has to turn those ids into words,
 * and this is the one place that does it — the log presenter takes this function as its `labels`
 * argument, and every component that shows a creature's or an action's name goes through it too,
 * so a language switch re-labels the whole screen from the same rule.
 *
 * The forms it resolves, in the order it tries them:
 *
 * | Form                                    | Minted by                       | Resolved from                |
 * | --------------------------------------- | ------------------------------- | ---------------------------- |
 * | a `MechanicId` in `state.mechanics`     | the log presenter               | that mechanic's own label    |
 * | `srd:<kind>:<key>:<field>`              | `projectCharacter`              | the SRD catalogue            |
 * | `ui:<key>`                              | `projectCharacter`              | the chrome catalogue         |
 * | `custom:<text>`                         | `projectCharacter` (homebrew)   | verbatim — the user's words  |
 * | `action:<rowId>`                        | `projectCharacter` (literals)   | the `play.action` shard      |
 * | `character:<characterId>`               | `projectCharacter`              | the roster the host passes   |
 * | `monster:<srdId>#<ordinal>`             | `AddCreature` (this stage)      | the SRD catalogue + ordinal  |
 * | `<srdId>.actions.<entryId>`             | `monster-adapter`               | the SRD catalogue            |
 * | `core:<name>`, `grip:<name>`            | the core catalogue / the adapter| the `play` shard             |
 *
 * Nothing here throws: an id it does not recognise comes back as itself. A missing label is a
 * defect to see on the screen, never a crash in the middle of a fight.
 */
import { localizeSrd } from "@/i18n/resolver";
import type { SrdKind } from "@/i18n/srd-en";
import type { Locale } from "@/lib/locale";
import type { LabelId, MechanicId } from "@/lib/combat/ids";
import type { Mechanic } from "@/lib/combat/mechanic";
import type { TranslateFn } from "@/lib/views/encounter-log-view";

/** The monster-entry sections whose ids are already SRD catalogue keys. */
const MONSTER_SECTIONS =
  /^[^:\s]+\.(actions|bonusActions|reactions|traits|legendaryActions)\./;

/** The kinds `localizeSrd` can resolve (`SrdKind`), as a runtime test: a persisted label id is
 *  a string from another build, so it is TESTED against the set, never asserted into it. */
const SRD_KINDS: ReadonlySet<string> = new Set<SrdKind>([
  "spell",
  "feat",
  "race",
  "background",
  "condition",
  "equipment",
  "magic-item",
  "maneuver",
  "metamagic",
  "invocation",
  "class",
  "subclass",
  "class-feature",
  "weapon-mastery",
  "language",
  "proficiency",
  "weapon-property",
  "beasts",
  "monster",
]);

export interface PlayLabelArgs {
  readonly t: TranslateFn;
  readonly locale: Locale;
  /** The table's carried definitions (`FoldedState.mechanics`) — a mechanic id resolves to the
   *  label the projection gave it. */
  readonly mechanics: Readonly<Record<MechanicId, Mechanic>>;
  /** Character id → the hero's name, from the campaign's member snapshots. */
  readonly characters: Readonly<Record<string, string>>;
}

/** `monster:<srdId>#<ordinal>` — the id `AddCreature` mints so two ogres are tellable apart. */
export function monsterLabelId(srdId: string, ordinal: number): LabelId {
  return `monster:${srdId}#${ordinal}`;
}

export function createPlayLabels(args: PlayLabelArgs): (label: LabelId) => string {
  const { t, locale, mechanics, characters } = args;

  const srd = (kind: string, key: string, field: string): string | null =>
    SRD_KINDS.has(kind) ? localizeSrd(kind as SrdKind, key, field, locale) : null;

  const resolve = (label: LabelId, depth: number): string => {
    // A mechanic id: the log presenter hands them in directly. One hop only — a mechanic's
    // label is a label id, never another mechanic id.
    if (depth === 0) {
      const carried = mechanics[label]?.label;
      if (carried !== undefined) return resolve(carried, depth + 1);
    }

    if (label.startsWith("srd:")) {
      const [, kind, key, field] = label.split(":");
      const text = kind && key && field ? srd(kind, key, field) : null;
      return text ?? label;
    }
    if (label.startsWith("ui:")) return t(label.slice(3));
    if (label.startsWith("custom:")) return label.slice(7);
    if (label.startsWith("character:")) {
      const id = label.slice("character:".length);
      return characters[id] ?? t("play.label.unknownCharacter");
    }
    if (label.startsWith("monster:")) {
      const [id, ordinal] = label.slice("monster:".length).split("#");
      const name = id ? srd("monster", id, "name") : null;
      if (name === null) return label;
      const n = Number(ordinal);
      return Number.isFinite(n) && n > 1 ? `${name} ${n}` : name;
    }
    if (label.startsWith("core:")) return t(`play.core.${label.slice(5)}`);
    if (label.startsWith("grip:")) return t(`play.grip.${label.slice(5)}`);
    if (label.startsWith("action:")) {
      // An engine-authored bilingual literal keyed by the sheet's own row id. The `play`
      // shard carries the rows this surface can name; anything else falls back to the id,
      // which is exactly what a missing entry should look like.
      const key = `play.action.${label.slice(7)}`;
      const text = t(key);
      return text === key ? label.slice(7) : text;
    }
    if (MONSTER_SECTIONS.test(label)) return srd("monster", label, "name") ?? label;
    return label;
  };

  return (label) => resolve(label, 0);
}
