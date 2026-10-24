/**
 * @d20-folio/core — the Folio rules engine as a library (Folio Core API step 2).
 *
 * The same code the app runs, SRD-only (the private content pack is never bundled):
 *
 *   - **Characters** — `parseCharacter(json)` reads a Folio character export (schema 3),
 *     `deriveCharacter(doc)` computes its sheet (abilities, saves, skills, passives,
 *     AC, HP, initiative, speeds, senses, spell DC/attack, defenses),
 *     `serializeCharacter(doc)` writes it back.
 *   - **Rules grammar** — `compileGrant` turns a catalogue Grant into generic rules,
 *     `foldRules` folds them into plain values read with `ruleNumber` / `ruleFlag`.
 *   - **Activities** — everything a creature can do (cast a spell, use a feature,
 *     make a monster's attack) in one shape: `catalogueActivities()` lists the whole
 *     SRD's, and the translators read one catalogue entry each.
 *   - **Session log** — `foldSession` applies corrections and retractions to a play
 *     log, `buildReport` turns it into a round-by-round report.
 *
 * The SRD catalogue itself ships as static JSON (`/srd/v1/*.json`, see
 * `scripts/export-srd-catalogue.ts`). Built by `pnpm core:build`.
 */

export { deriveCharacter, type CharacterSheet } from "@/lib/views/derive-character";
export {
  parseCharacter,
  serializeCharacter,
  SCHEMA_VERSION,
  type ImportResult,
  type ImportError,
} from "@/lib/character-codec";
export type { CharacterDoc, CharacterData, SessionState } from "@/types/character";

export {
  compileGrant,
  foldRules,
  ruleNumber,
  ruleValue,
  ruleFlag,
  ruleFlagIds,
  ruleNumberIds,
  type Rule,
  type RuleTarget,
  type RuleValues,
} from "@/lib/rules";
export type { Grant } from "@/lib/grant-schema";

export {
  activityFromBeastAttack,
  activityFromCompanionAttack,
  activityFromItemActivation,
  translateAction,
  translateMonsterEntry,
  translateSpell,
  translateWeapon,
  type Activity,
  type ActivityCost,
  type ActivityEffect,
  type ActivityGap,
  type ActivitySource,
  type ActivityTarget,
  type ActivityTranslation,
} from "@/lib/activities";
export { catalogueActivities } from "@/lib/activities/catalogue";

export {
  foldSession,
  buildReport,
  type LogItem,
  type PlayEvent,
  type PlayEventKind,
  type SessionEntry,
  type ReportSection,
} from "@/lib/session-log";

// ── Since 0.24.1 (2026-10-24): the pure core the new app is built on ──────────

/** Every sheet number as its total and the parts it comes from (locale-free). */
export {
  sheetNumbers,
  type Explained,
  type SheetNumbers,
} from "@/lib/views/sheet-numbers";

/** Shared combat that starts on the first initiative roll and never blocks: anyone
 *  passes the turn, a pass goes back, an ended fight reopens. */
export {
  canAdvanceTurn,
  encounterEndReason,
  endCombat,
  IDLE_END_MS,
  passTurn,
  reopenCombat,
  rollInitiative,
  touch,
  turnBack,
  type RollInitiativeInput,
} from "@/features/campaigns/encounter-lifecycle";
export type {
  EncounterClock,
  EncounterEndReason,
  EncounterEnded,
  EncounterState,
} from "@/types/campaign";

/** The treasury: one owner per coin and item, logged moves, every move undoable. */
export {
  applyMove,
  campaignHoldings,
  COINS,
  emptyPurse,
  lootMoves,
  ownerKey,
  purseValueCp,
  reverseMove,
  type CampaignHoldings,
  type Holdings,
  type LootAssignment,
  type Purse,
  type TreasuryMove,
  type TreasuryOutside,
  type TreasuryOwner,
} from "@/lib/treasury";
export {
  applyItemMove,
  reverseItemMove,
  type ItemHoldings,
  type ItemMove,
  type TreasuryItem,
} from "@/lib/treasury-items";

/** Notes written in play: @who, #where and !important read from the text, with
 *  their time, fight and round; private notes are the author's alone. */
export {
  noteLines,
  parseNote,
  resolveMentions,
  type NoteLine,
  type NoteMarks,
} from "@/lib/session-log/notes";
export {
  authorDiarioNotes,
  privateNoteDraft,
  privateNoteLines,
  type PrivateNote,
  type PrivateNoteLine,
} from "@/lib/session-log/private-notes";
