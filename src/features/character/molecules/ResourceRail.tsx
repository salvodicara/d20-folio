/**
 * ResourceRail — the always-on Right HUD content, re-homed from the legacy
 * `GameRail` rail body and composed by `RightHud`. Four sections matching the
 * cockpit mock: **Resources** (spell slots + class trackers), **Status**
 * (concentration + conditions + exhaustion), **Defenses** (resist / immune /
 * vulnerable), and **Proficiencies** (armor / weapons / tools / languages).
 *
 * The engine seam is READ-ONLY-derive + state-binding only: `resolveTrackers` +
 * the aggregated spell-slot / conditions / exhaustion / concentration views; it
 * calls only the existing store actions (useTracker / restoreTracker,
 * add/removeCondition, setConcentration, updateSession). HP / hit dice / death
 * saves live in the center HEALTH panel, never here. The action-economy "This
 * Turn" loop and HP mutation are Phase 4 — not in this rail.
 */

import { useMemo, useState, useRef } from "react";
import { primaryClassId, totalLevel } from "@/lib/classes";
import { useTranslation } from "react-i18next";
import { Plus, Minus, X, Skull, Sparkles } from "lucide-react";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { registerUndoableToast } from "@/stores/undoStore";
import { useUIStore } from "@/stores/uiStore";
import { useLocale } from "@/hooks/useLocale";
import { useDismissOnOutside } from "@/hooks/useDismissOnOutside";
import {
  type ResolvedTracker,
  getSpellSlotTrackerRecovery,
  isBloodied,
  resolveAltRecovery,
  resolveSlotAltRecovery,
  resolveTrackers,
  armorDisadvantageClauses,
} from "@/lib/smart-tracker";
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import { ConditionEditor } from "./ConditionEditor";
import { slotUsageKey, bareSlotIsPact } from "@/lib/cast-options";
import type { AggregatedGrants } from "@/lib/grants";
import { localizeText } from "@/lib/views/srd-i18n";
import {
  applySetOverride,
  deriveAdvantageChips,
  deriveDamageSourceResistances,
  deriveDefenseKind,
  deriveFlatDamageReductions,
  displayLanguages,
  displayToolProficiencies,
  type DefenseKindView,
} from "@/lib/views/sheet-view";
import {
  activatableToggles,
  advantageChipVMs,
  auraVMs,
  concentrationLabel,
  conditionLabel,
  conditionOptions,
  incomingAttackAdvantageVMs,
  localizeTrackers,
  localizeTrackerUnit,
  potionTimerVMs,
  resolveAuraDice,
  rollFloorVMs,
  trackerRecoveryBadgeBucket,
  type AuraVM,
} from "@/lib/views/tracker-view";
import { patchCharacter } from "../patch-character";
import { OverrideChipSet, type OverrideChipOption } from "./OverrideChipSet";
import {
  effectiveAbilityScores,
  effectiveProficiencyBonus,
  hasWeaponMastery,
  isHeavyArmorEquipped,
} from "@/lib/compute";
import { getEquipment } from "@/data/equipment";
import { getClassTable } from "@/data/classes";
import { condColor, condInkColor } from "@/lib/condition-color";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { FocusMark } from "@/components/ui/folio-marks";
import { GlossaryTip } from "@/components/shared/GlossaryTip";
import { stripInline } from "@/components/shared/parseInline";
import { cn } from "@/lib/utils";
import { RailSection } from "../RailSection";
import { RailNotes } from "./RailNotes";
import { ResourceConversions } from "./ResourceConversions";
import { GrantBundleSelector } from "@/components/sheet/GrantBundleSelector";
import { ActivatableFeaturesBar } from "./ActivatableFeaturesBar";
import {
  WEAPON_PROFICIENCY_CATEGORIES,
  WEAPON_PROFICIENCY_GROUPS,
  ARMOR_PROFICIENCY_POOL,
} from "@/lib/proficiency-tokens";
import { localizeSrd } from "@/i18n/resolver";
import type { AbilityCode, DamageType, ConditionId } from "@/data/types";
import type { SessionDefenseKind } from "@/types/character";
import type { TFunction } from "i18next";
import { localeDistance } from "@/lib/utils";

/** The full DamageType enum, in the canonical order, for the #68 override pickers. */
const ALL_DAMAGE_TYPES: DamageType[] = [
  "acid",
  "bludgeoning",
  "cold",
  "fire",
  "force",
  "lightning",
  "necrotic",
  "piercing",
  "poison",
  "radiant",
  "psychic",
  "slashing",
  "thunder",
];
/** The six set-valued override maps on CharacterData (#68). */
type SetOverrideField =
  | "damageResistanceOverrides"
  | "damageImmunityOverrides"
  | "damageVulnerabilityOverrides"
  | "conditionImmunityOverrides"
  | "armorProficiencyOverrides"
  | "weaponProficiencyOverrides";

const SPELL_LEVEL_VAR: Record<number, string> = {
  1: "var(--sl-1)",
  2: "var(--sl-2)",
  3: "var(--sl-3)",
  4: "var(--sl-4)",
  5: "var(--sl-5)",
  6: "var(--sl-6)",
  7: "var(--sl-7)",
  8: "var(--sl-8)",
  9: "var(--sl-9)",
};

