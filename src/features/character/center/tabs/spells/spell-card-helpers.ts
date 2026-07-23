/**
 * Pure presentation helpers for the spell card — kept out of the component file
 * so Fast-Refresh stays happy (a component module exports only components) and so
 * the verdict / gloss / facts logic is unit-testable in isolation. They consume a
 * localized {@link SpellCardVM} (SRD content already resolved) + the i18n `t`, and
 * resolve the remaining APP strings (school / casting-time / verdict / facts
 * labels) + raw-number formatting at this edge (docs/ARCHITECTURE.md).
 */
import type { TFunction } from "i18next";
import type { ComponentType, SVGProps } from "react";
import { Clock3, Ruler, Shield, Crosshair, Hourglass, Hand } from "lucide-react";
import { castingTimeI18nKey, spellInstanceCount } from "@/lib/utils";
import { chipText } from "@/lib/views/combat-action-view";
import type { CustomSpell } from "@/types/character";
import type { SpellCardVM } from "@/lib/views/spells-view";
import type {
  VerdictOutcome,
  UniversalCardSlot,
} from "@/components/shared/UniversalCard";

/** Folio modifier convention: explicit + for non-negatives, U+2212 minus. */
export function fmtMod(mod: number): string {
  return mod >= 0 ? `+${mod}` : `−${Math.abs(mod)}`;
}

/** A custom spell's casting time (SRD spells read it off `vm.data`). */
function vmCastingTime(vm: SpellCardVM): string {
  if (vm.kind === "srd") return vm.data?.castingTime ?? "";
  return (vm.ref as CustomSpell).castingTime;
}

/** Derive the action-economy slot (left-border colour) from the casting time. */
export function spellCardSlot(vm: SpellCardVM): UniversalCardSlot {
  const lower = vmCastingTime(vm).toLowerCase();
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
  const data = vm.data;
  if (!data) return "utility";
  if (data.damageType) {
    const dt = data.damageType;
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
  switch (data.effectTag) {
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
  if (data.healDice) return "heal";
  if (data.saveAbility) return "debuff";
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
  const data = vm.data;
  // Every branch routes through the `chipText` omit-not-wrap gate (CHIP_BUDGET):
  // a labelled formula drops its label word when over budget; a single word
  // that can't fit is omitted — the chip can never wrap (chip token contract).
  if (!data) return chipText(t("custom.label")) ?? "";
  if (data.damageType) {
    const shortType = t(`srd.damageShort_${data.damageType}`);
    // S12b — a multi-instance spell (Magic Missile 3 darts, Scorching Ray 3 rays)
    // shows "N × dice" so the player reads N separate rolls, not one combined die.
    // The card shows the BASE count (cast at the spell's own level); the cast
    // modal/combat surface the per-slot upcast.
    const instances = spellInstanceCount(data);
    const formula =
      instances && instances > 1 && data.damageDice
        ? t("spells.multiInstance", { count: instances, dice: data.damageDice })
        : data.damageDice;
    // A second simultaneous instance (Ice Storm/Ice Knife/Meteor Swarm) appends
    // "+ {dice} {type}"; the chip gate keeps the primary alone if it overflows.
    const secondary = data.secondaryDamage
      ? ` + ${data.secondaryDamage.dice} ${t(`srd.damageShort_${data.secondaryDamage.damageType}`)}`
      : "";
    return formula
      ? (chipText(formula, `${formula} ${shortType}${secondary}`) ?? "")
      : (chipText(shortType) ?? "");
  }
  if (data.healDice || data.effectTag === "heal") {
    const healWord = t("spells.healVerdict");
    return data.healDice
      ? (chipText(data.healDice, `${data.healDice} ${healWord}`) ?? "")
      : (chipText(healWord) ?? "");
  }
  if (data.effectTag === "advantage") return chipText(t("common.advantage")) ?? "";
  if (vm.effectWord) {
    // An over-budget condition word falls back to the generic save token.
    return chipText(vm.effectWord) ?? chipText(t("spells.saveBadge")) ?? "";
  }
  if (data.attackType && vm.attackBonus != null)
    return chipText(t("spells.spellAttack")) ?? "";
  if (data.saveAbility || data.effectTag === "debuff" || data.effectTag === "control")
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
    if (vm.data?.saveAbility) {
      parts.push(
        t("spells.saveOf", { ability: t(`abilities.${vm.data.saveAbility}_short`) })
      );
    }
  } else {
    parts.push(t(`srd.castingTime_${castingTimeI18nKey(vmCastingTime(vm))}`));
  }
  if (vm.concentratingNow) parts.push(t("spells.concentratingNow"));
  else if (vm.concentration) parts.push(t("spells.concShort"));
  return parts.filter(Boolean).join(" · ");
}

export interface SpellFact {
  label: string;
  value: string;
  /** Icon-anchored stat row (the typed-document reading spread). */
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}

/** The localized facts-grid rows (labels via `t`, SRD values off the VM). */
export function buildFacts(vm: SpellCardVM, t: TFunction): SpellFact[] {
  const castLabel = t(`srd.castingTime_${castingTimeI18nKey(vmCastingTime(vm))}`);
  const components =
    vm.kind === "srd" ? vm.data?.components : (vm.ref as CustomSpell).components;
  const componentsValue =
    [components?.v && "V", components?.s && "S", components?.m && "M"]
      .filter(Boolean)
      .join(", ") + (vm.facts.material ? ` (${vm.facts.material})` : "");
  const saveAbility = vm.kind === "srd" ? vm.data?.saveAbility : undefined;
  const attackType = vm.kind === "srd" ? vm.data?.attackType : undefined;
  const rows: (SpellFact | null)[] = [
    { label: t("spells.castingTime"), value: castLabel, icon: Clock3 },
    vm.facts.range
      ? { label: t("spells.range"), value: vm.facts.range, icon: Ruler }
      : null,
    saveAbility && vm.saveDC != null
      ? {
          label: t("spells.save"),
          value: `${t(`abilities.${saveAbility}_short`)} · ${t("stats.dc")} ${vm.saveDC}`,
          icon: Shield,
        }
      : null,
    attackType && vm.attackBonus != null
      ? { label: t("spells.spellAttack"), value: fmtMod(vm.attackBonus), icon: Crosshair }
      : null,
    vm.facts.duration
      ? { label: t("spells.duration"), value: vm.facts.duration, icon: Hourglass }
      : null,
    { label: t("spells.components"), value: componentsValue, icon: Hand },
  ];
  return rows.filter((f): f is SpellFact => f != null && f.value !== "");
}
