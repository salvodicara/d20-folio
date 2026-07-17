/**
 * Resolve `SrdFeatureRef[]` → `Array<{ id, name, grants }>` for the
 * declarative grants pipeline.
 *
 * Each ref's `srdId` is looked up across class features, feats, and race
 * traits. Custom features carry no grants (they have a free-form schema
 * that the grants type union doesn't model) and are skipped.
 *
 * Lives in its own module so creation, level-up, and any future consumer
 * (e.g. the sheet header reading senses) all share the same resolution
 * path. Keeps the per-page imports trivial — they don't need to pull the
 * SRD indices themselves; the shared `getSrdFeatureSource` does the lookup.
 */
import type { GrantSource, Grant } from "@/lib/grants";
import type {
  SrdFeatureRef,
  CustomFeature,
  SrdEquipmentRef,
  CustomEquipment,
  SrdSpellRef,
  CustomSpell,
  ClassEntry,
} from "@/types/character";
import { getSrdFeatureSource, srdRefForFeatureSource } from "@/lib/srd-feature-lookup";
import { attunementSatisfied } from "@/lib/attunement";
import { getMagicItem } from "@/data/magic-items";
import { getSpellById } from "@/data/spells";
import { getRace, raceFeatureIndex, rawRaceTraitCatKey } from "@/data/races";
import { SRD_INVOCATIONS } from "@/data/invocations";
import { SRD_MANEUVERS } from "@/data/maneuvers";
import { METAMAGIC_BY_ID } from "@/data/metamagic";
import { findBackground } from "@/data/backgrounds";
import { getClassTable } from "@/data/classes";
import type { ToolChoiceContext } from "@/data/background-equipment";
import { toolEnNameById, umbrellaToolChoiceOptions } from "@/lib/tool-names";
import type { SrdRaceTrait } from "@/data/types";

const INVOCATION_BY_ID = new Map(SRD_INVOCATIONS.map((inv) => [inv.id, inv]));
const MANEUVER_BY_ID = new Map(SRD_MANEUVERS.map((m) => [m.id, m]));

/**
 * The persisted runtime/session id for a race trait — `race:<raceId>:<trait.id>`
 * (live session data; pinned/spent tracker + action state key off it). `trait.id`
 * is the trait's STABLE catalogue-key slug (e.g. `relentless-endurance`) — a
 * locale-free handle, so the id NEVER embeds an English display name (golden rules
 * 12 + 22: the code speaks only ids). The single source of truth for this id
 * shape — every engine site that resolves a race trait's session id routes here.
 *
 * A doc written before this change stored the legacy `race:<raceId>:<EN name>`
 * form; it is conformed to this id form on read at the codec boundary (golden rule
 * 17 — see `conformRaceTraitSessionIds`), so no live user loses tracker state.
 */
export function raceTraitSessionId(raceId: string, trait: SrdRaceTrait): string {
  return `race:${raceId}:${trait.id}`;
}

/**
 * The Combat Superiority feature whose Superiority Dice tracker every learned
 * maneuver spends. A learned maneuver's `granted-action` declares a
 * `{ kind: "tracker", trackerId }` cost pointing here, exactly mirroring the
 * Channel Divinity `costTracker` linkage on cleric/paladin actions.
 */
const COMBAT_SUPERIORITY_FEATURE_ID = "fighter-battle-master-combat-superiority";

/**
 * MANEUVER → GRANT seam. Resolves each LEARNED Fighter maneuver id
 * (`character.maneuverChoices`, set by the maneuver picker) to its SRD row and
 * emits a `granted-action` grant per maneuver — so each known maneuver surfaces
 * on the Combat page as a usable option that spends one Superiority Die. The
 * cost is a `tracker` CostSpec pointing at the Combat Superiority feature's
 * Superiority Dice (the same linkage pattern as Channel Divinity's
 * `costTracker`), so using a maneuver decrements that shared pool.
 *
 * UNLEARNED maneuvers never surface: only ids present in `maneuverChoices`
 * produce a source; unknown ids are skipped defensively.
 *
 * Save-forcing maneuvers (Trip / Disarming / Pushing → STR; Goading / Menacing
 * → WIS) carry `saveAbility` so the consumer can compute the maneuver save DC
 * (`maneuverSaveDc`, 8 + PB + the better of STR/DEX). Reaction maneuvers (Parry,
 * Riposte) get a `trigger`; the effect text is the maneuver description.
 */
