/**
 * A spell's icon: its painted art when it exists, else its school's glyph in the
 * school's colour. The tile wears the school's colour either way, so a list reads
 * by school at a glance (owner, 2026-11-05: art and colour make the differences jump out).
 */
import { createElement, type CSSProperties } from "react";

import {
  SchoolAbjurationIcon,
  SchoolConjurationIcon,
  SchoolDivinationIcon,
  SchoolEnchantmentIcon,
  SchoolEvocationIcon,
  SchoolIllusionIcon,
  SchoolNecromancyIcon,
  SchoolTransmutationIcon,
} from "@/components/shared/fantasy-icons";
import type { SpellSchool } from "@/data/types";
import { Art } from "@/ui";

const GLYPH = {
  abjuration: SchoolAbjurationIcon,
  conjuration: SchoolConjurationIcon,
  divination: SchoolDivinationIcon,
  enchantment: SchoolEnchantmentIcon,
  evocation: SchoolEvocationIcon,
  illusion: SchoolIllusionIcon,
  necromancy: SchoolNecromancyIcon,
  transmutation: SchoolTransmutationIcon,
} as const;

export function SpellArt({
  id,
  school,
  size = "md",
}: {
  id: string;
  school: SpellSchool;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <span
      className="f-spellart"
      data-size={size}
      style={{ "--sc": `var(--school-${school})` } as CSSProperties}
      aria-hidden="true"
    >
      <Art
        kind="spell"
        id={id}
        fallback={
          <span className="f-spellart-glyph">{createElement(GLYPH[school])}</span>
        }
      />
    </span>
  );
}
