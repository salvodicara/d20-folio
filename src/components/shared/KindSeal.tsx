/**
 * KindSeal — the small carved medallion that leads an option card (the left "seal"
 * on a feat / proficiency picker row). It is the SAME `.uc-seal kind` brass token the
 * universal cards use, parameterised by `kind` (which pigment) and a lucide glyph, so
 * a feat, a tool, a skill and a language all wear the same physical mark — the visual
 * consistency that makes the pickers read as one family.
 *
 * Spells use their own chromatic LEVEL seal (`.uc-seal lvl`, the digit), not this one.
 */

import type { ComponentType, SVGProps } from "react";
import { Icon } from "@/components/ui/icon";

export type SealKind = "feat" | "skill" | "tool" | "language" | "weapon";

export function KindSeal({
  kind,
  icon,
}: {
  kind: SealKind;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}) {
  return (
    <span className="uc-seal kind" data-kind={kind} aria-hidden>
      <Icon as={icon} decorative />
    </span>
  );
}