export function resolveGrantSourcesForManeuvers(
  maneuverIds: ReadonlyArray<string>
): GrantSource[] {
  const sources: GrantSource[] = [];
  for (const id of maneuverIds) {
    const maneuver = MANEUVER_BY_ID.get(id);
    if (!maneuver) continue;
    const trigger =
      maneuver.slot === "reaction"
        ? maneuver.id === "parry"
          ? {
              en: "when another creature damages you with a melee attack roll",
              it: "quando un'altra creatura ti infligge danni con un tiro per colpire in mischia",
            }
          : {
              en: "when a creature misses you with a melee attack roll",
              it: "quando una creatura ti manca con un tiro per colpire in mischia",
            }
        : undefined;
    sources.push({
      id: maneuver.id,
      // The runtime granted-action this builds is a 1:1 projection of the maneuver
      // ENTITY plus an engine-authored reaction trigger. Its display name/
      // description are NOT keyed under a positional `.grants.<seg>` path, so the
      // grant carries no localizable text — DORMANT: `grantedActions` has no UI
      // consumer; the maneuver picker localizes off the `maneuver` catalogue
      // (`localizeSrd("maneuver", id, …)`) directly. The trigger BiText is the one
      // engine-authored literal that stays inline.
      grants: [
        {
          type: "granted-action",
          slot: maneuver.slot,
          cost: {
            kind: "tracker",
            trackerId: COMBAT_SUPERIORITY_FEATURE_ID,
            amount: 1,
          },
          ...(trigger ? { trigger } : {}),
          ...(maneuver.save ? { saveAbility: maneuver.save } : {}),
        },
      ],
    });
  }
  return sources;
}

/**
 * Returns the resolved grant sources for an array of feature refs (ignoring
 * any custom features). Order is preserved.
 */
export function resolveGrantSourcesForFeatures(
  refs: ReadonlyArray<SrdFeatureRef | CustomFeature>
): GrantSource[] {
  const sources: GrantSource[] = [];
  for (const f of refs) {
    if ("custom" in f) continue;
    const src = getSrdFeatureSource(f.srdId);
    if (!src) continue;
    sources.push({
      id: "id" in src ? src.id : f.srdId,
      grants: src.grants,
      ref: srdRefForFeatureSource(src),
    });
  }
  return sources;
}

/**
 * L2 — equipment → grant pipeline. Resolves each EQUIPPED, attunement-satisfied
 * SRD equipment ref to its magic-item row and emits that item's grants as a
 * GrantSource, so a magic item's resistances / senses / speeds / free-casts /
 * advantage / condition-immunity flow through `evaluateGrants` like any other
 * source. (AC bonuses are still applied by `computeAC` reading `ref.acBonus`;
 * an `ac-bonus` grant here lands in the unconsumed `acBonus` aggregate and is
 * harmless — no double-count.)
 *
 * Activity gate mirrors `computeAC` EXACTLY (both call `attunementSatisfied`) so
 * an item that contributes AC and an item that contributes other effects share
 * one rule:
 *   - `equipped === true`  (worn / wielded), AND
 *   - attunement satisfied — an attunement-required item (`attunement: true` in
 *     its SRD data) grants nothing until `attuned === true` (`undefined` = never
 *     attuned = inert).
 * Custom equipment carries no SRD grants and is skipped.
 */
