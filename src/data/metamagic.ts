/**
 * SRD Metamagic Options (2024 PHB).
 *
 * Source: SRD 5.2.1 Metamagic (facts cross-checked against
 * http://dnd2024.wikidot.com/sorcerer:metamagic); the display text lives in
 * the srd i18n catalogues. Cost values are sorcery points spent per use.
 *
 * Sorcerer gains 2 Metamagic options at L2, 2 more at L10, 2 more at L17.
 */

export interface SrdMetamagicOption {
  /** Slug, e.g. "careful-spell". */
  id: string;
  /** Sorcery point cost per use. */
  cost: number;
  /**
   * RAW "one Metamagic option per casting" exception (BUG-6). 2024 lets you use
   * only ONE Metamagic option on a spell when you cast it — EXCEPT the two whose
   * SRD text grants the explicit exception "You can use {Option} even if you've
   * already used a different Metamagic option during the casting of the spell"
   * (Empowered Spell, Seeking Spell — verified against
   * http://dnd2024.wikidot.com/sorcerer:metamagic). Those carry
   * `stacksWithPrimary: true`; every other option is a "primary" (at most one
   * primary per cast). The cast modal enforces this: a primary is selectable only
   * when no other primary is selected (a 2nd primary SWAPS the first); stackers
   * are always additive on top. SP cost stays the sum of the selected options.
   * Omit (falsy) for the eight primaries.
   */
  stacksWithPrimary?: boolean;
  /**
   * Declarative grants a chosen Metamagic option contributes to the grant
   * pipeline (METAMAGIC → GRANT seam, mirroring Eldritch Invocations + Battle
   * Master maneuvers). `resolveGrantSourcesForMetamagic` resolves each chosen
   * option id (`ClassEntry.metamagicChoices`) to its row and emits these as a
   * `GrantSource`, so any standing effect an option carries flows through
   * `evaluateGrants` like any other source.
   *
   * The ten core 2024 Metamagic options are PER-CAST spell modifiers (Quickened
   * → bonus-action casting time, Distant → double range, Empowered → reroll
   * damage dice). Those are resolved at the cast layer, not as standing grants,
   * so they carry no `grants` today — but the seam exists so a future option (or
   * a homebrew/subclass metamagic with a standing effect) is wired by data alone,
   * exactly like an invocation. Omit when the option has no standing grant.
   */
  grants?: ReadonlyArray<import("@/lib/grants").Grant>;
  /**
   * Per-cast applicability metadata — DATA-DRIVEN so the cast-time affordance's
   * "does this option apply to THIS spell?" predicate
   * (`metamagicOptionsForCast`, `lib/cast-options.ts`) never regexes English
   * (golden rule 7). Each flag, when set, narrows the spells the option
   * can be applied to — and the SAME flags correctly gate CANTRIPS (G6/W3: 2024
   * reversed the 2014 "Metamagic never touches cantrips" assumption; most options
   * DO apply to cantrips, the inapplicable ones are filtered by these structured
   * conditions, never a blanket level-0 drop). Verified against
   * http://dnd2024.wikidot.com/sorcerer:metamagic:
   *  - `requiresSave` (Careful, Heightened): the spell must force a saving throw
   *    (`SrdSpellData.saveAbility` present) — so Sacred Flame (DEX save) qualifies.
   *  - `requiresActionCastingTime` (Quickened): the spell's casting time must be
   *    an Action (so Quickened can shorten it to a Bonus Action) — never an
   *    already-bonus/reaction/ritual-time spell.
   *  - `requiresDamage` (Empowered "When you roll damage for a spell"; Transmuted
   *    "a spell that deals … damage"): the spell must have damage dice
   *    (`SrdSpellData.damageDice` present) — so Fire Bolt (1d10) qualifies.
   *  - `requiresAttack` (Seeking "If you make an attack roll for a spell and
   *    miss"): the spell must make a spell attack roll (`SrdSpellData.attackType`
   *    present) — so Fire Bolt (ranged attack) qualifies.
   *  - `excludesCantrip` (Extended needs a 1-minute+ duration; Twinned needs a
   *    single-target spell castable at a higher level to add a target — neither
   *    is possible for a cantrip per RAW): never offered on a level-0 spell.
   * Options with NO flag set apply broadly (Distant/Subtle) — offered on every
   * cast (cantrip or levelled); the player decides whether the option is
   * meaningful (the app surfaces the option + debits SP; it never re-routes the
   * action economy or rolls dice — golden rule 21).
   */
  appliesWhen?: {
    requiresSave?: boolean;
    requiresActionCastingTime?: boolean;
    requiresDamage?: boolean;
    requiresAttack?: boolean;
    excludesCantrip?: boolean;
  };
}

/**
 * All 10 SRD 2024 Metamagic options.
 * Italian translations are currently a placeholder of the EN text where
 * an official Asmodee Italia 2024 SRD translation isn't yet available
 * for that option; this matches the project's "leave existing IT value
 * and flag, do NOT guess" policy from domain rule D2 (docs/GOLDEN_RULES.md).
 */
export const SRD_METAMAGIC: SrdMetamagicOption[] = [
  {
    id: "careful-spell",
    cost: 1,
    // "When you cast a spell that forces other creatures to make a saving throw"
    // — only meaningful on a spell that forces a save (cantrips like Sacred Flame
    // qualify; Fire Bolt does not).
    appliesWhen: { requiresSave: true },
  },
  {
    id: "distant-spell",
    cost: 1,
  },
  {
    id: "empowered-spell",
    cost: 1,
    // RAW exception — usable EVEN IF another option was already used this cast.
    stacksWithPrimary: true,
    // "When you roll damage for a spell" — only a spell that deals damage dice.
    appliesWhen: { requiresDamage: true },
  },
  {
    id: "extended-spell",
    cost: 1,
    // "a spell that has a duration of 1 minute or longer" — no cantrip qualifies
    // (and we carry no structured duration to gate levelled spells finer).
    appliesWhen: { excludesCantrip: true },
  },
  {
    id: "heightened-spell",
    cost: 2,
    // "When you cast a spell that forces a creature to make a saving throw" — only
    // meaningful on a save spell (cantrips like Sacred Flame qualify).
    appliesWhen: { requiresSave: true },
  },
  {
    id: "quickened-spell",
    cost: 2,
    // "change the casting time ... from an action to a Bonus Action" — only a
    // spell whose casting time is an Action can be Quickened.
    appliesWhen: { requiresActionCastingTime: true },
  },
  {
    id: "seeking-spell",
    cost: 1,
    // RAW exception — usable EVEN IF another option was already used this cast.
    stacksWithPrimary: true,
    // "If you make an attack roll for a spell and miss" — only a spell-attack
    // spell (Fire Bolt's ranged attack qualifies).
    appliesWhen: { requiresAttack: true },
  },
  {
    id: "subtle-spell",
    cost: 1,
  },
  {
    id: "transmuted-spell",
    cost: 1,
    // "a spell that deals a type of damage from the following list" — only a
    // damage-dealing spell.
    appliesWhen: { requiresDamage: true },
  },
  {
    id: "twinned-spell",
    cost: 1,
    // "a spell ... that can be cast with a higher-level spell slot to target an
    // additional creature" — a cantrip can't be upcast to add a target.
    appliesWhen: { excludesCantrip: true },
  },
];

/** Stable-id → option lookup (the SP-cost + applicability source of truth). */
export const METAMAGIC_BY_ID = new Map(SRD_METAMAGIC.map((m) => [m.id, m] as const));
