/**
 * What the app really does with an entry, checked against the code and its tests, not
 * read from what the entry's data declares (the rules lane's audits, 2026-11-12). The
 * played-content view shows this beside the declaration, so an effect the data
 * declares but no screen applies stops reading as automatic. Public SRD ids only here
 * (a guard checks it); verdicts on pack entries are local input, read at run time.
 *
 *  - auto: the app applies it, proven by the tests named;
 *  - by-hand: the player or the DM applies it (a tap, a note, the table's ruling);
 *  - missing: a table would want the app to apply it and it does not;
 *  - impossible: the app cannot represent it today;
 *  - wrong: the app applies something the rule does not say.
 *
 * A mixed entry takes its weakest part's verdict and says the rest in `note`.
 *
 * A verdict is only as good as its tests (coordinator, 2026-11-12): an «auto» or
 * «by-hand» verdict with no test it can cite reads «unproven»; a verdict waiting on an
 * open change names what a screen will call (`waitsFor`), and turns into «re-check»
 * once a screen calls it. Entries proven only by a pack test live in the pack's own
 * verdicts file, never here: `content-pack/coverage/verdicts.json`, read when the pack
 * is linked ({@link packVerdicts}).
 */
import { existsSync, readFileSync } from "node:fs";

/** The pack's verdicts file, inside the linked pack. */
export const PACK_VERDICTS_FILE = "content-pack/coverage/verdicts.json";

/** The pack's verdicts, or none when the pack is not linked or has no file. */
export function packVerdicts(): CoverageVerdict[] {
  if (!existsSync(PACK_VERDICTS_FILE)) return [];
  return JSON.parse(readFileSync(PACK_VERDICTS_FILE, "utf8")) as CoverageVerdict[];
}

export type Verdict = "auto" | "by-hand" | "missing" | "impossible" | "wrong";

/** What the report shows: the verdict, or why it cannot be trusted yet. */
export type ShownVerdict = Verdict | "unproven" | "re-check";

export interface CoverageVerdict {
  id: string;
  verdict: Verdict;
  /** Test files under tests/unit that prove what is automatic. */
  evidence: readonly string[];
  note?: string;
  /** The open PR that changes the verdict when it lands. */
  until?: string;
  /** With `until`: the function or hook a screen calls once that change lands. */
  waitsFor?: readonly string[];
  /** In the pack's verdicts file only: its tests under content-pack/tests/unit. */
  packEvidence?: readonly string[];
}

/** The verdict to show, given which functions screens call today. */
export function shownVerdict(
  verdict: CoverageVerdict,
  screenCalls: (fn: string) => boolean
): ShownVerdict {
  if (verdict.waitsFor?.some(screenCalls)) return "re-check";
  const proven = verdict.evidence.length + (verdict.packEvidence?.length ?? 0) > 0;
  if ((verdict.verdict === "auto" || verdict.verdict === "by-hand") && !proven)
    return "unproven";
  return verdict.verdict;
}