export function resolveGrantSourcesForEquipment(
  equipment: ReadonlyArray<SrdEquipmentRef | CustomEquipment>
): GrantSource[] {
  const sources: GrantSource[] = [];
  for (const e of equipment) {
    if ("custom" in e) continue;
    if (e.equipped !== true) continue; // only worn/wielded items are active
    if (!attunementSatisfied(e)) continue; // attunement-required, not yet attuned
    const item = getMagicItem(e.srdId);
    if (!item?.grants?.length) continue;
    sources.push({
      id: item.id,
      grants: item.grants,
      ref: { kind: "magic-item", key: item.id },
    });
  }
  return sources;
}

/**
 * PROSE sweep (2026-06-10) — spells with STANDING while-active effects → grant
 * sources. A buff spell whose printed effect is a standing stat change for its
 * duration (Mage Armor's AC formula, Fly's Fly Speed, Stoneskin's resistances,
 * Foresight's advantage, …) carries those facts as `while-active` grants on
 * its `SrdSpellData.grants`. A PREPARED (or always-prepared) spell whose data
 * carries grants becomes a source, which lands its toggle in
 * `activatableGroups` — the SAME ActivatableFeaturesBar/`session.activeFeatures`
 * seam items like Boots of Speed already use. Default off → casting is still
 * the player's act; flipping the toggle applies the standing effect for the
 * duration (override-first; the engine never tracks the clock).
 *
 * Cast-time effects (damage/heal/single saves) stay on the structured spell
 * fields the cast model consumes — NOT duplicated here (spell discipline (b)).
 */
export function resolveGrantSourcesForSpells(
  spells: ReadonlyArray<SrdSpellRef | CustomSpell>
): GrantSource[] {
  const sources: GrantSource[] = [];
  const seen = new Set<string>();
  for (const s of spells) {
    if ("custom" in s) continue;
    if (s.prepared !== true && s.alwaysPrepared !== true) continue;
    if (seen.has(s.srdId)) continue;
    const spell = getSpellById(s.srdId);
    if (!spell?.grants?.length) continue;
    seen.add(s.srdId);
    sources.push({
      id: spell.id,
      grants: spell.grants,
      ref: { kind: "spell", key: spell.id },
    });
  }
  return sources;
}

/**
 * L1/L6 — species/race traits → grant sources. The race's traits carry
 * declarative grants (darkvision, damage-resistance, speeds, condition
 * immunities) that must flow to the sheet-wide derivations (Senses & Defenses)
 * even though race traits do NOT live in `character.features`. Without this the
 * Senses & Defenses panel silently vanished on every species character
 * (e.g. Lyra the Elf showed no Darkvision 60 ft). The race id is matched
 * case-insensitively because the doc may store "Elf" while the SRD id is "elf".
 */
export function resolveGrantSourcesForRace(raceId: string | undefined): GrantSource[] {
  if (!raceId) return [];
  const race = getRace(raceId) ?? getRace(raceId.toLowerCase());
  if (!race) return [];
  const sources: GrantSource[] = [];
  for (const trait of race.traits) {
    // Include a trait that carries grants OR mechanics. A tracker/action-only
    // trait (Orc Adrenaline Rush / Relentless Endurance) has no `grants` but must
    // still surface as a feature; its mechanics flow separately via
    // `resolveTrackers` / `resolveActions` (which scan the race's traits).
    if (!trait.grants?.length && !trait.mechanics) continue;
    sources.push({
      // `race:<id>:<trait.id>` — the persisted session id (live data); the third
      // segment is the trait's stable slug, never an English display name (GR 12+22).
      id: raceTraitSessionId(race.id, trait),
      grants: trait.grants ?? [],
      ref: { kind: "race", key: rawRaceTraitCatKey(race.id, trait) },
    });
  }
  return sources;
}

