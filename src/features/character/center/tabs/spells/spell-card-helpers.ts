/**
 * Pure presentation helpers for the spell card — kept out of the component file
 * so Fast-Refresh stays happy (a component module exports only components) and so
 * the verdict / gloss / facts logic is unit-testable in isolation. They consume a
 * localized {@link SpellCardVM} (SRD content already resolved) + the i18n `t`, and
 * resolve the remaining APP strings (school / casting-time / verdict / facts
 * labels) + raw-number formatting at this edge (docs/ARCHITECTURE.md).
 *
 * An SRD spell's mechanics (cost, save, attack, damage, healing, components) are
 * read from its {@link Activity} (`vm.activity`), never from the flat spell fields.
 */
import type { TFunction } from "i18next";
import type { ComponentType, SVGProps } from "react";
import { Clock3, Ruler, Shield, Crosshair, Hourglass, Hand } from "lucide-react";
import {
  castingTimeKey,
  fixedDamageType,
  healDice,
  primaryDamage,
  secondaryDamage,
} from "@/lib/activities";
import { castingTimeI18nKey } from "@/lib/utils";
import { coinPrice } from "@/lib/coin-price";
import { chipText } from "@/lib/views/combat-action-view";
import type { CustomSpell } from "@/types/character";
import type { SpellCardVM } from "@/lib/views/spells-view";
import type { GlossaryTermId } from "@/components/shared/GlossaryTip";
import { rangeAreaTerm, type SpellTermId } from "@/components/shared/spell-glossary";
import type {
  VerdictOutcome,
  UniversalCardSlot,
} from "@/components/shared/UniversalCard";

/** Folio modifier convention: explicit + for non-negatives, U+2212 minus. */
export function fmtMod(mod: number): string {
  return mod >= 0 ? `+${mod}` : `−${Math.abs(mod)}`;
}

/** A custom spell's casting time (SRD spells read their Activity's cost). */
function customCastingTime(vm: SpellCardVM): string {
  return (vm.ref as CustomSpell).castingTime;
}

/** The casting-time catalogue key (`srd.castingTime_<key>`). */
function castingKey(vm: SpellCardVM): string {
  if (vm.kind === "srd") return vm.activity ? castingTimeKey(vm.activity.cost) : "";
  return castingTimeI18nKey(customCastingTime(vm));
}

/** Derive the action-economy slot (left-border colour) from the casting time. */
export function spellCardSlot(vm: SpellCardVM): UniversalCardSlot {
  if (vm.kind === "srd") {
    const economy = vm.activity?.cost.economy;
    return economy === "bonus" || economy === "reaction" ? economy : "action";
  }
  const lower = customCastingTime(vm).toLowerCase();
  if (lower.includes("bonus")) return "bonus";
  if (lower.includes("reaction")) return "reaction";
  return "action";
}

/**
 * Map a spell to its ONE verdict-chip outcome (colour key). Damage spells key to
 * the §11 chromatic palette; healers/buffs/debuffs/utility use semantic colours.
 * Custom spells are always "utility".
 */
export function spellVerdictOutcome(vm: SpellCardVM): VerdictOutcome {
  const activity = vm.activity;
  if (!activity) return "utility";
  const dt = fixedDamageType(activity);
  if (dt) {
    const chromatic: VerdictOutcome[] = [
      "fire",
      "cold",
      "lightning",
      "acid",
      "thunder",
      "poison",
      "necrotic",
      "radiant",
      "force",
      "psychic",
    ];
    if ((chromatic as string[]).includes(dt)) return dt as VerdictOutcome;
    return "physical";
  }
  switch (activity.tag) {
    case "heal":
      return "heal";
    case "advantage":
      return "advantage";
    case "control":
      return "control";
    case "buff":
      return "buff";
    case "debuff":
      return "debuff";
    case "utility":
      return "utility";
  }
  if (healDice(activity)) return "heal";
  if (activity.save) return "debuff";
  return "utility";
}

