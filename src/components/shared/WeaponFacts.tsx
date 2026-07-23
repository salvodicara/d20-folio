/**
 * WeaponFacts — the ONE weapon-facts block both weapon surfaces render
 * (owner mandate 2026-06-12: the combat action card and the inventory
 * WeaponCard must be EQUIVALENT — same information, one component, so any fix
 * propagates to both).
 *
 * Renders a {@link WeaponFactsVM} (built by the ONE `buildWeaponFacts`
 * presenter from either the combat or the inventory presenter) as:
 *  - the labelled facts grid — damage (a Versatile weapon shows explicit
 *    one-handed / two-handed rows), the glossed to-hit, the range — plus any
 *    per-surface extra rows (inventory: weight, enchant) appended after;
 *  - the chip foot — category, properties, OWNED masteries — where every
 *    non-obvious term wears the ONE GlossaryTip primitive (a quiet dotted
 *    trigger; tap explains the rule in plain language, EN + IT). A mastery
 *    chip can only appear here when the engine surfaced an OWNED mastery —
 *    the unowned case is unrepresentable by construction.
 *
 * Per-surface extras stay OUTSIDE this component: combat keeps its CTA /
 * economy / wield-stance, inventory keeps its qty / equip / edit fields.
 */
import type { ComponentType, ReactNode, SVGProps } from "react";
import { useTranslation } from "react-i18next";
import { Swords, Crosshair, Ruler } from "lucide-react";
import { GlossaryTip, type GlossaryTermId } from "@/components/shared/GlossaryTip";
import { BreakdownTip } from "@/components/shared/BreakdownTip";
import { ActionRiders } from "@/components/shared/ActionRiders";
import { UniversalCardFacts, UniversalCardFoot } from "@/components/shared/UniversalCard";
import { formatModifier } from "@/lib/utils";
import type { BreakdownLine } from "@/lib/value-breakdown";
import type { RiderVM } from "@/lib/views/rider-view";
import type { WeaponChipVM, WeaponFactsVM } from "@/lib/views/weapon-facts-view";

/**
 * Stable chip id → glossary term. Literal `term:` entries keep the catalogue's
 * no-dead-entry guard satisfied. Terms are judged per rule 19: every property,
 * category, and mastery token carries a real 2024 rule a beginner can't infer
 * from the name alone, so each gets a tip; "special" is absent because no 2024
 * SRD weapon carries it (and a custom property has no stable id → plain chip).
 */
const CHIP_TERM: Record<string, { term: GlossaryTermId }> = {
  "category:simple": { term: "weaponSimple" },
  "category:martial": { term: "weaponMartial" },
  "property:finesse": { term: "weaponFinesse" },
  "property:light": { term: "weaponLight" },
  "property:heavy": { term: "weaponHeavy" },
  "property:reach": { term: "weaponReach" },
  "property:two-handed": { term: "weaponTwoHanded" },
  "property:versatile": { term: "weaponVersatile" },
  "property:thrown": { term: "weaponThrown" },
  "property:ammunition": { term: "weaponAmmunition" },
  "property:loading": { term: "weaponLoading" },
  "mastery:cleave": { term: "masteryCleave" },
  "mastery:graze": { term: "masteryGraze" },
  "mastery:nick": { term: "masteryNick" },
  "mastery:push": { term: "masteryPush" },
  "mastery:sap": { term: "masterySap" },
  "mastery:slow": { term: "masterySlow" },
  "mastery:topple": { term: "masteryTopple" },
  "mastery:vex": { term: "masteryVex" },
};

/** One per-surface extra facts row (inventory weight / value / enchant). */
export interface WeaponExtraFact {
  label: ReactNode;
  value: ReactNode;
  /** Optional 12px lucide anchor (the typed-document icon-anchored stat row). */
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
}

/** A chip, glossed when its stable id maps to a glossary term. The popover
 *  rubric is the term name WITHOUT the per-weapon parenthetical ("Thrown", not
 *  "Thrown (Range 20/60)") — the numbers stay on the visible chip. */
function WeaponChip({ chip }: { chip: WeaponChipVM }) {
  const entry = chip.id ? CHIP_TERM[`${chip.kind}:${chip.id}`] : undefined;
  if (!entry) return chip.label;
  return (
    <GlossaryTip term={entry.term} rubric={chip.label.replace(/\s*\(.*\)\s*$/, "")}>
      {chip.label}
    </GlossaryTip>
  );
}