/**
 * INVOCATION → GRANT seam. Resolves each chosen Eldritch Invocation id
 * (`character.invocationChoices`, set by the Warlock invocation picker) to its
 * SRD row and emits that invocation's grants as a GrantSource — so a Warlock's
 * Devil's Sight (darkvision 120), Witch Sight (truesight 30), Gift of the
 * Depths (swim speed), etc. flow through `evaluateGrants` like any other
 * source. Invocations without grants (free-cast / damage-rider invocations,
 * which resolve through the cast-options / weapon pipelines instead) emit no
 * source. Unknown ids are skipped defensively.
 */
export function resolveGrantSourcesForInvocations(
  invocationIds: ReadonlyArray<string>
): GrantSource[] {
  const sources: GrantSource[] = [];
  for (const id of invocationIds) {
    const inv = INVOCATION_BY_ID.get(id);
    if (!inv?.grants?.length) continue;
    sources.push({
      id: inv.id,
      grants: inv.grants,
      ref: { kind: "invocation", key: inv.id },
    });
  }
  return sources;
}

/**
 * METAMAGIC → GRANT seam. Resolves each chosen Metamagic option id
 * (`ClassEntry.metamagicChoices`, set by the Sorcerer metamagic picker) to its
 * SRD row and emits that option's grants as a GrantSource — closing the last
 * source-seam gap (§5.2), so Metamagic is a grant source exactly like Eldritch
 * Invocations + Fighter maneuvers already are.
 *
 * The ten core 2024 Metamagic options are PER-CAST spell modifiers (resolved at
 * the cast layer), so they carry no standing `grants` today and emit no source —
 * but the seam is now LIVE: a metamagic option that declares a standing grant
 * (a future option, a homebrew/subclass metamagic) flows through `evaluateGrants`
 * by data alone, no further wiring. Options without grants / unknown ids are
 * skipped defensively, mirroring `resolveGrantSourcesForInvocations`.
 */
export function resolveGrantSourcesForMetamagic(
  metamagicIds: ReadonlyArray<string>
): GrantSource[] {
  const sources: GrantSource[] = [];
  for (const id of metamagicIds) {
    const opt = METAMAGIC_BY_ID.get(id);
    if (!opt?.grants?.length) continue;
    sources.push({
      id: opt.id,
      grants: opt.grants,
      ref: { kind: "metamagic", key: opt.id },
    });
  }
  return sources;
}

/**
 * The TOOL grant a background carries, derived from its `toolProficiency` string
 * — built in the ENGINE (not the data module) because it needs the SRD equipment
 * catalogue (`@/i18n/srd-en`, via `@/lib/tool-names`): reading `srd-en` from a
 * `src/data/**` module drags the whole EN SRD corpus into that data chunk (the
 * `bundle-budget.guard` regression #107 produced). A "Choose one kind of <X>"
 * UMBRELLA becomes a `choice-tool-proficiency` over its category's concrete
 * pickable ids (the wizard surfaces a pick — never the umbrella as a final
 * proficiency); a concrete tool stays a fixed `tool-proficiency` carrying the tool
 * string verbatim (the FACT anchor `displayToolProficiencies` resolves + localizes
 * by id). Returns `undefined` for a background with no tool. The SINGLE source of
 * a background's tool grant — both {@link resolveGrantSourcesForBackground} (which
 * folds it into the background's grants) and {@link toolChoiceContextForBackground}
 * (which reads its `choice-tool-proficiency` options) route through here.
 */
function backgroundToolGrant(toolProficiency: string | undefined): Grant | undefined {
  const tool = toolProficiency?.trim();
  if (!tool) return undefined;
  const options = umbrellaToolChoiceOptions(tool);
  return options
    ? { type: "choice-tool-proficiency", options, amount: 1 }
    : { type: "tool-proficiency", tool };
}

/**
 * The full grant list a background contributes: its data-baked SKILL grants plus
 * the engine-derived TOOL grant (see {@link backgroundToolGrant}). The ONE place
 * the background's complete grant set is assembled, so both the GrantSource and
 * the `fromToolChoice` context resolve the identical grants.
 */