export function ResourceRail() {
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  const character = useCharacterStore((s) => s.character);
  const combatSelected = useCombatStore((s) => s.selected);
  const isEdit = useUIStore((s) => s.sheetMode === "edit");

  const trackers = useMemo<ResolvedTracker[]>(
    () => (character ? localizeTrackers(character, locale) : []),
    [character, locale]
  );

  // BARDTRK1 — the Bard's OWN Bardic Inspiration give-out tracker lives with the
  // other class resources (owner: keep it in Resources for consistency). The
  // Inspiration section is reserved for the universal Heroic boon + the held
  // RECEIVED die — not the give-out resource.
  const aggregate = useMemo(
    () =>
      character ? aggregateCharacterGrants(character.character, character.session) : null,
    [character]
  );

  // Durable advantage / disadvantage clauses from features & species (Barbarian
  // Danger Sense → Advantage on DEX saves, Feral Instinct → Initiative, …).
  // Attack-roll advantages surface INLINE on the action cards, so they're excluded
  // here — this rail section is the home for the save / check / initiative ones,
  // which otherwise had nowhere to render.
  const advChips = useMemo(
    () =>
      aggregate && character
        ? advantageChipVMs(
            deriveAdvantageChips(aggregate, {
              advantages: [],
              // S13 — the unproficient-armor Disadvantage (STR/DEX checks + saves;
              // the attack one surfaces inline on action cards) joins this section,
              // derived from the SAME predicate the Inventory "Untrained" gloss uses.
              disadvantages: armorDisadvantageClauses(character),
            }).filter((c) => c.rollType !== "attack"),
            locale
          )
        : [],
    [aggregate, character, locale]
  );

  // SELF-side combat downsides (Barbarian Reckless Attack: "attacks against you
  // have Advantage"). A while-active downside the player declares — surfaced in
  // the Advantages section as a clearly-framed Disadv., never enemy modeling.
  const incomingAttackNotes = useMemo(
    () =>
      aggregate
        ? incomingAttackAdvantageVMs(aggregate.incomingAttackAdvantages, locale)
        : [],
    [aggregate, locale]
  );

  // SELF-side combat BENEFITS (Blur: "attacks against you have Disadvantage").
  // The mirror of the downside above — surfaced in the same Advantages section as
  // a clearly-framed Advantage (your defenses improve). The presenter is
  // polarity-agnostic (it just localizes the clause text + the while-active flag).
  const incomingDefenseNotes = useMemo(
    () =>
      aggregate
        ? incomingAttackAdvantageVMs(aggregate.incomingAttackDisadvantages, locale)
        : [],
    [aggregate, locale]
  );

  // Active aura/emanation notes (PRIM-aura) — resolved + localized once. The
  // aggregate already gates form-bound auras on the Active Features toggles /
  // constellation choice, so this lists exactly what is emanating right now.
  const auras = useMemo(
    () =>
      character && aggregate
        ? auraVMs(aggregate.auras, totalLevel(character.character), locale)
        : [],
    [character, aggregate, locale]
  );

  // S9 — active CONSUMED buff-potion countdowns (Potion of Speed / Giant
  // Strength / …) resolved from the self-sustaining `potion:` effectTimers the
  // store armed when each potion was drunk. Localized once; rendered as small
  // duration banners reusing the same timer chrome the while-active states use.
  const potionTimers = useMemo(
    () => potionTimerVMs(character?.session.effectTimers, locale),
    [character?.session.effectTimers, locale]
  );

  // REST-frequency variant bundles (re-chosen each rest per RAW) — the
  // creation-frequency ones (lineages) are owned by the Bio tab.
  const restBundles = useMemo(
    () =>
      aggregate ? aggregate.grantBundles.filter((b) => b.choiceFrequency === "rest") : [],
    [aggregate]
  );

  // Pending spend preview from the active combat selection (read-only; empty
  // until Phase 4 wires the action economy).
  const slotTable = character?.character.spellSlots;
  const { pendingSlots, pendingTrackers } = useMemo(() => {
    // B3 — key the preview by the canonical `slotUsageKey` (the SAME key the real
    // spend writes), resolving the pool the bare-level cost will draw from via
    // `bareSlotIsPact`. Otherwise a Sorlock queuing a normal L1 cast over-previews a
    // pending dot on BOTH same-level rows (normal AND pact); now it lands only on the
    // row that will actually be spent.
    const table = slotTable ?? [];
    const slots: Record<string, number> = {};
    const tkrs: Record<string, number> = {};
    // B6 — each slot holds a LIST of committed actions this turn (Action Surge /
    // Haste); sum the pending cost across every one.
    for (const slot of ["action", "bonus", "free"] as const) {
      for (const action of combatSelected[slot]) {
        if (!action.cost) continue;
        if (action.cost.type === "spell-slot" && action.cost.key != null) {
          const level = action.cost.key as number;
          const key = slotUsageKey({ level, pactMagic: bareSlotIsPact(table, level) });
          slots[key] = (slots[key] ?? 0) + 1;
        } else if (action.cost.type === "tracker" && action.cost.key != null) {
          const id = action.cost.key as string;
          tkrs[id] = (tkrs[id] ?? 0) + 1;
        }
      }
    }
    return { pendingSlots: slots, pendingTrackers: tkrs };
  }, [combatSelected, slotTable]);

  if (!character || !aggregate) return null;

  const { character: charData, session } = character;
  // B8 — an aura's dice can scale with an ability mod (a Paladin/Cleric aura
  // keying CHA/WIS); per RAW the formula uses the CURRENT (effective) score, so an
  // ability-boosting item raises it. Resolve effective scores ONCE and feed the
  // aura effect line, never the raw stored scores (rule 6).
  const effectiveScores = effectiveAbilityScores(
    charData.abilityScores,
    aggregate.abilityScoreFloors,
    aggregate.itemAbilityScoreBonus,
    aggregate.itemAbilityScoreCap
  );
  const spellSlots = charData.spellSlots;
  const concentration = session.concentration;
  const conditions = session.conditions;
  const exhaustion = session.exhaustion;
  const inspiration = session.inspiration;
  // D37 — the Bardic Inspiration die the character is HOLDING (granted by an ally
  // Bard); "" when none. Distinct from the Bard's own give-out tracker.
  const heldDie = session.bardicInspirationDie ?? "";
  const INSPIRATION_DICE = ["d6", "d8", "d10", "d12"] as const;
  const hasResources = spellSlots.length > 0 || trackers.length > 0;

  // Defenses (#68 override-first + PLAY-NO-EDIT session overlay): each kind's
  // PERMANENT set = (grant-computed ∪ added) \ removed via the build override
  // map, then the SESSION overlay (defenses gained in play — potions, spells,
  // curses) layers on top as removable chips. One derive (`deriveDefenseKind`)
  // for the rail display AND any future combat-damage consumer. Play mode shows
  // permanent rows + session chips + the quiet add (the conditions register);
  // edit mode exposes the build add/remove chip editors below.
  const sessionDefenses = session.sessionDefenses;
  const defViews: Record<SessionDefenseKind, DefenseKindView> = {
    resistance: deriveDefenseKind(
      aggregate.damageResistances,
      charData.damageResistanceOverrides,
      sessionDefenses?.resistance
    ),
    immunity: deriveDefenseKind(
      aggregate.damageImmunities,
      charData.damageImmunityOverrides,
      sessionDefenses?.immunity
    ),
    vulnerability: deriveDefenseKind(
      aggregate.damageVulnerabilities,
      charData.damageVulnerabilityOverrides,
      sessionDefenses?.vulnerability
    ),
    conditionImmunity: deriveDefenseKind(
      aggregate.conditionImmunities,
      charData.conditionImmunityOverrides,
      sessionDefenses?.conditionImmunity
    ),
  };
  const resistances = defViews.resistance.permanent as DamageType[];
  const damageImmunities = defViews.immunity.permanent as DamageType[];
  const vulnerabilities = defViews.vulnerability.permanent as DamageType[];
  const conditionImmunities = defViews.conditionImmunity.permanent as ConditionId[];
  const sourceResistances = deriveDamageSourceResistances(aggregate);
  // Flat incoming-damage reductions (Heavy Armor Master's −PB on B/P/S while in
  // Heavy armor) — a self-side defense LINE, gated on the armor actually being
  // worn; the same resolved entries feed the HP popover's RA-05 intake math.
  const flatReductions = deriveFlatDamageReductions(
    aggregate,
    effectiveProficiencyBonus(totalLevel(charData), charData.proficiencyBonusOverride),
    isHeavyArmorEquipped(charData.equipment, getEquipment)
  );
  // SELF-side defensive reminder lines (Warding Bond's shared-damage / resistance
  // posture) — prose, localized once (the presenter is polarity-agnostic).
  // `aggregate` is guaranteed present here (the render body runs past its guard).
  const defenseNoteVMs = incomingAttackAdvantageVMs(aggregate.defenseNotes, locale);
  const hasDefenses =
    sourceResistances.length > 0 ||
    flatReductions.length > 0 ||
    defenseNoteVMs.length > 0 ||
    Object.values(defViews).some((v) => v.effective.length > 0);
  const dmgLabel = (d: string): string => t(`srd.damage_${d}`);
  // PLAY-NO-EDIT — one kind's session entries as removable chips (the condition-
  // chip register: transient state reads as a chip with a quiet ×; the permanent
  // sheet values stay plain text).
  const sessionChips = (kind: SessionDefenseKind): DefenseChipVM[] =>
    defViews[kind].session.map((id) => ({
      id,
      label: kind === "conditionImmunity" ? conditionLabel(id, locale) : dmgLabel(id),
      color: kind === "conditionImmunity" ? condColor(id) : `var(--dmg-${id})`,
      ink: kind === "conditionImmunity" ? condInkColor(id) : "var(--text-primary)",
      onRemove: () => useCharacterStore.getState().removeSessionDefense(kind, id),
    }));

  // Proficiencies (class armor/weapons + merged tools + languages). Armor/weapon are
  // override-aware (#68); tools + languages stay character-data arrays edited via Lore.
  const classData = getClassTable(primaryClassId(charData));
  const armorProfs = applySetOverride(
    classData?.armorProficiencies ?? [],
    charData.armorProficiencyOverrides
  );
  const weaponProfs = applySetOverride(
    classData?.weaponProficiencies ?? [],
    charData.weaponProficiencyOverrides
  );
  const showMastery = hasWeaponMastery(primaryClassId(charData));

  // ── #68 set-override mutation helpers (override-first via patchCharacter) ──
  // Toggle membership of `id` in a set: when the requested state matches the
  // grant-computed default the key is DROPPED (keeping the stored map minimal);
  // otherwise it pins true (force-add) / false (force-remove). An emptied map is
  // cleared to `undefined` so the sheet falls back to the pure computed set.
  const setMembership = (
    field: SetOverrideField,
    computed: Iterable<string>,
    id: string,
    present: boolean
  ) => {
    const computedSet = new Set<string>(computed);
    // Rebuild without `id` (no dynamic delete), then re-pin only if the requested
    // state differs from the grant-computed default — keeps the stored map minimal.
    const next: Record<string, boolean> = Object.fromEntries(
      Object.entries(charData[field] ?? {}).filter(([k]) => k !== id)
    );
    if (present !== computedSet.has(id)) next[id] = present;
    patchCharacter({ [field]: Object.keys(next).length ? next : undefined });
  };
  const resetOverride = (field: SetOverrideField) =>
    patchCharacter({ [field]: undefined });
  const isDirty = (field: SetOverrideField) =>
    Object.keys(charData[field] ?? {}).length > 0;

  // ── Edit-mode defense add — maps SessionDefenseKind → (SetOverrideField, computed) ──
  // Used by the shared AddDefensePicker `onAdd` callback in edit mode: when the user
  // picks a defense, we force-add it to the permanent build override map (the same
  // `setMembership` seam armor/weapon proficiencies use). This keeps the write-target
  // semantics separate from the compact UI, without forking the picker component.
  const DEFENSE_OVERRIDE_FIELD: Record<SessionDefenseKind, SetOverrideField> = {
    resistance: "damageResistanceOverrides",
    immunity: "damageImmunityOverrides",
    vulnerability: "damageVulnerabilityOverrides",
    conditionImmunity: "conditionImmunityOverrides",
  };
  const DEFENSE_COMPUTED: Record<SessionDefenseKind, Iterable<string>> = {
    resistance: aggregate.damageResistances,
    immunity: aggregate.damageImmunities,
    vulnerability: aggregate.damageVulnerabilities,
    conditionImmunity: aggregate.conditionImmunities,
  };
  // Items the user EXPLICITLY added to the build override map (force-add = true
  // entry). Grant-computed items are already in the text rows; only the extras
  // pinned here need a removable chip so the user can undo a manual add.
  const buildOverrideAddedChips = (kind: SessionDefenseKind): DefenseChipVM[] => {
    const field = DEFENSE_OVERRIDE_FIELD[kind];
    return Object.entries(charData[field] ?? {})
      .filter(([, v]) => v)
      .map(([id]) => ({
        id,
        label: kind === "conditionImmunity" ? conditionLabel(id, locale) : dmgLabel(id),
        color: kind === "conditionImmunity" ? condColor(id) : `var(--dmg-${id})`,
        ink: kind === "conditionImmunity" ? condInkColor(id) : "var(--text-primary)",
        onRemove: () =>
          setMembership(DEFENSE_OVERRIDE_FIELD[kind], DEFENSE_COMPUTED[kind], id, false),
      }));
  };

  // Build one labelled add/remove chip editor for a set-override field. The add
  // picker drops options already present (normalized, so "Light"/"Light armor"
  // count as one). Used only in edit mode (proficiencies section).
  const renderSet = (
    field: SetOverrideField,
    label: string,
    ids: string[],
    computed: Iterable<string>,
    allOptions: OverrideChipOption[],
    renderLabel: (id: string) => string,
    addLabel: string,
    colorFor?: (id: string) => { color: string; ink: string },
    normalizer?: (id: string) => string
  ) => {
    const norm = normalizer ?? ((x: string) => x);
    const presentNorm = new Set(ids.map(norm));
    const addOptions = allOptions.filter((o) => !presentNorm.has(norm(o.id)));
    return (
      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary">
          {label}
        </span>
        <OverrideChipSet
          ids={ids}
          renderLabel={renderLabel}
          colorFor={colorFor}
          addOptions={addOptions}
          onAdd={(id) => setMembership(field, computed, id, true)}
          onRemove={(id) => setMembership(field, computed, id, false)}
          onReset={() => resetOverride(field)}
          dirty={isDirty(field)}
          addLabel={addLabel}
        />
      </div>
    );
  };
  // Owner-10 — the override pickers offer the WHOLE proficiency pool, not just the
  // categories the class granted: the two weapon tiers pinned first, then every
  // weapon-type group (localized + alphabetized). A proficiency is a KIND ("all
  // Longswords"), never a single equipment item. `profLabel` localizes a stable
  // {@link ProficiencyToken} id from the catalogue (no in-code EN→IT map; the IT
  // cockpit reads the same words from JSON). Armor's four categories are the pool.
  const profLabel = (p: string) => localizeSrd("proficiency", p, "name", locale);
  const weaponProfOptions: OverrideChipOption[] = [
    ...WEAPON_PROFICIENCY_CATEGORIES.map((c) => ({ id: c, label: profLabel(c) })),
    ...WEAPON_PROFICIENCY_GROUPS.map((g) => ({ id: g, label: profLabel(g) })).sort(
      (a, b) => a.label.localeCompare(b.label, locale)
    ),
  ];
  const armorProfOptions: OverrideChipOption[] = ARMOR_PROFICIENCY_POOL.map((c) => ({
    id: c,
    label: profLabel(c),
  }));
  // Languages + tools render through the SINGLE-SOURCE display helpers (free-text
  // ∪ grants, localized) so the rail and the Bio tab can never drift — see
  // displayLanguages / displayToolProficiencies in derive-sheet-views.
  const tools = displayToolProficiencies(
    charData.toolProficiencyIds,
    charData.customToolProficiencies,
    aggregate,
    locale
  );
  const languages = displayLanguages(
    charData.languageIds,
    charData.customLanguages,
    aggregate,
    locale
  );

  return (
    <div className="folio-panel flex flex-col gap-6 p-4">
      {/* ── Resources — spell slots + class trackers ─────────────────────── */}
      <RailSection rubric={t("character.hud.resources")}>
        {hasResources ? (
          <div className="flex flex-col gap-3">
            {spellSlots.length > 0 && (
              // Named resource group — the slot grid carries a "Spell Slots" label
              // (reusing the tracker-name style) so it reads as a peer of the named
              // tracker rows below (Bardic Inspiration, Lucky, …) instead of an
              // unlabelled block of gems (owner: consistency, golden rule 3).
              <div className="slot-group">
                <span className="trk-name">{t("character.spellSlots")}</span>
                <div className="slot-grid">
                  {spellSlots.map((slot) => {
                    const used = session.spellSlots[slotUsageKey(slot)]?.used ?? 0;
                    const available = Math.max(0, slot.total - used);
                    return (
                      <RailSlot
                        key={slotUsageKey(slot)}
                        slot={slot}
                        used={used}
                        pending={Math.min(
                          pendingSlots[slotUsageKey(slot)] ?? 0,
                          available
                        )}
                      />
                    );
                  })}
                </div>
              </div>
            )}
            {trackers.map((tracker) => (
              <RailTracker
                key={tracker.id}
                tracker={tracker}
                pendingSpend={Math.min(
                  pendingTrackers[tracker.id] ?? 0,
                  Math.max(0, tracker.total - tracker.used)
                )}
              />
            ))}
            {/* PRIM-resource-conversion (closes needs-UI:resource-conversion-
                action) — Font of Magic SP ⇄ slots, Nature Magician Wild Shape →
                slot. Inline picker of the LEGAL trades only; click = immediate
                commit with undo (the combat commit model). */}
            <ResourceConversions
              entries={aggregate.resourceConversions}
              doc={character}
              unitFor={(id) => {
                const u = trackers.find((tr) => tr.id === id)?.unit;
                return u ? localizeTrackerUnit(u, t) : t("character.usesWord");
              }}
            />
          </div>
        ) : (
          <p className="text-sm text-text-secondary">
            {t("character.placeholder.noResources")}
          </p>
        )}
      </RailSection>

      {/* ── Active Features — Rage / Bladesong / Innate Sorcery toggles (#29).
          Built (`ActivatableFeaturesBar` + `toggleActiveFeature`) but never
          mounted; surfaced here so its `while-active` grants can be flipped on/off
          (the section hides for characters with none, e.g. the Bard mock). ── */}
      {(aggregate.activatableGroups.length > 0 || restBundles.length > 0) && (
        <RailSection rubric={t("character.activeFeatures")}>
          <div className="flex flex-col gap-2">
            {aggregate.activatableGroups.length > 0 && (
              <ActivatableFeaturesBar
                toggles={activatableToggles(
                  aggregate.activatableGroups,
                  locale,
                  session.effectTimers,
                  // S5 — gate the Bloodied boon toggles (Desperate Resilience /
                  // Furious Storm) on the SAME `isBloodied` predicate every surface
                  // reads; an unmet gate hints (override-first, never hard-locks).
                  isBloodied(character)
                )}
                onToggle={(key) => useCharacterStore.getState().toggleActiveFeature(key)}
              />
            )}
            {/* AX exposure audit — REST-frequency variant choosers (Starry Form
                constellation, Circle of the Land terrain, Fire Shield warm/chill)
                previously had NO play-surface affordance (only the level-up modal
                mounted the selector). RAW re-picks them on a rest, so they live
                with the Active Features toggles. Reuses the ONE selector. */}
            {restBundles.length > 0 && (
              <GrantBundleSelector
                bundles={restBundles}
                locale={locale}
                onSelect={(key, optionId) =>
                  useCharacterStore.getState().setGrantBundleChoice(key, optionId)
                }
              />
            )}
          </div>
        </RailSection>
      )}

      {/* ── Auras — active emanations (PRIM-aura: Wrath of the Sea, Starry Form,
          Nature's Sanctuary). Informational: radius + who it touches + the
          resolved effect formula (the engine rolls no dice and tracks no
          geometry — the player adjudicates the battlefield). Form-gated auras
          ride the Active Features toggle / constellation choice above, so this
          section lists exactly the auras CURRENTLY emanating; hidden when none. */}
      {auras.length > 0 && (
        <RailSection rubric={t("character.hud.auras")}>
          <div className="flex flex-col gap-2 text-sm">
            {auras.map((a) => (
              <div key={`${a.sourceId}-${a.auraId}`}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-text-primary">{a.name}</span>
                  {a.radiusLabel && (
                    <span className="font-mono text-xs text-text-secondary">
                      {a.radiusLabel}
                    </span>
                  )}
                </div>
                <p className="m-0 text-xs text-text-secondary">
                  {auraEffectLine(a, effectiveScores, t, locale)}
                </p>
              </div>
            ))}
          </div>
        </RailSection>
      )}

      {/* ── Active Potions (S9) — a consumed buff potion's duration counts down
          at each End Turn (the self-sustaining `potion:` effectTimers); listed
          here as small banners reusing the while-active timer chrome. Hidden
          when no potion is active. Informational + override-editable (the round
          count drops automatically; the player re-drinks to refresh). ── */}
      {potionTimers.length > 0 && (
        <RailSection rubric={t("character.hud.activePotions")}>
          <div className="flex flex-col gap-2 text-sm">
            {potionTimers.map((p) => (
              <div key={p.itemId} className="flex items-baseline justify-between gap-3">
                <span className="text-text-primary">{p.name}</span>
                <span className="font-mono text-xs text-text-secondary">
                  {t("combat.effectTimerShort", { count: p.roundsLeft })}
                </span>
              </div>
            ))}
          </div>
        </RailSection>
      )}

      {/* ── Inspiration (D37/INSP-UX) — the universal Heroic boon + the RECEIVED
          Bardic Inspiration die a character is holding. The Bard's OWN give-out
          tracker lives in Resources with the other class resources (BARDTRK1).
          Live users read the old static gold chips as labels, so each boon is now
          a TOKEN SOCKET row: an engraved unlit imprint sits in a carved well at
          rest ("something goes here"); tapping when the boon is received lights
          it into a gold coin and the quiet verb cue flips from the receive verb
          to the spend verb; tapping again spends it through the standard
          immediate-commit + undo-toast contract. The term itself is a GlossaryTip
          carrying the 2024 rules, so even a mis-tap on the label TEACHES the
          hold/spend loop. */}
      <RailSection rubric={t("character.hud.inspiration")}>
        <div className="flex flex-col gap-2">
          <div className={cn("insp-chip", inspiration && "held")}>
            <GlossaryTip
              term="heroicInspiration"
              rubric={t("character.heroicInspiration")}
              className="insp-term"
            />
            <button
              type="button"
              className="insp-toggle"
              aria-pressed={inspiration}
              aria-label={t("character.heroicInspiration")}
              onClick={() => {
                if (!inspiration) {
                  // Receiving the boon — a plain toggle (not an undoable spend).
                  useCharacterStore.getState().updateSession({ inspiration: true });
                  return;
                }
                // Spending it — immediate-commit with undo (onto the stack).
                const message = t("character.heroicInspirationSpent");
                registerUndoableToast(
                  { message },
                  () => {
                    useCharacterStore.getState().updateSession({ inspiration: false });
                    return () =>
                      useCharacterStore.getState().updateSession({ inspiration: true });
                  },
                  { turnScoped: false }
                );
              }}
            >
              <span className="insp-cue">
                {inspiration
                  ? t("character.inspCueSpendHeroic")
                  : t("character.inspCueReceiveHeroic")}
              </span>
              <span className="insp-socket">
                <Icon as={Sparkles} size="xs" decorative className="insp-token" />
              </span>
            </button>
          </div>
          {/* AX exposure audit — `heroic-inspiration-at-turn-start` (Champion
              Heroic Warrior): the self-grant rule lives right under the boon it
              regrants. Hidden for everyone without the grant. */}
          {aggregate.heroicInspirationAtTurnStart && (
            <p className="m-0 text-xs text-text-secondary">
              {t("character.heroicInspirationTurnStart")}
            </p>
          )}
          {/* Held Bardic Inspiration die (D37) — a die an ally Bard GAVE this
              character. The 2024 rules cap it at ONE at a time, so it's a single
              held value, not a tracker. Empty → the d6–d12 segments ARE the
              receive affordance (tap the size you were granted) with the cue
              line beneath; held → the coin shows the die size and a tap spends
              it (with undo). */}
          {/* `insp-die-chip` marks this as the HELD-DIE chip so the read-only
              glass case can drop it when empty (an unheld die is all affordance,
              no state) while the heroic-inspiration socket above always stays. */}
          <div className={cn("insp-chip insp-die-chip", heldDie && "held")}>
            <GlossaryTip
              term="bardicInspirationDie"
              rubric={t("character.inspirationDie")}
              className="insp-term"
            />
            {heldDie ? (
              <button
                type="button"
                className="insp-toggle"
                aria-pressed={true}
                aria-label={`${t("character.inspirationDie")} · ${heldDie}`}
                onClick={() => {
                  const message = t("character.inspirationDieSpent", { die: heldDie });
                  registerUndoableToast(
                    { message },
                    () => {
                      useCharacterStore
                        .getState()
                        .updateSession({ bardicInspirationDie: "" });
                      return () =>
                        useCharacterStore
                          .getState()
                          .updateSession({ bardicInspirationDie: heldDie });
                    },
                    { turnScoped: false }
                  );
                }}
              >
                <span className="insp-cue">{t("character.inspCueSpendDie")}</span>
                <span className="insp-socket">
                  <span className="insp-token insp-token-die">{heldDie}</span>
                </span>
              </button>
            ) : (
              <>
                <span className="idp-opts">
                  {INSPIRATION_DICE.map((die) => (
                    <button
                      key={die}
                      type="button"
                      className="idp-die"
                      aria-label={t("character.inspirationDieSet", {
                        die,
                      })}
                      onClick={() =>
                        useCharacterStore
                          .getState()
                          .updateSession({ bardicInspirationDie: die })
                      }
                    >
                      {die}
                    </button>
                  ))}
                </span>
                <span className="insp-cue insp-cue-line">
                  {t("character.inspCueReceiveDie")}
                </span>
              </>
            )}
          </div>
        </div>
      </RailSection>

      {/* ── Status — concentration + conditions + exhaustion ─────────────── */}
      <RailSection rubric={t("character.hud.status")}>
        {concentration && (
          <div className="conc-pill" style={{ marginBottom: "var(--sp-2)" }}>
            <FocusMark label={t("combat.concentration")} />
            <span>{concentrationLabel(concentration, locale)}</span>
            <button
              type="button"
              className="conc-x"
              aria-label={t("combat.clearConcentration")}
              onClick={() => useCharacterStore.getState().setConcentration("")}
            >
              <Icon as={X} size="sm" decorative />
            </button>
          </div>
        )}
        <ConditionStrip conditions={conditions} />
        <ExhaustionTrack value={exhaustion} />
      </RailSection>

      {/* ── Defenses — damage resist / immune / vulnerable + condition immunities.
          Override-aware (#68): play mode shows the effective rows; edit mode opens
          the add/remove chip editors so a player can pin or drop any of them. ── */}
      <RailSection rubric={t("character.hud.defenses")}>
        {/* AX exposure audit — `choice-resistance` slots (Boon of Energy
            Resistance, Reborn Strange Endurance) are RE-SELECTABLE picks with
            NO previous UI. One chip row per slot; tapping toggles a pick within
            the slot's cap (an over-cap tap is ignored — constrained input). */}
        {aggregate.choiceResistances.length > 0 && (
          <div className="mb-2 flex flex-col gap-2">
            {aggregate.choiceResistances.map((cr) => (
              <ChoiceResistancePicker key={cr.choiceKey} slot={cr} locale={locale} />
            ))}
          </div>
        )}
        {/* ONE layout for both play and edit modes — compact, same single-button
            add flow (owner: "Add defenses in the right rail, in edit mode, should
            be the same as in play mode (single button). It's more compact.").

            The ONLY semantic difference is the write target (golden rule 3):
            - PLAY: the compact Add button → session overlay (a potion, a spell)
            - EDIT: the same compact Add button → permanent build override map

            In EDIT mode, explicitly-added overrides also surface as removable chips
            (build overrides don't auto-clear on rest, so the user needs a ×).
            The compact layout replaces the old four-panel bulky editor. */}
        {hasDefenses || isEdit ? (
          <div className="flex flex-col gap-1 text-sm">
            {(defViews.resistance.effective.length > 0 ||
              sourceResistances.length > 0) && (
              <DefenseRow
                label={t("abilities.resistancesLabel")}
                value={[
                  ...resistances.map(dmgLabel),
                  // Damage-SOURCE resistances (Abjurer Spell Resistance, Shield
                  // of Missile Attraction) — orthogonal to the element list.
                  ...sourceResistances.map((src) => t(`character.damageSource_${src}`)),
                ].join(", ")}
                chips={
                  isEdit
                    ? buildOverrideAddedChips("resistance")
                    : sessionChips("resistance")
                }
              />
            )}
            {defViews.immunity.effective.length > 0 && (
              <DefenseRow
                label={t("abilities.immunitiesLabel")}
                value={damageImmunities.map(dmgLabel).join(", ")}
                chips={
                  isEdit ? buildOverrideAddedChips("immunity") : sessionChips("immunity")
                }
              />
            )}
            {defViews.vulnerability.effective.length > 0 && (
              <DefenseRow
                label={t("abilities.vulnerabilitiesLabel")}
                value={vulnerabilities.map(dmgLabel).join(", ")}
                chips={
                  isEdit
                    ? buildOverrideAddedChips("vulnerability")
                    : sessionChips("vulnerability")
                }
              />
            )}
            {defViews.conditionImmunity.effective.length > 0 && (
              <DefenseRow
                label={t("abilities.conditionImmunitiesLabel")}
                value={conditionImmunities
                  .map((c) => conditionLabel(c, locale))
                  .join(", ")}
                chips={
                  isEdit
                    ? buildOverrideAddedChips("conditionImmunity")
                    : sessionChips("conditionImmunity")
                }
              />
            )}
            {/* Flat damage reduction (Heavy Armor Master) — a self-side reminder,
                shown only while the condition (Heavy armor worn) holds. */}
            {flatReductions.map((r) => (
              <DefenseRow
                key={r.sourceId}
                label={t("abilities.damageReductionLabel")}
                value={
                  t("character.flatDamageReduction", {
                    types: r.damageTypes.map(dmgLabel).join("/"),
                    amount: r.amount,
                  }) +
                  (r.requiresHeavyArmor
                    ? ` (${t("character.flatDamageReductionInHeavyArmor")})`
                    : "")
                }
              />
            ))}
            {/* Self-side defensive reminder lines (Warding Bond, Death Ward,
                Mirror Image) — while-active prose under the neutral "Defense"
                label (the damage-reduction label stays on the numeric
                flat-reduction rows above); "· active" mirrors the advantage chips. */}
            {defenseNoteVMs.map((n, i) => (
              <DefenseRow
                key={`${n.sourceId}-defnote-${i}`}
                label={t("abilities.defenseLabel")}
                value={
                  n.whileActive
                    ? `${n.description} · ${t("combat.whileActiveNote")}`
                    : n.description
                }
              />
            ))}
          </div>
        ) : (
          <p className="m-0 text-sm text-text-secondary">
            {t("character.placeholder.noDefenses")}
          </p>
        )}
        {/* The compact "Add defense" affordance — shared between play and edit modes.
            In play: adds to the session overlay (a transient potion / spell / curse).
            In edit: adds to the permanent build override map (persists on the sheet). */}
        <AddDefensePicker
          defViews={defViews}
          locale={locale}
          onAdd={
            isEdit
              ? (kind, id) =>
                  setMembership(
                    DEFENSE_OVERRIDE_FIELD[kind],
                    DEFENSE_COMPUTED[kind],
                    id,
                    true
                  )
              : undefined
          }
        />
      </RailSection>

      {/* ── Advantages — durable advantage / disadvantage on saves / checks /
          initiative from features & species. Read-only (engine-derived); the
          attack-roll ones live inline on the action cards, so they're filtered out
          above. Hidden entirely when the character has none. ── */}
      {(advChips.length > 0 ||
        incomingAttackNotes.length > 0 ||
        incomingDefenseNotes.length > 0) && (
        <RailSection rubric={t("abilities.advantages")}>
          <div className="flex flex-col gap-1 text-sm">
            {advChips.map((c, i) => (
              <DefenseRow
                key={`${c.sourceId}-${c.mode}-${i}`}
                label={t(`abilities.${c.mode}`)}
                // A while-active-gated clause (Rage's STR advantage, Reckless
                // Attack) reads "… · active" — the SAME `combat.whileActiveNote`
                // suffix the weapon-damage breakdown shows.
                value={
                  c.whileActive
                    ? `${c.description} · ${t("combat.whileActiveNote")}`
                    : c.description
                }
              />
            ))}
            {/* SELF-side combat downsides (Reckless Attack): framed as a Disadv.
                — your OWN defenses worsen while it's declared. The "· active"
                suffix mirrors the advantage chips above. */}
            {incomingAttackNotes.map((n, i) => (
              <DefenseRow
                key={`${n.sourceId}-incoming-${i}`}
                label={t("abilities.disadvantage")}
                value={
                  n.whileActive
                    ? `${n.description} · ${t("combat.whileActiveNote")}`
                    : n.description
                }
              />
            ))}
            {/* SELF-side combat BENEFITS (Blur): framed as an Advantage — your
                OWN defenses improve while it's up. The "· active" suffix mirrors
                the chips above. */}
            {incomingDefenseNotes.map((n, i) => (
              <DefenseRow
                key={`${n.sourceId}-incoming-def-${i}`}
                label={t("abilities.advantage")}
                value={
                  n.whileActive
                    ? `${n.description} · ${t("combat.whileActiveNote")}`
                    : n.description
                }
              />
            ))}
          </div>
        </RailSection>
      )}

      {/* ── Passives — durable roll FLOORS (Rogue Reliable Talent: treat a d20 ≤9
          as 10 on proficient checks). Read-only engine-derived notes; hidden when
          the character has none. ── */}
      {aggregate.rollFloors.length > 0 && (
        <RailSection rubric={t("character.hud.passives")}>
          <div className="flex flex-col gap-1 text-sm">
            {rollFloorVMs(aggregate.rollFloors, locale).map((f, i) => (
              <p key={`${f.sourceId}-${i}`} className="text-text-primary">
                {f.description}
                {/* A while-active-gated floor (Starry Form, Trance of Order) reads
                    "… · active" — the SAME `combat.whileActiveNote` suffix the
                    weapon-damage breakdown shows. */}
                {f.whileActive && (
                  <span className="text-accent-text">
                    {" "}
                    · {t("combat.whileActiveNote")}
                  </span>
                )}
              </p>
            ))}
          </div>
        </RailSection>
      )}

      {/* ── Proficiencies — armor / weapons (override-aware #68) + tools / languages.
          Tools & languages are character-data arrays (edited under Lore), so they
          stay read-only here. ── */}
      <RailSection rubric={t("character.hud.proficiencies")}>
        {isEdit ? (
          <div className="flex flex-col gap-3">
            {renderSet(
              "armorProficiencyOverrides",
              t("abilities.armorProfs"),
              armorProfs,
              classData?.armorProficiencies ?? [],
              armorProfOptions,
              profLabel,
              t("character.override.addArmorProf")
            )}
            {renderSet(
              "weaponProficiencyOverrides",
              t("abilities.weaponProfs"),
              weaponProfs,
              classData?.weaponProficiencies ?? [],
              weaponProfOptions,
              profLabel,
              t("character.override.addWeaponProf")
            )}
            {(tools || languages) && (
              <div className="flex flex-col gap-1 text-sm">
                {tools && <DefenseRow label={t("abilities.toolProfs")} value={tools} />}
                {languages && (
                  <DefenseRow label={t("abilities.languages")} value={languages} />
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-1 text-sm">
            {armorProfs.length > 0 && (
              <DefenseRow
                label={t("abilities.armorProfs")}
                value={armorProfs.map(profLabel).join(", ")}
              />
            )}
            {weaponProfs.length > 0 && (
              <DefenseRow
                label={t("abilities.weaponProfs")}
                value={
                  weaponProfs.map(profLabel).join(", ") +
                  (showMastery ? ` · ${t("abilities.weaponMastery")}` : "")
                }
              />
            )}
            {tools && <DefenseRow label={t("abilities.toolProfs")} value={tools} />}
            {languages && (
              <DefenseRow label={t("abilities.languages")} value={languages} />
            )}
          </div>
        )}
      </RailSection>

      {/* ── Combat notes (item c) — the rail "post-it" for non-automatable
          bonuses, reading/writing the SAME session.notes the Bio tab edits.
          Collapsed by default (progressive disclosure); sits last so it never
          competes with the live resources above. ── */}
      <RailNotes />
    </div>
  );
}

/**
 * One localized effect line for an aura note — who it touches + the resolved
 * effect formula. Ability tokens in the dice resolve to the character's
 * concrete modifiers (`resolveAuraDice`); distances are locale-aware. The
 * `kind` switch is exhaustive over the aura-effect union.
 */
function auraEffectLine(
  aura: AuraVM,
  scores: Readonly<Record<AbilityCode, number>>,
  t: TFunction,
  locale: "en" | "it"
): string {
  const affects = t(`character.auraAffects_${aura.affects}`);
  const e = aura.effect;
  let effect: string;
  switch (e.kind) {
    case "save-damage": {
      effect = t("character.auraSaveDamage", {
        dice: resolveAuraDice(e.dice, scores),
        type: t(`srd.damage_${e.damageType}`),
        save: t(`abilities.${e.saveAbility}_short`),
      });
      if (e.pushFt) {
        effect += ` · ${t("character.auraPush", {
          distance: localeDistance(e.pushFt, locale),
          size: e.maxTargetSize ? t(`srd.size_${e.maxTargetSize.toLowerCase()}`) : "",
        }).replace(/ \(max \)$/, "")}`;
      }
      break;
    }
    case "ranged-attack":
      effect = t("character.auraRangedAttack", {
        dice: resolveAuraDice(e.dice, scores),
        type: t(`srd.damage_${e.damageType}`),
        range: localeDistance(e.rangeFt, locale),
      });
      break;
    case "heal":
      effect = t("character.auraHeal", { dice: resolveAuraDice(e.dice, scores) });
      break;
    case "ac-bonus":
      effect = `+${e.amount} ${t("stats.ac")}`;
      break;
    case "temp-hp":
      effect = t("character.auraTempHp", { formula: e.formula });
      break;
    case "half-cover":
      effect = t("character.auraHalfCover");
      break;
    case "roll-floor":
      effect = t("character.auraRollFloor", { floor: e.floor });
      break;
  }
  return `${affects} · ${effect}`;
}

/**
 * One `choice-resistance` slot — a labelled chip row of the slot's damage-type
 * options; picked chips are pressed. Tapping toggles a pick; the slot's cap is
 * enforced by REPLACING the oldest pick when full at amount 1, and ignoring
 * over-cap additions otherwise (invalid states unreachable). Writes the
 * comma-joined pick list to `session.grantBundleChoices[choiceKey]` — the
 * SAME seam the evaluator validates via `parseChoiceResistanceValue`.
 */
function ChoiceResistancePicker({
  slot,
  locale,
}: {
  slot: AggregatedGrants["choiceResistances"][number];
  locale: "en" | "it";
}) {
  const { t } = useTranslation();
  const picked = slot.selected;
  function toggle(type: DamageType): void {
    let next: DamageType[];
    if (picked.includes(type)) {
      next = picked.filter((d) => d !== type);
    } else if (picked.length < slot.amount) {
      next = [...picked, type];
    } else if (slot.amount === 1) {
      // Single-pick slot: tapping another option REPLACES the pick.
      next = [type];
    } else {
      return; // at cap on a multi-pick slot — deselect first
    }
    useCharacterStore.getState().setGrantBundleChoice(slot.choiceKey, next.join(","));
  }
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary">
        {localizeText(slot.label, locale)} · {picked.length}/{slot.amount}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {slot.options.map((type) => (
          <button
            key={type}
            type="button"
            aria-pressed={picked.includes(type)}
            className="fchip fchip-sm"
            title={t("character.choiceResistanceHint")}
            onClick={() => toggle(type)}
          >
            {t(`srd.damage_${type}`)}
          </button>
        ))}
      </div>
    </div>
  );
}

/** A session defense rendered as a removable chip (PLAY-NO-EDIT). */
interface DefenseChipVM {
  id: string;
  label: string;
  color: string;
  ink: string;
  onRemove: () => void;
}

/**
 * A compact label · value row for the Defenses / Proficiencies readouts.
 * `chips` (PLAY-NO-EDIT) appends the SESSION defenses as removable `.co-chip`s
 * after the permanent text — temporary protections read like conditions
 * (transient chips), innate ones like sheet facts (plain text).
 */
function DefenseRow({
  label,
  value,
  chips,
}: {
  label: string;
  value: string;
  chips?: DefenseChipVM[];
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="flex-shrink-0 text-text-secondary">{label}</span>
      <span className="flex flex-wrap items-center justify-end gap-x-1.5 gap-y-1 text-right text-text-primary">
        {value}
        {chips?.map((chip) => (
          <span
            key={chip.id}
            className="co-chip"
            style={{
              ["--co" as string]: chip.color,
              ["--co-ink" as string]: chip.ink,
            }}
          >
            {chip.label}
            <button
              type="button"
              className="co-x"
              aria-label={t("common.remove") + " " + chip.label}
              onClick={chip.onRemove}
            >
              <Icon as={X} size="sm" decorative />
            </button>
          </span>
        ))}
      </span>
    </div>
  );
}

/**
 * The compact "Add defense" affordance — ONE component for both PLAY and EDIT
 * modes (golden rule 3). A kind switcher (resistance / immunity / vulnerability
 * / condition immunity) + an alphabetised type list; already-effective ids are
 * disabled so an invalid state is unreachable.
 *
 * The WRITE TARGET is parameterised:
 *  - PLAY mode (no `onAdd`): adds to `session.sessionDefenses` — transient
 *    potions / spells / curses that end without touching the build.
 *  - EDIT mode (`onAdd` supplied): adds to the permanent build override map
 *    (`damage*Overrides` / `conditionImmunityOverrides`) — persists between
 *    sessions as a character sheet fact.
 *
 * The picker closing behaviour, kind toggle, and dismiss-on-outside are shared
 * identically between modes.
 */
function AddDefensePicker({
  defViews,
  locale,
  onAdd,
}: {
  defViews: Record<SessionDefenseKind, DefenseKindView>;
  locale: "en" | "it";
  /** Override the write target. When absent, adds to the session overlay. */
  onAdd?: (kind: SessionDefenseKind, id: string) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<SessionDefenseKind>("resistance");
  const wrapRef = useRef<HTMLDivElement>(null);
  useDismissOnOutside(open, wrapRef, () => setOpen(false));

  const KIND_LABEL: Record<SessionDefenseKind, string> = {
    resistance: t("abilities.resistancesLabel"),
    immunity: t("abilities.immunitiesLabel"),
    vulnerability: t("abilities.vulnerabilitiesLabel"),
    conditionImmunity: t("abilities.conditionImmunitiesLabel"),
  };
  const options =
    kind === "conditionImmunity"
      ? conditionOptions(locale)
      : ALL_DAMAGE_TYPES.map((d) => ({ id: d, label: t(`srd.damage_${d}`) })) //
          .sort((a, b) => a.label.localeCompare(b.label, locale));

  function commit(id: string) {
    if (onAdd) {
      onAdd(kind, id);
    } else {
      useCharacterStore.getState().addSessionDefense(kind, id);
    }
    setOpen(false);
  }

  return (
    <div
      className="co-add-wrap"
      ref={wrapRef}
      style={{ position: "relative", marginTop: "var(--sp-2)" }}
    >
      <button
        type="button"
        className="co-add"
        title={t("character.addDefenseHint")}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon as={Plus} size="xs" decorative />
        {t("character.addDefense")}
      </button>
      {open && (
        <div className="co-picker" role="listbox" aria-label={t("character.addDefense")}>
          <div className="flex flex-wrap gap-1.5 px-3 pb-2 pt-1.5">
            {(Object.keys(KIND_LABEL) as SessionDefenseKind[]).map((k) => (
              <button
                key={k}
                type="button"
                className="fchip fchip-sm"
                aria-pressed={kind === k}
                onClick={() => setKind(k)}
              >
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>
          {options.map((o) => {
            const already = defViews[kind].effective.includes(o.id);
            return (
              <button
                key={o.id}
                type="button"
                role="option"
                aria-selected={already}
                className={cn("co-pick-item", already && "active")}
                disabled={already}
                onClick={() => commit(o.id)}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * D13 — Condition strip: the cockpit binding of the shared {@link ConditionEditor}
 * (active chips + an "Add condition" popover of the 15 SRD conditions). One toggle
 * routes the active character's store actions — `removeCondition` when the id is
 * already active, `addCondition` otherwise — so the cockpit and the in-hub
 * encounter card share ONE condition widget (golden rule 10). `locale` is read
 * inside the shared editor via `useLocale`, so this wrapper only forwards the ids.
 */
function ConditionStrip({ conditions }: { conditions: string[] }) {
  const { t } = useTranslation();
  return (
    <ConditionEditor
      conditions={conditions}
      emptyLabel={t("character.noConditions")}
      onToggle={(id) => {
        const store = useCharacterStore.getState();
        if (conditions.includes(id)) store.removeCondition(id);
        else store.addCondition(id);
      }}
    />
  );
}

/**
 * A single spell-slot cell — level badge + the level-coloured gem pips. The pips
 * are the spend/restore affordance (override-first, golden rule 8): tap a filled
 * gem = spend that slot (with a 5 s undo toast), tap a spent socket = restore one.
 * Same interaction model as the tracker pips (golden rule 3 — slots SPEND on the
 * rail, the documented intent that was previously wired only for trackers), so a
 * mis-spend (a misclick or an app bug) is always correctable, not just within the
 * cast's undo window. The slot TOTAL stays a build-time edit (Spells page); this
 * only moves the play-time USED count.
 */
function RailSlot({
  slot,
  used,
  pending,
}: {
  slot: { level: number; total: number; pactMagic?: boolean };
  used: number;
  pending: number;
}) {
  const { t } = useTranslation();
  const spendSlot = useCharacterStore((s) => s.useSpellSlot);
  const restoreSlot = useCharacterStore((s) => s.restoreSpellSlot);
  const total = slot.total;
  const available = Math.max(0, total - used);

  function spend() {
    if (available <= 0) return;
    const message = t("combat.slotSpend", { level: slot.level });
    registerUndoableToast(
      { message },
      () => {
        spendSlot(slot.level, slot.pactMagic);
        return () => restoreSlot(slot.level, slot.pactMagic);
      },
      { turnScoped: false }
    );
  }
  function restore() {
    if (used <= 0) return;
    restoreSlot(slot.level, slot.pactMagic);
  }

  return (
    <div
      className={cn("slot-cell", slot.pactMagic && "pact", available === 0 && "depleted")}
      style={{ ["--sl" as string]: SPELL_LEVEL_VAR[slot.level] ?? "var(--sl-1)" }}
    >
      <span className="sc-lvl" aria-hidden>
        {slot.level}
        {slot.pactMagic ? "P" : ""}
      </span>
      <span
        className="sc-pips"
        role="group"
        aria-label={t("character.slotsAvailableAria", {
          available,
          total,
          level: slot.level,
        })}
      >
        {Array.from({ length: total }).map((_, i) => {
          const isOn = i < available - pending;
          const isPending = i >= available - pending && i < available;
          return (
            <button
              key={i}
              type="button"
              className={cn(
                "sc-pip",
                isPending && "pending",
                !isOn && !isPending && "used"
              )}
              aria-label={
                isOn
                  ? t("character.slotSpendAria", { level: slot.level })
                  : t("character.slotRestoreAria", { level: slot.level })
              }
              onClick={isOn ? spend : restore}
              disabled={!isOn && used <= 0}
            />
          );
        })}
      </span>
    </div>
  );
}

/**
 * The ONE tappable pip cluster (locked Tracker-A recipe) shared by every rail
 * tracker row — class resources AND the Inspiration boons. Tap a filled pip =
 * spend, an empty pip = restore/gain; never forked (golden rule 3).
 */
function TrackerPips({
  total,
  available,
  pendingSpend = 0,
  label,
  spendAria,
  restoreAria,
  onSpend,
  onRestore,
  restoreDisabled = false,
}: {
  total: number;
  available: number;
  pendingSpend?: number;
  label: string;
  spendAria: string;
  /** Aria for tapping an EMPTY pip; omit when the empty state is unreachable. */
  restoreAria?: string;
  onSpend: () => void;
  /** Tapping an EMPTY pip; omit to disable empty pips entirely. */
  onRestore?: () => void;
  restoreDisabled?: boolean;
}) {
  return (
    <span className="trk-pips" role="group" aria-label={label}>
      {Array.from({ length: total }).map((_, i) => {
        const isOn = i < available - pendingSpend;
        const isPending = i >= available - pendingSpend && i < available;
        return (
          <button
            key={i}
            type="button"
            className={cn("trk-pip", isOn && "on", isPending && "pending")}
            aria-label={isOn ? spendAria : (restoreAria ?? spendAria)}
            onClick={isOn ? onSpend : onRestore}
            disabled={isOn ? false : restoreDisabled || !onRestore}
          />
        );
      })}
    </span>
  );
}

/**
 * A single tracker row (locked Tracker-A spec): `name [die] [rec] …pips`. Pips
 * ARE the spend/restore affordance (tap filled = spend, empty = restore, with an
 * undo toast); pools (>5) use a +/- stepper.
 */
function RailTracker({
  tracker,
  pendingSpend,
}: {
  tracker: ResolvedTracker;
  pendingSpend: number;
}) {
  const { t } = useTranslation();
  const spendTracker = useCharacterStore((s) => s.useTracker);
  const restoreTracker = useCharacterStore((s) => s.restoreTracker);
  const recoverTrackerFromSpellSlot = useCharacterStore(
    (s) => s.recoverTrackerFromSpellSlot
  );
  const recoverTrackerByAltCost = useCharacterStore((s) => s.recoverTrackerByAltCost);
  const recoverTrackerByMinSlot = useCharacterStore((s) => s.recoverTrackerByMinSlot);
  const available = Math.max(0, tracker.total - tracker.used);
  // S4 — Font of Inspiration: when a spell slot can be expended to regain a use
  // of THIS tracker (an unspent slot exists AND a use is spent), offer a one-tap
  // conversion. The engine consumer (`getSpellSlotTrackerRecovery`) decides
  // availability; this just surfaces + commits it (with undo).
  const character = useCharacterStore((s) => s.character);
  const canRecoverFromSlot = useMemo(
    () => (character ? getSpellSlotTrackerRecovery(character).has(tracker.id) : false),
    [character, tracker.id]
  );

  // S6 — alternate recovery: an exhausted use of a tracker carrying an
  // `altRecoveryCost` (Sorcerer Metamagic / Fighter maneuver) can be re-activated
  // by paying N units from a funding pool (Sorcery Points). The pure
  // `resolveAltRecovery` engine consumer decides affordability (reading the live
  // funding pool); this surfaces the one-tap affordance + commits it with undo.
  const altRecovery = useMemo(() => {
    const cost = tracker.altRecoveryCost;
    if (!cost || !("fromTracker" in cost) || !character) return null;
    const pool = resolveTrackers(character).find((p) => p.id === cost.fromTracker);
    if (!pool) return null;
    const poolRemaining = Math.max(0, pool.total - pool.used);
    return resolveAltRecovery(tracker, poolRemaining);
  }, [tracker, character]);

  // S6 (slot-funded) — alternate recovery: an exhausted use of a tracker whose
  // `altRecoveryCost` is `{ fromSpellSlot }` (Cleric Divine Foreknowledge level
  // 6+, Ranger Persistent Wrath level 4+) can be restored by EXPENDING an
  // eligible spell slot. The pure `resolveSlotAltRecovery` engine consumer reads
  // the live unspent slots; this surfaces the one-tap affordance + commits it.
  const slotAltRecovery = useMemo(() => {
    const cost = tracker.altRecoveryCost;
    if (!cost || !("fromSpellSlot" in cost) || !character) return null;
    const availableSlotLevels = character.character.spellSlots
      .filter((s) => {
        const used = character.session.spellSlots[slotUsageKey(s)]?.used ?? 0;
        return s.total - used > 0;
      })
      .map((s) => s.level);
    return resolveSlotAltRecovery(tracker, availableSlotLevels);
  }, [tracker, character]);

  function recoverFromSlot() {
    const message = t("combat.slotToTrackerRecoverToast", { name: tracker.label });
    registerUndoableToast({ message }, () => recoverTrackerFromSpellSlot(tracker.id), {
      turnScoped: false,
    });
  }

  function recoverByAltCost() {
    if (!altRecovery) return;
    const { fromTracker, amount } = altRecovery;
    const message = t("combat.altRecoverToast", { name: tracker.label });
    registerUndoableToast(
      { message },
      () => recoverTrackerByAltCost(tracker.id, fromTracker, amount),
      { turnScoped: false }
    );
  }

  function recoverByMinSlot() {
    if (!slotAltRecovery) return;
    const { minSlotLevel } = slotAltRecovery;
    const message = t("combat.slotToTrackerRecoverToast", { name: tracker.label });
    registerUndoableToast(
      { message },
      () => recoverTrackerByMinSlot(tracker.id, minSlotLevel),
      { turnScoped: false }
    );
  }
  // The SR/LR badge bucket comes from the ONE shared classifier the Features tab
  // reads too (golden rule 6) — so a `dawn` pool (a magic item's daily charges)
  // shows the SAME Long-Rest badge here as on the Features tab, never a blank.
  const recovery = trackerRecoveryBadgeBucket(tracker.recovery);
  // D4 — localize the recovery badge: EN SR/LR, IT RB/RL (Riposo Breve / Riposo Lungo).
  const recoveryLabel =
    recovery === "long"
      ? t("features.recoverLongBadge")
      : recovery === "short"
        ? t("features.recoverShortBadge")
        : null;
  const usePips = tracker.total <= 5 && !tracker.isPool;
  const showStepper = !usePips;

  function spend() {
    if (available <= 0) return;
    const message = t("combat.trackerSpend", { name: tracker.label });
    registerUndoableToast(
      { message },
      () => {
        spendTracker(tracker.id, 1);
        return () => restoreTracker(tracker.id, 1);
      },
      { turnScoped: false }
    );
  }

  function restore() {
    if (tracker.used <= 0) return;
    restoreTracker(tracker.id, 1);
  }

  return (
    <div className="trk">
      {/* D37 — the hover tooltip reminds what the resource does (e.g. Bardic /
          Master's Inspiration), not just its name. Native tooltips carry plain
          text only, so inline-markdown markers are stripped. */}
      <span
        className="trk-name"
        title={stripInline(tracker.description || tracker.label)}
      >
        {tracker.label}
      </span>
      {tracker.die && <span className="trk-die">{tracker.die}</span>}
      {recoveryLabel && (
        <span className="trk-rec" data-r={recovery}>
          {recoveryLabel}
        </span>
      )}
      {usePips ? (
        <TrackerPips
          total={tracker.total}
          available={available}
          pendingSpend={pendingSpend}
          label={tracker.label}
          spendAria={`${t("combat.spend")} ${tracker.label}`}
          restoreAria={`${t("combat.restore")} ${tracker.label}`}
          onSpend={spend}
          onRestore={restore}
          restoreDisabled={tracker.used <= 0}
        />
      ) : (
        <span className="trk-pool">
          <b>{available}</b>/{tracker.total}
          {tracker.unit ? ` ${localizeTrackerUnit(tracker.unit, t)}` : ""}
        </span>
      )}
      {showStepper && (
        <div className="trk-ctrl">
          <Button
            variant="neutral"
            size="sm"
            iconOnly
            aria-label={t("combat.spend") + " " + tracker.label}
            disabled={available <= 0}
            onClick={spend}
          >
            <Icon as={Minus} size="sm" decorative />
          </Button>
          <Button
            variant="neutral"
            size="sm"
            iconOnly
            aria-label={t("combat.restore") + " " + tracker.label}
            disabled={tracker.used <= 0}
            onClick={restore}
          >
            <Icon as={Plus} size="sm" decorative />
          </Button>
        </div>
      )}
      {/* S4 — Font of Inspiration: spend a spell slot to regain a use of this
          tracker (only shown when the conversion is currently available). One
          tap commits with undo (the combat commit model). */}
      {canRecoverFromSlot && (
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          className="trk-recover"
          aria-label={t("combat.slotToTrackerRecover", { name: tracker.label })}
          title={t("combat.slotToTrackerRecover", { name: tracker.label })}
          onClick={recoverFromSlot}
        >
          <Icon as={Sparkles} size="sm" decorative />
        </Button>
      )}
      {/* S6 — alternate recovery: spend N pool units to re-activate an exhausted
          use (Sorcerer Metamagic / Fighter maneuver). Shown only when the engine
          says it's currently affordable. One tap commits with undo. */}
      {altRecovery?.canRestore && (
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          className="trk-recover"
          aria-label={t("combat.altRecover", {
            name: tracker.label,
            count: altRecovery.amount,
          })}
          title={t("combat.altRecover", {
            name: tracker.label,
            count: altRecovery.amount,
          })}
          onClick={recoverByAltCost}
        >
          <Icon as={Sparkles} size="sm" decorative />
        </Button>
      )}
      {/* S6 (slot-funded) — expend a level N+ spell slot to restore an exhausted
          use (Cleric Divine Foreknowledge level 6+ / Ranger Persistent Wrath
          level 4+). Shown only when an eligible unspent slot exists. One tap
          commits with undo. */}
      {slotAltRecovery?.canRestore && (
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          className="trk-recover"
          aria-label={t("combat.slotMinToTrackerRecover", {
            name: tracker.label,
            level: slotAltRecovery.minSlotLevel,
          })}
          title={t("combat.slotMinToTrackerRecover", {
            name: tracker.label,
            level: slotAltRecovery.minSlotLevel,
          })}
          onClick={recoverByMinSlot}
        >
          <Icon as={Sparkles} size="sm" decorative />
        </Button>
      )}
    </div>
  );
}

/** Exhaustion 6-pip stepper (amber → crimson). Only shown when > 0. */
function ExhaustionTrack({ value }: { value: number }) {
  const { t } = useTranslation();
  const updateSession = useCharacterStore((s) => s.updateSession);

  // D34 — clicking a pip sets exhaustion to EXACTLY that level (raise or lower);
  // clearing/decrementing is the explicit × button below, not the old
  // unintuitive "re-click the last filled pip to step down" gesture.
  function setLevel(target: number) {
    updateSession({ exhaustion: Math.max(0, Math.min(6, target)) });
  }

  // #16 — ungate from 0: a fresh character has 0 exhaustion, but the early
  // `return null` hid the ONLY entry point, so level 1 could never be added.
  // At zero, show the same `.co-add` affordance the conditions use; clicking it
  // marks level 1 and the full track appears.
  if (value <= 0) {
    return (
      // N-G — share the `.co-add` recipe verbatim with the condition add button:
      // no per-instance inline colour/opacity (the recipe rests at full opacity
      // with AA-tuned `--text-muted` ink), so every rail add affordance reads
      // identically. The stray `--text-secondary` override here was the lone
      // outlier that made the exhaustion button look unlike the others.
      <button type="button" className="co-add" onClick={() => setLevel(1)}>
        <Icon as={Plus} size="xs" decorative />
        {t("character.exhaustion")}
      </button>
    );
  }
  return (
    <div className="co-ex">
      <div className="co-ex-head">
        <span className="co-ex-label">
          {/* P2 — "Exhaustion" glosses its 2024 rules on demand. */}
          <GlossaryTip term="exhaustion" rubric={t("character.exhaustion")} />
        </span>
        <span
          className="co-ex-lvl"
          style={{ ["--ex-current" as string]: `var(--ex-${value})` }}
        >
          {value}/6
        </span>
        {/* D34 — one-tap clear to level 0 (no more re-clicking the first segment). */}
        <button
          type="button"
          className="co-ex-clear"
          aria-label={t("character.exhaustionClear")}
          title={t("character.exhaustionClear")}
          onClick={() => setLevel(0)}
        >
          <Icon as={X} size="xs" decorative />
        </button>
      </div>
      <div className="co-ex-track" role="group" aria-label={t("character.exhaustion")}>
        {Array.from({ length: 6 }).map((_, i) => {
          const lvl = i + 1;
          const on = lvl <= value;
          return (
            <button
              key={lvl}
              type="button"
              className="co-ex-pip"
              data-lvl={lvl}
              data-on={on}
              aria-pressed={on}
              aria-label={`${t("character.exhaustion")} ${lvl}`}
              title={t("character.exhaustionSet", {
                lvl,
              })}
              onClick={() => setLevel(lvl)}
            >
              {lvl}
            </button>
          );
        })}
      </div>
      {value >= 6 ? (
        <div className="co-ex-eff co-ex-death">
          <Icon as={Skull} size="sm" decorative />
          <span>{t("character.exhaustionDeath")}</span>
        </div>
      ) : (
        value > 0 && (
          // 2024: −2 to every d20 Test per exhaustion level (level 6 = death,
          // handled above). Computed + localized instead of a hardcoded map.
          <div className="co-ex-eff">
            {t("character.exhaustionEffect", { n: value * 2 })}
          </div>
        )
      )}
    </div>
  );
}