export function WeaponFacts({
  facts,
  extraFacts,
  footExtra,
  onSpendRider,
  depletedTrackers,
  children,
}: {
  facts: WeaponFactsVM;
  /** Per-surface rows appended to the grid (inventory: weight, enchant). */
  extraFacts?: WeaponExtraFact[];
  /** Per-surface foot action (combat: the pin/unpin button). */
  footExtra?: ReactNode;
  /**
   * Spend a consumable on-hit rider (combat surface only) — debits the backing
   * resource with a 5s undo toast. Absent on the inventory card, so its rider
   * tokens render read-only by construction.
   */
  onSpendRider?: (rider: RiderVM) => void;
  /** Tracker ids whose backing resource is depleted (disables those tokens). */
  depletedTrackers?: ReadonlySet<string>;
  /** Per-surface content BETWEEN the grid and the chip foot (combat: the
   *  Versatile wield-stance toggle). */
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const damageTypeWord = t(`srd.damage_${facts.damageTypeId}`);

  // The damage label opens the per-source breakdown popover when the engine
  // composed one ("+3 STR · +2 Rage (active)" — issue #27). ONE seam: both
  // weapon surfaces feed the breakdown through `facts.breakdown`, so the combat
  // card and inventory card read identically. The per-source modifiers are the
  // same in one-handed / two-handed wield, so a Versatile weapon shows the tip
  // on both labelled rows.
  const damageLabel = (text: string, lines: ReadonlyArray<BreakdownLine> | null) =>
    lines ? <BreakdownTip label={text} lines={lines} flavor="damage" /> : text;

  // The to-hit VALUE opens its own per-source breakdown popover when the engine
  // composed one ("+3 STR · +2 PB · +2 Archery" — #94) — the to-hit sibling of
  // the damage tip, erasing the asymmetry where only damage decomposed. ONE seam:
  // both weapon surfaces feed it through `facts.attackBreakdown`, so combat and
  // inventory read identically. Suppressed under an attackBonusOverride (no
  // composition to explain — override-first).
  const toHitValue = (node: ReactNode, lines: ReadonlyArray<BreakdownLine> | null) =>
    lines ? <BreakdownTip label={node} lines={lines} flavor="value" /> : node;

  // translate="no" on the dice-formula values ("1d8+3 Slashing", "+5") ONLY:
  // a machine translator mangles dice notation ("1d8" is not prose). Labels and
  // range stay translatable — translation is allowed app-wide (issue #24 is
  // crash-proofed by src/lib/dom-resilience.ts, not by banning translation).
  const formula = (text: string): ReactNode => <span translate="no">{text}</span>;

  // Icon-anchored stat rows (the typed-document reading spread, DESIGN.md §5 —
  // an anchor in the label ink, never decoration): blades for damage, the
  // crosshair for the attack roll (the same anchor the spell-attack fact uses),
  // the ruler for range. One vocabulary on BOTH weapon surfaces (combat +
  // inventory render this one component).
  const rows: WeaponExtraFact[] = [
    // A Versatile weapon shows explicitly LABELLED one-handed / two-handed rows.
    ...(facts.damageTwoHanded
      ? [
          {
            label: damageLabel(t("equipment.damageOneHanded"), facts.breakdown),
            value: formula(`${facts.damageOneHanded} ${damageTypeWord}`),
            icon: Swords,
          },
          {
            label: damageLabel(t("equipment.damageTwoHanded"), facts.breakdown),
            value: formula(`${facts.damageTwoHanded} ${damageTypeWord}`),
            icon: Swords,
          },
        ]
      : [
          {
            label: damageLabel(t("equipment.damage"), facts.breakdown),
            value: formula(`${facts.damageOneHanded} ${damageTypeWord}`),
            icon: Swords,
          },
        ]),
    {
      // P2 — the to-hit label glosses the attack roll via the ONE GlossaryTip;
      // the value opens the per-source to-hit breakdown (#94) when composed.
      label: <GlossaryTip term="attackRoll" rubric={t("srd.toHit")} />,
      value: toHitValue(
        formula(formatModifier(facts.attackBonus)),
        facts.attackBreakdown
      ),
      icon: Crosshair,
    },
    { label: t("spells.range"), value: facts.range ?? undefined, icon: Ruler },
    ...(extraFacts ?? []),
  ];

  return (
    <>
      <UniversalCardFacts facts={rows} />
      {/* RA-17 — the Heavy-property attack-roll Disadvantage advisory (relevant
          effective STR/DEX < 13). A quiet self-side caution, rendered BEFORE the
          on-hit content because it modifies the attack roll itself (no resource,
          no dice — golden rule 21). Absent when the score reaches 13. */}
      {facts.heavyDisadvantage && (
        <div className="rider-strip">
          <p className="rider-note">{t("equipment.heavyDisadvantageHint")}</p>
        </div>
      )}
      {/* The on-hit RIDER strip — the SAME tokens on both weapon surfaces. The
          combat card passes `onSpendRider` (consumable tokens become tappable);
          the inventory card omits it, so the strip is read-only there. */}
      <ActionRiders
        riders={facts.riders}
        onSpend={onSpendRider}
        depletedTrackers={depletedTrackers}
      />
      {/* The on-hit REMINDER sentence (Armorer Guardian Disadvantage, Dreadnaught
          push/pull, the unarmed unburdened-d8 gloss) — a self-side informational
          note (no resource, no dice). Rendered in the SAME "On a hit" register as
          the rider strip (DRY — golden rule 3), as a full sentence the collapsed
          60-char subtitle had no room for (progressive disclosure). Fed only on
          the combat surface; null on the inventory card. */}
      {facts.onHitNote && (
        <div className="rider-strip">
          <span className="rider-strip-label">{t("combat.ridersOnHit")}</span>
          <p className="rider-note">{facts.onHitNote}</p>
        </div>
      )}
      {children}
      {(facts.chips.length > 0 || footExtra != null) && (
        <UniversalCardFoot
          tags={facts.chips.map((chip) => (
            <WeaponChip key={`${chip.kind}:${chip.label}`} chip={chip} />
          ))}
        >
          {footExtra}
        </UniversalCardFoot>
      )}
    </>
  );
}