function backgroundGrants(bg: {
  grants?: ReadonlyArray<Grant>;
  toolProficiency?: string;
}): ReadonlyArray<Grant> {
  const toolGrant = backgroundToolGrant(bg.toolProficiency);
  return toolGrant ? [...(bg.grants ?? []), toolGrant] : (bg.grants ?? []);
}

/**
 * A4 — BACKGROUND → GRANT seam. Resolves a character's `background` value to its
 * SRD row (`findBackground` handles both the id and the EN/IT-name forms the
 * field takes across creation paths) and emits the background's idempotent,
 * set-union-safe grants (skill- and tool-proficiency) as a GrantSource — so the
 * background's fixed benefits flow through `evaluateGrants` like any other
 * source instead of living only in the creation-time snapshot.
 *
 * REGRESSION-SAFE BY CONSTRUCTION: the grants mirror the same fields the
 * snapshot consumed (`skillProficiencies` via the shared `skillNameToId`,
 * `toolProficiency` verbatim), and the consumer merges them through
 * `mergeSkillProficiencies` (no-downgrade union) / `mergeToolProficiencies`
 * (substring dedupe) — both of which leave an already-present entry untouched.
 * The ASI and origin feat are NOT modelled here (non-idempotent → would
 * double-apply); they stay creation-owned.
 *
 * Unknown / empty background strings (custom backgrounds, legacy blanks) emit
 * no source.
 */
export function resolveGrantSourcesForBackground(
  background: string | undefined
): GrantSource[] {
  if (!background) return [];
  const bg = findBackground(background);
  if (!bg) return [];
  const grants = backgroundGrants(bg);
  if (!grants.length) return [];
  return [
    {
      id: bg.id,
      grants,
      ref: { kind: "background", key: bg.id },
    },
  ];
}

/**
 * The CLASS's own level-1 grants (`SrdClassTable.grants`) — currently the
 * level-1 tool-proficiency CHOICE a few classes grant ("choose Artisan's Tools
 * or a Musical Instrument" — Monk; "choose 3 Musical Instruments" — Bard),
 * modelled as a `choice-tool-proficiency` grant so the proficiency is DERIVED +
 * surfaced as a creation pick (mirrors `resolveGrantSourcesForBackground`). The
 * grant carries no localizable display strings (tool labels come from the tool
 * catalogue), so the source omits `ref`. Most classes return nothing.
 */
export function resolveGrantSourcesForClass(classId: string | undefined): GrantSource[] {
  if (!classId) return [];
  const cls = getClassTable(classId);
  if (!cls?.grants?.length) return [];
  return [{ id: `class:${cls.id}`, grants: cls.grants }];
}

/**
 * SOURCE-AGNOSTIC core: build the {@link ToolChoiceContext} a `fromToolChoice`
 * starting-equipment marker resolves against, from ANY grant source — its
 * `choice-tool-proficiency` grant options PLUS the player's CURRENT picks for
 * that source's tool slot(s). The SAME picks drive the derived proficiency
 * (golden rule 6 — one pick, both surfaces), so the chosen pack member and the
 * proficiency can never disagree.
 *
 * `sourceId` is the source's grant-namespace (`class:<id>`, `bg:<id>`, a feat
 * id, …) — the SAME id `resolveGrantSources*` stamps and `collectChoiceSlots`
 * uses to namespace slot ids as `<sourceId>::tool-slot-N`. So a class, a
 * background, or any future source feeds through this ONE helper with zero
 * source-specific branching. Returns `undefined` when the source grants no tool
 * choice (no marker to resolve).
 */
export function toolChoiceContextForSource(
  sourceId: string,
  grants: ReadonlyArray<Grant> | undefined,
  toolPicks: Record<string, ReadonlyArray<string>>
): ToolChoiceContext | undefined {
  const grant = grants?.find((g) => g.type === "choice-tool-proficiency");
  if (!grant) return undefined;
  const prefix = `${sourceId}::tool-`;
  const pickedIds = Object.entries(toolPicks)
    .filter(([slotId]) => slotId.startsWith(prefix))
    .flatMap(([, picked]) => picked);
  return { options: grant.options, pickedIds };
}