export const PUBLIC_VERDICTS: readonly CoverageVerdict[] = [
  // Bard (Lore)
  {
    id: "bard-bardic-inspiration",
    verdict: "auto",
    evidence: ["rest-modal-short-rest-roll.test.tsx", "initiative-tracker-topup.test.ts"],
  },
  {
    id: "bard-jack-of-all-trades",
    verdict: "auto",
    evidence: ["jack-of-all-trades.test.ts"],
  },
  { id: "bard-expertise", verdict: "auto", evidence: ["expertise-pick.test.ts"] },
  {
    id: "bard-font-of-inspiration",
    verdict: "auto",
    evidence: ["spell-slot-tracker-recovery.test.ts", "character-store-rest.test.ts"],
  },
  {
    id: "bard-lore-cutting-words",
    verdict: "by-hand",
    evidence: ["roll-reactions.test.ts", "conformance/06-reactions-timing.test.ts"],
    note: "the enemy's roll belongs to the DM",
  },
  {
    id: "bard-countercharm",
    verdict: "by-hand",
    evidence: ["roll-rerolls.test.ts"],
    note: "auto on the bard's own save; allies reroll on their own sheet",
  },
  {
    id: "bard-lore-additional-magical-secrets",
    verdict: "auto",
    evidence: ["choice-spell-multi-list.test.ts"],
  },
  {
    id: "bard-magical-secrets",
    verdict: "auto",
    evidence: ["choice-spell-multi-list.test.ts"],
  },
  // Paladin
  {
    id: "paladin-lay-on-hands",
    verdict: "auto",
    evidence: [
      "damage-tray.test.ts",
      "simple-resource-use.test.tsx",
      "alternate-action-cost.test.ts",
    ],
  },
  {
    id: "paladin-divine-smite",
    verdict: "auto",
    evidence: ["paladin-combat-contract.test.ts", "state-activated-by-cast.test.ts"],
  },
  {
    id: "paladin-channel-divinity",
    verdict: "auto",
    evidence: ["divine-sense.test.ts", "raw-2024-tracker-corrections.test.ts"],
  },
  {
    id: "paladin-aura-of-protection",
    verdict: "auto",
    evidence: [
      "aura-of-protection.test.ts",
      "aura-of-protection-published.test.ts",
      "use-party-aura.test.tsx",
      "folio-molecules.test.tsx",
    ],
    note: "the ally says when they stand outside the aura (a chip); the paladin's own saves too; the published aura's access rule is checked in tests/rules/firestore-rules.test.ts",
  },
  // Rogue
  { id: "rogue-sneak-attack", verdict: "auto", evidence: ["rogue-sneak-attack.test.ts"] },
  {
    id: "rogue-cunning-action",
    verdict: "auto",
    evidence: ["rogue-sneak-attack.test.ts", "rogue-steady-aim.test.tsx"],
  },
  { id: "rogue-steady-aim", verdict: "auto", evidence: ["rogue-steady-aim.test.tsx"] },
  {
    id: "rogue-cunning-strike",
    verdict: "auto",
    evidence: ["cunning-strike-consumer.test.ts", "cunning-strike-option.test.ts"],
  },
  { id: "rogue-expertise", verdict: "auto", evidence: ["expertise-pick.test.ts"] },
  { id: "rogue-evasion", verdict: "auto", evidence: ["evasion-tray.test.ts"] },
  {
    id: "rogue-reliable-talent",
    verdict: "by-hand",
    evidence: ["reliable-talent.test.ts", "play-check.test.tsx"],
    note: "automatic on the check entries (Hide, escape, Search/Study/Influence) on both UIs; checks rolled at the table keep the rail note",
  },
  { id: "rogue-uncanny-dodge", verdict: "auto", evidence: ["damage-stages.test.ts"] },
  // Barbarian
  {
    id: "barbarian-rage",
    verdict: "auto",
    evidence: ["character-store.test.ts", "effect-chips-view.test.ts"],
  },
  {
    id: "barbarian-reckless-attack",
    verdict: "auto",
    evidence: ["attack-scope-clauses.test.tsx", "advantage-rail.test.ts"],
  },
  { id: "barbarian-primal-knowledge", verdict: "auto", evidence: ["grants.test.ts"] },
  {
    id: "barbarian-instinctive-pounce",
    verdict: "by-hand",
    evidence: ["conformance/11-movement.test.ts"],
    note: "a separate free row, not attached to Rage",
  },
  {
    id: "barbarian-extra-attack",
    verdict: "auto",
    evidence: ["speed-breakdown.test.ts"],
  },
  {
    id: "barbarian-fast-movement",
    verdict: "auto",
    evidence: ["speed-breakdown.test.ts"],
  },
  // Monk
  ...[
    "monk-martial-arts",
    "monk-focus",
    "monk-flurry-of-blows",
    "monk-patient-defense",
    "monk-step-of-the-wind",
    "monk-deflect-attacks",
    "monk-slow-fall",
    "monk-stunning-strike",
    "monk-empowered-strikes",
    "monk-evasion",
  ].map(
    (id): CoverageVerdict => ({
      id,
      verdict: "auto",
      evidence: [
        "smart-tracker.test.ts",
        "monk-focus-rows.test.ts",
        "jump-distances.test.ts",
        "reaction-trigger-structured.test.ts",
        "action-outcome-rider.test.ts",
        "unarmed-strike-damage-type-option.test.ts",
        "evasion-tray.test.ts",
      ],
    })
  ),
  {
    id: "monk-uncanny-metabolism",
    verdict: "by-hand",
    evidence: ["feature-action-effects.test.ts"],
    note: "one tap works; nothing prompts it at initiative",
  },
  // Wizard
  {
    id: "wizard-arcane-recovery",
    verdict: "auto",
    evidence: ["arcane-recovery.test.ts"],
  },
  { id: "wizard-ritual-adept", verdict: "auto", evidence: ["ritual.test.ts"] },
  {
    id: "wizard-memorize-spell",
    verdict: "auto",
    evidence: ["memorize-spell.test.ts"],
    note: "one prepared-spell swap on a Short Rest",
  },
  // Fighter, feats
  {
    id: "fighter-second-wind",
    verdict: "auto",
    evidence: ["resources-view.test.ts", "cockpit-economy-in-play.test.tsx"],
  },
  { id: "fighter-action-surge", verdict: "auto", evidence: ["turn-economy.test.ts"] },
  {
    id: "alert",
    verdict: "auto",
    evidence: ["initiative-bonus.test.ts", "party-unified.test.tsx"],
  },
  {
    id: "magic-initiate-cleric",
    verdict: "auto",
    evidence: ["spell-cast-sources.test.ts", "grants-phase-c.test.ts"],
  },
  {
    id: "magic-initiate-wizard",
    verdict: "auto",
    evidence: ["spell-cast-sources.test.ts", "grants-phase-c.test.ts"],
  },
  {
    id: "savage-attacker",
    verdict: "by-hand",
    evidence: ["rider-view.test.ts"],
    note: "no once-per-turn tracking",
  },
  // Code-checked by the rules lane (2026-11-12), the played rows that were unproven.
  {
    id: "bard-lore-bonus-proficiencies",
    verdict: "auto",
    evidence: ["feature-choices.test.ts"],
    note: "3 skills of any kind at level 3",
  },
  {
    id: "bard-spellcasting",
    verdict: "auto",
    evidence: [
      "multiclass-slots.test.ts",
      "prepared-caster-classification.test.ts",
      "compute.test.ts",
    ],
    note: "from the class table",
  },
  {
    id: "bard-asi",
    verdict: "auto",
    evidence: ["level-up.test.ts", "level-up-plan.test.ts"],
    note: "class-table `asi` flag (tests use a Fighter; same flag)",
  },
  {
    id: "barbarian-danger-sense",
    verdict: "auto",
    evidence: ["advantage-rail.test.ts"],
    note: "off while Incapacitated",
  },
  { id: "barbarian-unarmored-defense", verdict: "auto", evidence: ["compute.test.ts"] },
  {
    id: "barbarian-weapon-mastery",
    verdict: "auto",
    evidence: [
      "weapon-mastery-pick.test.ts",
      "features-weapon-mastery-repick.test.tsx",
      "mastery-riders.test.ts",
      "mastery-hit-effects.test.ts",
    ],
  },
  {
    id: "wizard-asi",
    verdict: "auto",
    evidence: ["level-up.test.ts", "level-up-plan.test.ts"],
    note: "same `asi` flag",
  },
  {
    id: "monk-extra-attack",
    verdict: "auto",
    evidence: ["compute.test.ts"],
    note: "same `extra-attack` grant",
  },
  {
    id: "paladin-extra-attack",
    verdict: "auto",
    evidence: ["compute.test.ts"],
    note: "same grant",
  },
  {
    id: "paladin-faithful-steed",
    verdict: "auto",
    evidence: ["species-lineage-spells.test.ts"],
  },
  {
    id: "paladin-fighting-style",
    verdict: "auto",
    evidence: ["owed-fighting-style.test.ts", "paladin-combat-contract.test.ts"],
  },
  {
    id: "paladin-fighting-style-defense",
    verdict: "auto",
    evidence: ["flat-feature-ac-bonus.test.ts"],
  },
  { id: "wizard-scholar", verdict: "auto", evidence: ["scholar-expertise-pool.test.ts"] },
  {
    id: "paladin-spellcasting",
    verdict: "auto",
    evidence: [
      "multiclass-slots.test.ts",
      "slot-gated-prepared.test.ts",
      "prepared-caster-classification.test.ts",
    ],
  },
  {
    id: "wizard-spellcasting",
    verdict: "missing",
    evidence: ["multiclass-slots.test.ts", "slot-gated-prepared.test.ts"],
    note: "spellbook not modelled: level 1 gets 4 (prepared count) not 6; level-up gives no 2 free spellbook spells",
  },
  {
    id: "rogue-thieves-cant",
    verdict: "auto",
    evidence: ["feat-language-choices.test.ts", "grants.test.ts"],
  },
  { id: "monk-unarmored-defense", verdict: "auto", evidence: ["compute.test.ts"] },
  {
    id: "monk-unarmored-movement",
    verdict: "auto",
    evidence: ["unarmored-movement-speed.test.ts"],
  },
  {
    id: "rogue-weapon-mastery",
    verdict: "auto",
    evidence: ["weapon-mastery-pick.test.ts", "mastery-hit-effects.test.ts"],
  },
  {
    id: "paladin-weapon-mastery",
    verdict: "auto",
    evidence: ["weapon-mastery-pick.test.ts", "mastery-hit-effects.test.ts"],
  },
  {
    id: "human:resourceful",
    verdict: "auto",
    evidence: ["heroic-inspiration-on-rest.test.ts"],
  },
  {
    id: "human:skillful",
    verdict: "auto",
    evidence: ["unresolved-build-choices.test.ts"],
  },
  {
    id: "human:versatile",
    verdict: "auto",
    evidence: ["unresolved-build-choices.test.ts", "sync-origin-feats.test.ts"],
  },
  {
    id: "elf:darkvision",
    verdict: "auto",
    evidence: ["resolve-grant-sources-race.test.ts", "species-lineage-spells.test.ts"],
  },
  {
    id: "elf:keen-senses",
    verdict: "auto",
    evidence: ["species-choices.test.ts"],
    note: "the Insight, Perception or Survival pick",
  },
  {
    id: "elf:elven-lineage",
    verdict: "by-hand",
    evidence: ["species-lineage-spells.test.ts"],
    note: "High Elf cantrip swap after a Long Rest not offered",
  },
  {
    id: "elf:fey-ancestry",
    verdict: "auto",
    evidence: ["species-condition-advantages.test.ts", "grants.test.ts"],
    note: "carries Trance's sleep immunity (label only)",
  },
  { id: "orc:adrenaline-rush", verdict: "auto", evidence: ["grants-phase-c.test.ts"] },
  {
    id: "orc:darkvision",
    verdict: "auto",
    evidence: ["resolve-grant-sources-race.test.ts"],
  },
  {
    id: "orc:relentless-endurance",
    verdict: "auto",
    evidence: ["zero-hp-consequence.test.ts", "character-store-rest.test.ts"],
  },
  {
    id: "gnome:darkvision",
    verdict: "auto",
    evidence: ["resolve-grant-sources-race.test.ts"],
  },
  {
    id: "gnome:gnome-cunning",
    verdict: "auto",
    evidence: ["species-condition-advantages.test.ts"],
  },
  {
    id: "gnome:gnomish-lineage",
    verdict: "by-hand",
    evidence: ["species-lineage-spells.test.ts"],
    note: "clockwork device text only",
  },
  {
    id: "tiefling:darkvision",
    verdict: "auto",
    evidence: ["resolve-grant-sources-race.test.ts"],
  },
  {
    id: "tiefling:fiendish-legacy",
    verdict: "auto",
    evidence: ["species-lineage-spells.test.ts"],
  },
  {
    id: "tiefling:otherworldly-presence",
    verdict: "auto",
    evidence: ["species-lineage-spells.test.ts"],
  },
  {
    id: "barbarian-feral-instinct",
    verdict: "auto",
    evidence: ["surprise-state.test.ts"],
  },
];
