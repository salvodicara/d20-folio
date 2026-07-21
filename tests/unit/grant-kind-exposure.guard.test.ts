/**
 * Grant-kind EXPOSURE guard (AX) — every Grant kind in the taxonomy must have a
 * REGISTERED consumer seam, so a mechanic can never ship engine-computed but
 * invisible (the owner's triple: automated ∧ surfaced ∧ override-able).
 *
 * The table below is the single source of truth for "which surface consumes
 * each kind". Three states:
 *
 *  - `{ via, consumer }` — EXPOSED: `consumer` (a real file) must literally
 *    contain the `via` token (the aggregate field / resolver the surface reads).
 *    Renaming the seam or deleting the consumer fails here.
 *  - `{ plumbing }` — deliberately NON-rendered, with the written justification
 *    (a choice-engine seam, an equivalent code path, a dormant duplicate).
 *  - `{ open }` — a KNOWN exposure gap, recorded as a ranked OPEN item in
 *    docs/AUTOMATION_COVERAGE.md (the doc must mention the kind, so the gap
 *    can't silently vanish from the backlog).
 *
 * Adding a NEW Grant kind without registering it here fails CI; so does a
 * stale row for a removed kind.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (rel: string): string => readFileSync(join(process.cwd(), rel), "utf8");

/** Extract every kind literal from the `export type Grant =` union. */
function grantKinds(): string[] {
  const src = read("src/lib/grants.ts");
  const start = src.indexOf("export type Grant =");
  if (start < 0) throw new Error("Grant union not found");
  // The union ends at the first subsequent top-level `export` declaration.
  const end = src.indexOf("\nexport ", start + 1);
  const block = src.slice(start, end);
  const kinds = new Set<string>();
  for (const m of block.matchAll(/type: "([a-z0-9-]+)"/g)) {
    const k = m[1];
    if (k) kinds.add(k);
  }
  return [...kinds].sort();
}

type Exposure =
  | { via: string; consumer: string }
  | { plumbing: string }
  | { open: string };