/**
 * The {@link ToolChoiceContext} for a CLASS's `fromToolChoice` marker (Monk /
 * Bard) — a thin class lookup over the source-agnostic
 * {@link toolChoiceContextForSource}. A background (or any source) with its own
 * `choice-tool-proficiency` grant + a `fromToolChoice` pack item resolves through
 * the identical core with an analogous one-line lookup (the engine is not
 * class-specific). Returns `undefined` when the class grants no tool choice.
 */
export function toolChoiceContextForClass(
  classId: string | undefined,
  toolPicks: Record<string, ReadonlyArray<string>>
): ToolChoiceContext | undefined {
  if (!classId) return undefined;
  return toolChoiceContextForSource(
    `class:${classId}`,
    getClassTable(classId)?.grants,
    toolPicks
  );
}

/**
 * The {@link ToolChoiceContext} for a BACKGROUND's `fromToolChoice` pack member —
 * the "(same as above)" instrument/set/tool a "Choose one kind of <X>" background
 * lists in its Option-A package (Entertainer, Artisan, Guard, …). A thin lookup
 * over the source-agnostic {@link toolChoiceContextForSource}, sharing the IDENTICAL
 * core with the class path so the background's chosen tool is BOTH the proficiency
 * AND the kit item (golden rule 6). The source id is the BARE background id — the
 * SAME id `resolveGrantSourcesForBackground` stamps (NOT `class:`-prefixed), so
 * `collectChoiceSlots` namespaces the slot as `<bgId>::tool-slot-0` and this helper
 * matches it. `value` accepts the id / EN-name / IT-name forms `findBackground`
 * does; returns `undefined` for a fixed-tool (non-choice) background.
 */
export function toolChoiceContextForBackground(
  value: string | undefined,
  toolPicks: Record<string, ReadonlyArray<string>>
): ToolChoiceContext | undefined {
  if (!value) return undefined;
  const bg = findBackground(value);
  if (!bg) return undefined;
  // The `choice-tool-proficiency` grant lives in the engine-assembled grant set
  // (the tool grant is derived here, not baked in the data — see backgroundGrants).
  return toolChoiceContextForSource(bg.id, backgroundGrants(bg), toolPicks);
}

/**
 * The TOOL-CHOICE grant source — the player's `choice-tool-proficiency` picks,
 * stored as STABLE IDS in `character.toolChoices` (keyed by the namespaced choice
 * slot id), DERIVED into the proficiency surface. Each picked tool id becomes a
 * `tool-proficiency` grant carrying the tool's canonical EN name (the SAME stable
 * anchor the FIXED tool grants use — `displayToolProficiencies` resolves it to the
 * id and localizes), so a chosen tool flows into `aggregate.toolProficiencies`
 * exactly like a fixed one and localizes correctly (IT "Strumenti da Fabbro").
 *
 * This is the proficiency half of the single-source contract (golden rule 6): the
 * SAME `toolChoices` ids ALSO drive the `fromToolChoice` pack item (via
 * `ToolChoiceContext.pickedIds`). An unknown id (homebrew / future tool) is
 * skipped — never leaked as a raw id. Empty / absent `toolChoices` emits nothing.
 */
export function resolveGrantSourcesForToolChoices(
  toolChoices: Record<string, ReadonlyArray<string>> | undefined
): GrantSource[] {
  if (!toolChoices) return [];
  const grants: Grant[] = [];
  const seen = new Set<string>();
  for (const ids of Object.values(toolChoices)) {
    for (const id of ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      const en = toolEnNameById(id);
      if (en) grants.push({ type: "tool-proficiency", tool: en });
    }
  }
  if (grants.length === 0) return [];
  // No `ref`: the grant carries no localizable display string (the tool label
  // comes from the tool catalogue at display, via `displayToolProficiencies`).
  return [{ id: "tool-choices", grants }];
}

