/**
 * Class-role glyph map — the component-layer (React glyph) seal each class wears
 * in the wizard's class grid + preview card. The presenter carries the stable
 * class id; this maps it to a Lucide icon + a role string. Mirrors the inventory
 * slice's `item-seal.ts` (icon resolution stays in the component layer so the
 * pure presenter never imports React glyphs).
 */
import {
  Swords,
  Music,
  Sun,
  Leaf,
  Shield,
  Hand,
  Scale,
  Crosshair,
  VenetianMask,
  Wand2,
  Eye,
  Cog,
  BookOpen,
  ShieldQuestion,
} from "lucide-react";
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
  barbarian: { icon: Swords, role: "Martial" },
  bard: { icon: Music, role: "Support" },
  cleric: { icon: Sun, role: "Divine" },
  druid: { icon: Leaf, role: "Nature" },
  fighter: { icon: Shield, role: "Martial" },
  monk: { icon: Hand, role: "Martial" },
  paladin: { icon: Scale, role: "Divine" },
  ranger: { icon: Crosshair, role: "Martial" },
  rogue: { icon: VenetianMask, role: "Martial" },
  sorcerer: { icon: Wand2, role: "Arcane" },
  warlock: { icon: Eye, role: "Arcane" },
  wizard: { icon: BookOpen, role: "Arcane" },
  artificer: { icon: Cog, role: "Arcane" },
};

const CLASS_ROLE_FALLBACK = { icon: ShieldQuestion, role: "Martial" } as const;

/** The Lucide glyph + role for a class id (a stable fallback for unknown ids). */
export function classRoleSeal(classId: string): { icon: ClassIcon; role: ClassRole } {
  return CLASS_ROLES[classId] ?? CLASS_ROLE_FALLBACK;
}