const EXPOSURE: Record<string, Exposure> = {
  // ── Senses → Left HUD Senses rail (sense-range overrides #68) ──
  darkvision: {
    via: "deriveSensesAndSpeeds",
    consumer: "src/features/character/hud/LeftHud.tsx",
  },
  // D6 — additive darkvision (Umbral Sight) folds into the SAME `darkvisionFt`
  // aggregate field the Senses rail reads, so it surfaces through the identical seam.
  "darkvision-bonus": {
    via: "deriveSensesAndSpeeds",
    consumer: "src/features/character/hud/LeftHud.tsx",
  },
  blindsight: {
    via: "deriveSensesAndSpeeds",
    consumer: "src/features/character/hud/LeftHud.tsx",
  },
  tremorsense: {
    via: "deriveSensesAndSpeeds",
    consumer: "src/features/character/hud/LeftHud.tsx",
  },
  truesight: {
    via: "deriveSensesAndSpeeds",
    consumer: "src/features/character/hud/LeftHud.tsx",
  },
  "see-invisible": {
    via: "deriveSensesAndSpeeds",
    consumer: "src/features/character/hud/LeftHud.tsx",
  },

  // ── Defenses → Right HUD Defenses (set-override editors #68) ──
  "damage-resistance": {
    via: "damageResistances",
    consumer: "src/features/character/molecules/ResourceRail.tsx",
  },
  "damage-immunity": {
    via: "damageImmunities",
    consumer: "src/features/character/molecules/ResourceRail.tsx",
  },
  "damage-vulnerability": {
    via: "damageVulnerabilities",
    consumer: "src/features/character/molecules/ResourceRail.tsx",
  },
  "condition-immunity": {
    via: "conditionImmunities",
    consumer: "src/features/character/molecules/ResourceRail.tsx",
  },
  "damage-resistance-source": {
    via: "deriveDamageSourceResistances",
    consumer: "src/features/character/molecules/ResourceRail.tsx",
  },
  "flat-damage-reduction": {
    via: "deriveFlatDamageReductions",
    consumer: "src/features/character/molecules/ResourceRail.tsx",
  },
  "choice-resistance": {
    via: "choiceResistances",
    consumer: "src/features/character/molecules/ResourceRail.tsx",
  },

  // ── Movement → Left HUD speeds + MovementSlider (speed editable) ──
  speed: { via: "speedBonusFt", consumer: "src/lib/smart-tracker.ts" },
  "speed-multiplier": { via: "speedMultiplier", consumer: "src/lib/smart-tracker.ts" },
  "speed-floor": { via: "speedFloorFt", consumer: "src/lib/smart-tracker.ts" },
  "fly-speed": {
    via: "deriveSensesAndSpeeds",
    consumer: "src/features/character/hud/LeftHud.tsx",
  },
  "swim-speed": {
    via: "deriveSensesAndSpeeds",
    consumer: "src/features/character/hud/LeftHud.tsx",
  },
  "climb-speed": {
    via: "deriveSensesAndSpeeds",
    consumer: "src/features/character/hud/LeftHud.tsx",
  },

  // ── Derived stats → cockpit header / Left HUD (each with an override) ──
  "ac-bonus": { via: "computeCharacterAC", consumer: "src/lib/aggregate-character.ts" },
  "ac-formula": { via: "acFormulas", consumer: "src/lib/compute.ts" },
  "medium-armor-dex-cap": { via: "mediumArmorDexCap", consumer: "src/lib/compute.ts" },
  "ability-score-set": {
    via: "effectiveAbilityScores",
    consumer: "src/features/character/hud/LeftHud.tsx",
  },
  "hp-per-level": { via: "hp-per-level", consumer: "src/lib/level-up.ts" },
  "save-bonus": {
    // B8 — the all-saves `saveBonusAbilities`/`saveBonusFlat` layers reach the
    // medallion through the shared `flatSaveBonus` helper, consumed by the
    // `deriveSavesAndChecks` builder (the Stats rail's save/skill/passive math);
    // the helper itself reads `saveBonusAbilities` in compute.ts.
    via: "flatSaveBonus",
    consumer: "src/lib/views/saves-checks-view.ts",
  },
  "ability-check-bonus": {
    via: "resolveAbilityCheckBonus",
    consumer: "src/lib/views/saves-checks-view.ts",
  },
  "initiative-bonus": {
    via: "initiativeBonusAbilities",
    consumer: "src/features/character/center/ThisTurnTracker.tsx",
  },
  "concentration-save-bonus": {
    via: "resolveConcentrationSaveBonus",
    consumer: "src/stores/characterStore.ts",
  },
  "crit-range": {
    via: "critRange",
    consumer: "src/features/character/center/tabs/PlayTab.tsx",
  },
  "death-save-crit-range": {
    via: "deathSaveCritThreshold",
    consumer: "src/lib/compute.ts",
  },
  "spell-save-dc-bonus": {
    via: "resolveCastingModifier",
    consumer: "src/lib/views/spells-view.ts",
  },
  "spell-attack-bonus": {
    via: "resolveCastingModifier",
    consumer: "src/lib/smart-tracker.ts",
  },

  // ── Proficiencies → the shared saves/checks builder (the Left HUD dots
  //    consume it; override-aware) ──
  "save-proficiency": {
    via: "mergeSaveProficiencies",
    consumer: "src/lib/views/saves-checks-view.ts",
  },
  "skill-proficiency": {
    via: "mergeSkillProficiencies",
    consumer: "src/lib/views/saves-checks-view.ts",
  },
  expertise: {
    via: "expertiseSkills",
    consumer: "src/lib/views/saves-checks-view.ts",
  },
  "half-proficiency-all-skills": {
    via: "halfProficiencyAllSkills",
    consumer: "src/lib/views/saves-checks-view.ts",
  },
  language: {
    via: "displayLanguages",
    consumer: "src/features/character/molecules/ResourceRail.tsx",
  },
  "tool-proficiency": {
    via: "displayToolProficiencies",
    consumer: "src/features/character/molecules/ResourceRail.tsx",
  },
  "weapon-proficiency": {
    via: "weaponProficiencies",
    consumer: "src/lib/views/inventory-view.ts",
  },
  "armor-proficiency": {
    via: "armorProficiencies",
    consumer: "src/lib/views/inventory-view.ts",
  },
  "attunement-slots": {
    via: "attunementSlots",
    consumer: "src/lib/views/inventory-view.ts",
  },

  // ── Spell access → Spells tab + cast options ──
  "always-prepared-spell": {
    via: "alwaysPrepared",
    consumer: "src/lib/views/spells-view.ts",
  },
  "free-cast-spell": {
    via: "freeCastSourcesForSpell",
    consumer: "src/lib/views/spell-cast-sources.ts",
  },
  // D4 — Divine Intervention's free-cast-FROM-LIST surfaces as a guided spell picker
  // on the Play board (the action tap opens it; choosing a spell debits the 1/LR
  // tracker). The engine resolver is `resolveFreeCastFromList`.
  "free-cast-from-list": {
    via: "resolveFreeCastFromList",
    consumer: "src/features/character/center/TurnEconomyProvider.tsx",
  },
  "at-will-cast-spell": {
    via: "atWillCastSourcesForSpell",
    consumer: "src/lib/views/spell-cast-sources.ts",
  },
  "scoped-extra-spell-slot": {
    via: "scopedSlotSourcesForSpell",
    consumer: "src/lib/views/spell-cast-sources.ts",
  },

  // ── Spell riders → combat cards + spell cards ──
  "spell-damage-bonus": {
    via: "resolveSpellDamageBonus",
    consumer: "src/lib/smart-tracker.ts",
  },
  "heal-bonus": { via: "resolveHealBonus", consumer: "src/lib/smart-tracker.ts" },
  "spell-damage-type-override": {
    via: "resolveSpellDamageTypeOverrides",
    consumer: "src/lib/smart-tracker.ts",
  },
  "component-waiver": {
    via: "resolveComponentWaiver",
    consumer: "src/lib/smart-tracker.ts",
  },
  "spell-die-augment": {
    via: "resolveSpellDieAugment",
    consumer: "src/lib/views/spells-view.ts",
  },
  "cantrip-damage-bonus": {
    via: "resolveCantripDamageBonus",
    consumer: "src/lib/smart-tracker.ts",
  },
  "cantrip-effect-rider": {
    via: "forcedMovement",
    consumer: "src/features/character/center/tabs/PlayTab.tsx",
  },
  "cantrip-range-bonus": {
    via: "rangeBonusFt",
    consumer: "src/features/character/center/tabs/PlayTab.tsx",
  },

  // ── Weapon / attack seams → combat action cards + inventory rows ──
  "weapon-attack-bonus": {
    via: "weaponAttackBonuses",
    consumer: "src/lib/smart-tracker.ts",
  },
  "weapon-damage-bonus": {
    // #27 — flat damage on scope-matching weapon attacks (Rage Damage): folds
    // into the damage formula on combat rows AND inventory rows, each source
    // named in the damage-breakdown tooltip.
    via: "resolveWeaponDamageBonuses",
    consumer: "src/lib/smart-tracker.ts",
  },
  "weapon-attack-ability": {
    via: "weaponAttackAbilities",
    consumer: "src/lib/smart-tracker.ts",
  },
  "weapon-reach-bonus": {
    via: "weaponReachBonuses",
    consumer: "src/lib/smart-tracker.ts",
  },
  "damage-die-modifier": {
    via: "damageDieModifiers",
    consumer: "src/lib/smart-tracker.ts",
  },
  "damage-rider": { via: "damageRiders", consumer: "src/lib/smart-tracker.ts" },
  "unarmed-strike-die": {
    via: "unarmedStrikeDice",
    consumer: "src/lib/smart-tracker.ts",
  },
  "unarmed-strike-damage-type-option": {
    via: "unarmedStrikeDamageTypeOptions",
    consumer: "src/lib/smart-tracker.ts",
  },
  // ATTACK-PIPS — Extra Attack is LIVE in the economy: the provider derives
  // `attacksPerActionForCharacter` and pushes it as the meter's `attackBudget`, so
  // the Action coin carries N attack pips and each weapon/War-Magic swing rides one.
  "extra-attack": {
    via: "attacksPerAction",
    consumer: "src/features/character/center/TurnEconomyProvider.tsx",
  },
  // B6 — the per-turn ACTION/BONUS budget (Action Surge / Haste): the economy
  // provider derives it via `extraActionsThisTurn` and pushes it into the meter,
  // which renders the "Action 1/2" count token (override-first — a player toggle).
  "extra-action": {
    via: "extraActionsThisTurn",
    consumer: "src/features/character/center/TurnEconomyProvider.tsx",
  },
  "manifested-weapon": { via: "manifestedWeapons", consumer: "src/lib/smart-tracker.ts" },
  "form-attack": { via: "formAttacks", consumer: "src/lib/smart-tracker.ts" },
  "pact-weapon": { via: "pactWeapons", consumer: "src/lib/smart-tracker.ts" },
  "pact-weapon-rider": { via: "pactWeaponRiders", consumer: "src/lib/smart-tracker.ts" },
  "weapon-attack-cantrip": {
    plumbing:
      "dormant duplicate seam: no data emitter — the live True-Strike path is SrdSpellData.weaponAttackCantrip, consumed by resolveWeaponAttackCantrip in smart-tracker",
  },
  "item-bound-bonus": {
    via: "enchantOptions",
    consumer: "src/features/character/center/tabs/inventory/WeaponCard.tsx",
  },
  "on-crit-movement-rider": {
    via: "onCritMoveFt",
    consumer: "src/features/character/center/tabs/PlayTab.tsx",
  },

  // ── Turn / rest state → ThisTurnTracker, RestModal, rail ──
  "temp-hp": { via: "tempHpGrants", consumer: "src/lib/smart-tracker.ts" },
  "regen-at-turn-start": {
    via: "resolveStartOfTurnRegen",
    consumer: "src/features/character/center/ThisTurnTracker.tsx",
  },
  "heroic-inspiration-at-turn-start": {
    via: "heroicInspirationAtTurnStart",
    consumer: "src/features/character/molecules/ResourceRail.tsx",
  },
  "heroic-inspiration-on-rest": {
    via: "heroicInspirationOnLongRest",
    consumer: "src/lib/smart-tracker.ts",
  },
  "exhaustion-recovery": {
    via: "exhaustionRecoveryBonus",
    consumer: "src/stores/characterStore.ts",
  },
  "initiative-tracker-topup": {
    via: "initiativeTrackerTopUps",
    consumer: "src/lib/smart-tracker.ts",
  },
  "at-zero-hp-interrupt": {
    via: "atZeroHpInterrupts",
    consumer: "src/lib/smart-tracker.ts",
  },
  "spell-slot-tracker-recovery": {
    via: "spellSlotTrackerRecoveries",
    consumer: "src/lib/smart-tracker.ts",
  },
  "tracker-alt-recovery": {
    via: "trackerAltRecoveries",
    consumer: "src/lib/smart-tracker.ts",
  },
  "resource-conversion": {
    via: "conversionOptionVMs",
    consumer: "src/features/character/molecules/ResourceConversions.tsx",
  },

  // ── Informational riders → rail sections + feature cards ──
  "advantage-on": {
    via: "advantageChipVMs",
    consumer: "src/features/character/molecules/ResourceRail.tsx",
  },
  "disadvantage-on": {
    via: "deriveAdvantageChips",
    consumer: "src/features/character/molecules/ResourceRail.tsx",
  },
  // Assassin Death Strike's round-1 save-gated damage-doubler note: resolved by
  // `resolveRound1DamageDoubles` + rendered round-1-gated in the turn tracker.
  "round1-damage-double": {
    via: "resolveRound1DamageDoubles",
    consumer: "src/features/character/center/ThisTurnTracker.tsx",
  },
  "roll-floor": {
    via: "rollFloorVMs",
    consumer: "src/features/character/molecules/ResourceRail.tsx",
  },
  // Reckless Attack's SELF-side downside ("attacks against you have Advantage"):
  // surfaced as a framed Disadv. note in the rail's Advantages section.
  "incoming-attack-advantage": {
    via: "incomingAttackAdvantageVMs",
    consumer: "src/features/character/molecules/ResourceRail.tsx",
  },
  // Blur's SELF-side benefit ("attacks against you have Disadvantage"): surfaced
  // as a framed Advantage note in the rail's Advantages section (the mirror).
  "incoming-attack-disadvantage": {
    via: "incomingAttackAdvantageVMs",
    consumer: "src/features/character/molecules/ResourceRail.tsx",
  },
  // Warding Bond's self-side defensive reminder line (shared damage / resistance):
  // a prose line in the rail's Defenses section.
  "defense-note": {
    via: "incomingAttackAdvantageVMs",
    consumer: "src/features/character/molecules/ResourceRail.tsx",
  },
  aura: { via: "auraVMs", consumer: "src/features/character/molecules/ResourceRail.tsx" },
  "copy-to-2nd-target": {
    via: "copyTargetVMs",
    consumer: "src/features/character/center/tabs/FeaturesTab.tsx",
  },

  // ── Choice engine (pickers — the choice IS the surface) ──
  "ability-score": { via: "featAsi", consumer: "src/lib/feat-asi.ts" },
  "choice-ability-score": { via: "featAsi", consumer: "src/lib/feat-asi.ts" },
  "choice-skill-proficiency": {
    via: "pendingChoices",
    consumer: "src/lib/feature-choices.ts",
  },
  "choice-language": {
    via: "choice-language",
    consumer: "src/lib/feat-language-choices.ts",
  },
  "choice-tool-proficiency": {
    via: "choice-tool",
    consumer: "src/lib/feat-tool-choices.ts",
  },
  "choice-skill-or-tool-proficiency": {
    via: "choice-skill-or-tool",
    consumer: "src/lib/feat-skill-tool-choices.ts",
  },
  "choice-expertise": {
    via: "choice-expertise",
    consumer: "src/lib/feat-expertise-choices.ts",
  },
  "choice-cantrip": { via: "choice-cantrip", consumer: "src/lib/feat-spell-choices.ts" },
  "choice-spell": { via: "choice-spell", consumer: "src/lib/feat-spell-choices.ts" },
  "choice-feat": { via: "choice-feat", consumer: "src/lib/feat-feat-choices.ts" },
  "while-active": {
    via: "activatableToggles",
    consumer: "src/features/character/molecules/ResourceRail.tsx",
  },
  "choice-grant-bundle": {
    via: "GrantBundleSelector",
    consumer: "src/features/character/molecules/ResourceRail.tsx",
  },

  // ── Ritual access (equivalent-path plumbing) ──
  "ritual-casting": {
    plumbing:
      "paired with always-prepared-spell on every emitter; the ritual affordance resolves through canRitualCast (data.ritual + prepared) in spells-view — the grant is a redundant record",
  },
  "ritual-casting-any": {
    plumbing:
      "Wizard Ritual Adept is the classId === 'wizard' branch in canRitualCast — same behavior, no aggregate read",
  },
  "granted-action": {
    plumbing:
      "deliberately dormant: mechanics.actions is the action-row surface (classes-prose-sweep decision); the kind exists for sources that lack a mechanics block",
  },

  // ── Shipped 2026-06-22: formerly OPEN, now consumed ──
  "hp-flat": {
    via: "effectiveMaxHp",
    consumer: "src/lib/aggregate-character.ts",
  },
  "cunning-strike-option": {
    via: "resolveCunningStrikeOptions",
    consumer: "src/features/character/center/tabs/PlayTab.tsx",
  },

  // ── Shipped (S6 play affordances): formerly OPEN, now consumed ──
  "familiar-enhancement": {
    via: "resolveFamiliarEnhancements",
    consumer: "src/features/compendium/picker/specs/invocation.tsx",
  },
  // ATTACK-PIPS — War Magic became an INTERACTION: the provider reads
  // `resolveReplaceAttackWithCast` to route a mid-Attack-action cantrip cast onto
  // an attack pip (replace an attack) instead of a fresh Action slot.
  "replace-attack-with-cast": {
    via: "resolveReplaceAttackWithCast",
    consumer: "src/features/character/center/TurnEconomyProvider.tsx",
  },
};

