/**
 * A rider's words (its name, its compact token, its qualifiers): shared by the classic
 * rider strip and the new Play screen's after-hit options.
 */
import type { TFunction } from "i18next";

import { damageVerdictOutcome } from "@/features/character/center/tabs/inventory/inventory-card-helpers";
import type { RiderVM } from "@/lib/views/rider-view";

export type TranslateFn = TFunction;

/** The rider's display NAME (its provenance) — the tooltip rubric / aria anchor. */
export function riderName(rider: RiderVM, t: TranslateFn): string {
  if (rider.kind === "heal") return `${rider.source} · ${t("combat.heal")}`;
  return rider.source;
}

/** Compose the compact token text + its chromatic outcome key. */
export function riderToken(
  rider: RiderVM,
  t: TranslateFn
): { text: string; outcome: string } {
  switch (rider.kind) {
    case "damage": {
      const typeIds = rider.damageTypeChoiceIds?.length
        ? rider.damageTypeChoiceIds
        : rider.damageTypeId
          ? [rider.damageTypeId]
          : [];
      const typeWord = typeIds.map((type) => t(`srd.damage_${type}`)).join(" / ");
      // A per-hit "vs marked/cursed target" rider (Hunter's Mark, Hex) labels the
      // chip so the +die reads as conditional on hitting THAT creature, never every
      // attack (the app models no enemy — the player applies it on the right hit).
      const markLabel = rider.vsMarkedTarget
        ? ` ${t(`combat.attackScope_${rider.vsMarkedTarget}`)}`
        : "";
      return {
        text: `+${rider.dice}${typeWord ? ` ${typeWord}` : ""}${markLabel}`,
        outcome: damageVerdictOutcome(rider.damageTypeId),
      };
    }
    case "die-mod":
      return {
        text:
          rider.dieMode === "floor"
            ? t("combat.riderFloor", { below: rider.floorBelow, to: rider.floorTo })
            : t("combat.riderReroll"),
        outcome: "neutral",
      };
    case "heal":
      return {
        text: `${t("combat.heal")} ${rider.healFormula ?? ""}`.trim(),
        outcome: "heal",
      };
  }
}

/**
 * The rider's qualifier chips. `composed` = a WHY sentence is being shown, whose
 * prose ALREADY carries the once-per-turn limiter and the tracker spend — those
 * two are then omitted so nothing is stated twice (rule 19). The toggle state,
 * the attack-or-spell scope and a Hit-Die cost are never in the sentence, so
 * they always ride here.
 */
export function riderQualifiers(
  rider: RiderVM,
  t: TranslateFn,
  composed: boolean
): string[] {
  const parts: string[] = [];
  // A rider gated on a `while-active` toggle that is up reads "· active" — the
  // SAME `combat.whileActiveNote` key the weapon-damage breakdown shows, so the
  // user sees the extra damage is conditional on the toggle (Rage, Divine Favor).
  if (rider.whileActive) parts.push(t("combat.whileActiveNote"));
  // G14 — an attack-or-spell rider isn't weapon-bound; spell out the scope so the
  // self-side reminder reads "on an attack or a spell" (a species revelation form).
  if (rider.scope === "attack-or-spell") parts.push(t("combat.riderScopeAttackOrSpell"));
  if (!composed && rider.oncePerTurn) parts.push(t("combat.oncePerTurn"));
  if (!composed && rider.spend?.kind === "tracker") {
    parts.push(t("combat.riderSpendsResource"));
  }
  if (rider.spend?.kind === "hit-die") parts.push(t("combat.riderSpendsHitDie"));
  return parts;
}

/** Compose the rider's compact aria / title detail line — provenance + qualifiers. */
export function riderDetail(rider: RiderVM, t: TranslateFn): string {
  return [rider.source, ...riderQualifiers(rider, t, false)].join(" · ");
}