/**
 * Build the ONE outcome-forward verdict chip text (HANDOFF §3.2): damage → "2d8
 * Fire", heal → "2d4 Heal"/"Heal", advantage → "Advantage", control → the named
 * outcome WORD (pre-localized on the VM), attack-utility → the spell-attack
 * signal, else "Utility". Custom spells get the "Custom" label. Never a bare
 * "Save".
 */
export function buildVerdict(vm: SpellCardVM, t: TFunction): string {
  const activity = vm.activity;
  // Every branch routes through the `chipText` omit-not-wrap gate (CHIP_BUDGET):
  // a labelled formula drops its label word when over budget; a single word
  // that can't fit is omitted — the chip can never wrap (chip token contract).
  if (!activity) return chipText(t("custom.label")) ?? "";
  const damageType = fixedDamageType(activity);
  if (damageType) {
    const shortType = t(`srd.damageShort_${damageType}`);
    const dice = primaryDamage(activity)?.dice?.dice;
    // S12b — a multi-instance spell (Magic Missile 3 darts, Scorching Ray 3 rays)
    // shows "N × dice" so the player reads N separate rolls, not one combined die.
    // The card shows the BASE count (cast at the spell's own level); the cast
    // modal/combat surface the per-slot upcast.
    const instances = activity.repeats?.count;
    const formula =
      instances && instances > 1 && dice
        ? t("spells.multiInstance", { count: instances, dice })
        : dice;
    // A second simultaneous instance (Ice Storm/Ice Knife/Meteor Swarm) appends
    // "+ {dice} {type}"; the chip gate keeps the primary alone if it overflows.
    const second = secondaryDamage(activity);
    const secondary = second
      ? ` + ${second.dice?.dice} ${t(`srd.damageShort_${second.types?.[0]}`)}`
      : "";
    return formula
      ? (chipText(formula, `${formula} ${shortType}${secondary}`) ?? "")
      : (chipText(shortType) ?? "");
  }
  const heal = healDice(activity);
  if (heal || activity.tag === "heal") {
    const healWord = t("spells.healVerdict");
    return heal
      ? (chipText(heal, `${heal} ${healWord}`) ?? "")
      : (chipText(healWord) ?? "");
  }
  if (activity.tag === "advantage") return chipText(t("common.advantage")) ?? "";
  if (vm.effectWord) {
    // An over-budget condition word falls back to the generic save token.
    return chipText(vm.effectWord) ?? chipText(t("spells.saveBadge")) ?? "";
  }
  if (activity.attack && vm.attackBonus != null)
    return chipText(t("spells.spellAttack")) ?? "";
  if (activity.save || activity.tag === "debuff" || activity.tag === "control")
    return chipText(t("spells.saveBadge")) ?? "";
  return chipText(t("spells.utility")) ?? "";
}

/** The localized gloss sub-line: school · range/cast · save · concentration. */
export function buildGloss(vm: SpellCardVM, t: TFunction): string {
  const schoolKey =
    vm.kind === "srd"
      ? (vm.data?.school ?? "")
      : (vm.ref as CustomSpell).school.toLowerCase();
  const parts: string[] = [t(`srd.school_${schoolKey}`)];
  if (vm.kind === "srd") {
    if (vm.facts.range) parts.push(vm.facts.range);
    const save = vm.activity?.save;
    if (save) {
      parts.push(t("spells.saveOf", { ability: t(`abilities.${save.ability}_short`) }));
    }
  } else {
    parts.push(t(`srd.castingTime_${castingKey(vm)}`));
  }
  if (vm.concentratingNow) parts.push(t("spells.concentratingNow"));
  else if (vm.concentration) parts.push(t("combat.concentration"));
  return parts.filter(Boolean).join(" · ");
}

