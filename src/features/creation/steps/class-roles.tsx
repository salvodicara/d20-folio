/**
 * Class-role glyph map — the component-layer (React glyph) seal each class wears
 * in the wizard's class grid + preview card. The presenter carries the stable
 * class id; this maps it to a fantasy icon + a role string. Mirrors the inventory
 * slice's `item-seal.ts` (icon resolution stays in the component layer so the
 * pure presenter never imports React glyphs).
 */
import { ShieldQuestion } from "lucide-react";
import {
  ClassArtificerIcon,
  ClassBarbarianIcon,
  ClassBardIcon,
  ClassClericIcon,
  ClassDruidIcon,
  ClassFighterIcon,
  ClassMonkIcon,
  ClassPaladinIcon,
  ClassRangerIcon,
  ClassRogueIcon,
  ClassSorcererIcon,
  ClassWarlockIcon,
  ClassWizardIcon,
} from "@/components/shared/folio-icons";
import type { ComponentType, SVGProps } from "react";

type ClassIcon = ComponentType<SVGProps<SVGSVGElement>>;

/**
 * Canonical runtime list of the class-role ids — the LOWERCASE token that keys the
 * `wizard.role_<id>` i18n label (the gallery interpolates `role.toLowerCase()`).
 * Source of truth for both the role union below and the i18n coverage guard, so a
 * new role can't be wired without its label (golden rules 6 + 9).
 */
export const CLASS_ROLE_IDS = [
  "martial",
  "support",
  "divine",
  "nature",
  "arcane",
] as const;

/** A class role — display token; `.toLowerCase()` matches a {@link CLASS_ROLE_IDS}. */
type ClassRole = Capitalize<(typeof CLASS_ROLE_IDS)[number]>;

const CLASS_ROLES: Record<string, { icon: ClassIcon; role: ClassRole }> = {
  barbarian: { icon: ClassBarbarianIcon, role: "Martial" },
  bard: { icon: ClassBardIcon, role: "Support" },
  cleric: { icon: ClassClericIcon, role: "Divine" },
  druid: { icon: ClassDruidIcon, role: "Nature" },
  fighter: { icon: ClassFighterIcon, role: "Martial" },
  monk: { icon: ClassMonkIcon, role: "Martial" },
  paladin: { icon: ClassPaladinIcon, role: "Divine" },
  ranger: { icon: ClassRangerIcon, role: "Martial" },
  rogue: { icon: ClassRogueIcon, role: "Martial" },
  sorcerer: { icon: ClassSorcererIcon, role: "Arcane" },
  warlock: { icon: ClassWarlockIcon, role: "Arcane" },
  wizard: { icon: ClassWizardIcon, role: "Arcane" },
  artificer: { icon: ClassArtificerIcon, role: "Arcane" },
};

const CLASS_ROLE_FALLBACK = { icon: ShieldQuestion, role: "Martial" } as const;

/** The fantasy glyph + role for a class id (a stable fallback for unknown ids). */
export function classRoleSeal(classId: string): { icon: ClassIcon; role: ClassRole } {
  return CLASS_ROLES[classId] ?? CLASS_ROLE_FALLBACK;
}