describe("grant-kind exposure guard — no Grant kind ships invisible", () => {
  const kinds = grantKinds();

  it("extracts a sane kind list from the Grant union", () => {
    expect(kinds.length).toBeGreaterThanOrEqual(90);
    expect(kinds).toContain("darkvision");
    expect(kinds).toContain("aura");
  });

  it("every Grant kind has a registered exposure entry (new kinds must register a consumer)", () => {
    const missing = kinds.filter((k) => !(k in EXPOSURE));
    expect(missing).toEqual([]);
  });

  it("no stale exposure entry for a removed kind", () => {
    const set = new Set(kinds);
    expect(Object.keys(EXPOSURE).filter((k) => !set.has(k))).toEqual([]);
  });

  it("every EXPOSED entry's consumer file exists and reads its seam token", () => {
    const failures: string[] = [];
    for (const [kind, e] of Object.entries(EXPOSURE)) {
      if (!("via" in e)) continue;
      let src: string;
      try {
        src = read(e.consumer);
      } catch {
        failures.push(`${kind}: consumer file missing — ${e.consumer}`);
        continue;
      }
      if (!src.includes(e.via)) {
        failures.push(`${kind}: ${e.consumer} no longer reads "${e.via}"`);
      }
    }
    expect(failures).toEqual([]);
  });

  it("every OPEN gap is recorded in docs/AUTOMATION_COVERAGE.md (the backlog can't lose it)", () => {
    const doc = read("docs/AUTOMATION_COVERAGE.md");
    const missing = Object.entries(EXPOSURE)
      .filter((e): e is [string, { open: string }] => "open" in e[1])
      .map(([kind]) => kind)
      .filter((kind) => !doc.includes(`\`${kind}\``));
    expect(missing).toEqual([]);
  });
});