export interface SpellFact {
  label: string;
  value: string;
  /** Icon-anchored stat row (the typed-document reading spread). */
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Beginner glossary term the label explains. */
  term?: GlossaryTermId;
  /** Runs of the value that explain a term ("V" → Verbal, "Bonus Action"). */
  tips?: { text: string; term: SpellTermId }[];
}

const COMPONENT_TERM = {
  V: { term: "verbal" },
  S: { term: "somatic" },
  M: { term: "material" },
} as const;
const CAST_TERM = {
  bonus: { term: "bonusActionSpell" },
  reaction: { term: "reactionSpell" },
} as const;

/** The localized facts-grid rows (labels via `t`, SRD values off the VM). */
export function buildFacts(vm: SpellCardVM, t: TFunction): SpellFact[] {
  const castLabel = t(`srd.castingTime_${castingKey(vm)}`);
  const components =
    vm.kind === "srd" ? vm.activity?.cost.components : (vm.ref as CustomSpell).components;
  const componentsValue =
    [components?.v && "V", components?.s && "S", components?.m && "M"]
      .filter(Boolean)
      .join(", ") + (vm.facts.material ? ` (${vm.facts.material})` : "");
  const saveAbility = vm.kind === "srd" ? vm.activity?.save?.ability : undefined;
  const attackType = vm.kind === "srd" ? vm.activity?.attack : undefined;
  const slot = spellCardSlot(vm);
  const castTerm = slot === "bonus" || slot === "reaction" ? CAST_TERM[slot].term : null;
  const area = rangeAreaTerm(vm.facts.range, t);
  const letters = (["V", "S", "M"] as const).filter(
    (l) => components?.[l.toLowerCase() as "v" | "s" | "m"]
  );
  const rows: (SpellFact | null)[] = [
    {
      label: t("spells.castingTime"),
      value: castLabel,
      icon: Clock3,
      term: "castingTime",
      tips: castTerm ? [{ text: castLabel, term: castTerm }] : undefined,
    },
    vm.facts.range
      ? {
          label: t("spells.range"),
          value: vm.facts.range,
          icon: Ruler,
          term: "range",
          tips: area ? [{ text: vm.facts.range, term: area }] : undefined,
        }
      : null,
    saveAbility && vm.saveDC != null
      ? {
          label: t("spells.save"),
          value: `${t(`abilities.${saveAbility}_short`)} · ${t("stats.dc")} ${vm.saveDC}`,
          icon: Shield,
          term: "spellSave",
        }
      : null,
    attackType && vm.attackBonus != null
      ? {
          label: t("spells.spellAttack"),
          value: fmtMod(vm.attackBonus),
          icon: Crosshair,
          term: "spellAttack",
        }
      : null,
    vm.facts.duration
      ? {
          label: t("spells.duration"),
          value: vm.facts.duration,
          icon: Hourglass,
          term: "duration",
        }
      : null,
    {
      label: t("spells.components"),
      value: componentsValue,
      icon: Hand,
      term: "components",
      tips: letters.map((l) => ({ text: l, term: COMPONENT_TERM[l].term })),
    },
  ];
  return rows.filter((f): f is SpellFact => f != null && f.value !== "");
}

/**
 * RA-23 — the costly/consumed material-component chip ("M: 300 gp, consumed"), or
 * null when the spell has no priced material component. Reads the STRUCTURED
 * `components.costGp`/`consumed` (never the prose); custom spells (`vm.data ===
 * null`) never match. The price is named in its own coin ("2 cp" / "2 mr").
 */
export function buildMaterialCostTag(vm: SpellCardVM, t: TFunction): string | null {
  const comp = vm.activity?.cost.components;
  if (comp?.gp == null) return null;
  const { amount, coin } = coinPrice(comp.gp);
  return t(comp.consumed ? "spells.materialCostConsumed" : "spells.materialCost", {
    amount,
    coin: t(`equipment.currencyAbbr.${coin}`),
  });
}