/**
 * The full grant-source list for a character: class/feat/race feature sources,
 * equipped magic-item sources, PLUS chosen Eldritch Invocation sources, learned
 * maneuvers, the background's fixed proficiencies, and the player's TOOL-CHOICE
 * picks (derived from `toolChoices` ids). The canonical input to `evaluateGrants`
 * for any sheet-wide derivation (senses, resistances, proficiencies, speeds,
 * free-casts).
 *
 * Origin feats reach this through `character.features`: they are kept there as a
 * deterministic projection of the build choices (`syncOriginFeats` regenerates
 * them whenever `background`/`bgFeat`/species/`humanOriginFeat` change), so the
 * CHOICE is the single source of truth and every consumer that reads `features[]`
 * (trackers, actions, grants) stays consistent without each needing to re-derive.
 *
 * `invocationChoices` / `maneuverChoices` / `background` are optional so
 * non-Warlocks / non-Battle-Masters / background-less or legacy docs pass
 * nothing — they contribute no extra grants.
 */
export function resolveAllGrantSources(character: {
  race?: string;
  features: ReadonlyArray<SrdFeatureRef | CustomFeature>;
  equipment: ReadonlyArray<SrdEquipmentRef | CustomEquipment>;
  /** PROSE sweep — prepared buff spells with standing while-active grants. */
  spells?: ReadonlyArray<SrdSpellRef | CustomSpell>;
  /** R4 — class-scoped picks live on each entry; flattened across all of them. */
  classes?: ReadonlyArray<ClassEntry>;
  background?: string;
  /** Tool-CHOICE picks (slot id → chosen tool ids) — derived into proficiencies. */
  toolChoices?: Record<string, ReadonlyArray<string>>;
}): GrantSource[] {
  // The creation wizard stores species traits in `features[]`, but this assembler
  // ALSO resolves them from `character.race` via `resolveGrantSourcesForRace`.
  // Counting both would DOUBLE every species grant. So the race path is the single
  // source here: drop race traits from the features portion. Standalone
  // `resolveGrantSourcesForFeatures` callers (smart-tracker, level-up) keep resolving
  // race traits — they have no separate race path, so it's their source.
  const nonRaceFeatures = character.features.filter(
    (f) => "custom" in f || !raceFeatureIndex.has(f.srdId)
  );
  // R4 — invocations/maneuvers are per-class picks on `classes[]`. Flatten across
  // every entry (deduped) so a multiclass Warlock/maneuver-Fighter surfaces both.
  const invocations = flattenEntryPicks(character.classes, "invocationChoices");
  const maneuvers = flattenEntryPicks(character.classes, "maneuverChoices");
  const metamagic = flattenEntryPicks(character.classes, "metamagicChoices");
  return [
    ...resolveGrantSourcesForRace(character.race),
    ...resolveGrantSourcesForFeatures(nonRaceFeatures),
    ...resolveGrantSourcesForEquipment(character.equipment),
    ...resolveGrantSourcesForSpells(character.spells ?? []),
    ...resolveGrantSourcesForInvocations(invocations),
    ...resolveGrantSourcesForManeuvers(maneuvers),
    ...resolveGrantSourcesForMetamagic(metamagic),
    ...resolveGrantSourcesForBackground(character.background),
    ...resolveGrantSourcesForToolChoices(character.toolChoices),
  ];
}

/** Flatten a per-class pick key across all `classes[]` entries (deduped, ordered). */
export function flattenEntryPicks(
  classes: ReadonlyArray<ClassEntry> | undefined,
  key: "invocationChoices" | "maneuverChoices" | "metamagicChoices"
): string[] {
  if (!classes) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of classes) {
    for (const id of e[key] ?? []) {
      if (!seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
    }
  }
  return out;
}
