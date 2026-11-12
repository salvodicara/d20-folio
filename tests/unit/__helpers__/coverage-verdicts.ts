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
 * verdicts file (read at run time), never here.
 */

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
    verdict: "missing",
    evidence: ["character-store-d20-lifecycle.test.ts"],
    note: "the paladin's own saves are automatic; allies in the aura get nothing",
    until: "#1089",
    waitsFor: ["usePartyAura"],
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
    verdict: "missing",
    evidence: [],
    note: "the grant is collected and shown as a note; no roll is floored to 10",
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
];
