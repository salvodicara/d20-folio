/** A class's crest: its painted art when it exists, else the class glyph in gold. */
import { createElement } from "react";

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
  FolioFeatIcon,
} from "@/components/shared/folio-icons";
import { Art } from "@/ui";

const GLYPH: Record<string, typeof FolioFeatIcon> = {
  artificer: ClassArtificerIcon,
  barbarian: ClassBarbarianIcon,
  bard: ClassBardIcon,
  cleric: ClassClericIcon,
  druid: ClassDruidIcon,
  fighter: ClassFighterIcon,
  monk: ClassMonkIcon,
  paladin: ClassPaladinIcon,
  ranger: ClassRangerIcon,
  rogue: ClassRogueIcon,
  sorcerer: ClassSorcererIcon,
  warlock: ClassWarlockIcon,
  wizard: ClassWizardIcon,
};

export function ClassCrest({
  classId,
  size = "lg",
}: {
  classId: string;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <span className="f-crest-art" data-size={size} data-identity aria-hidden="true">
      <Art
        kind="class"
        id={classId}
        fallback={
          <span className="f-crest-glyph">
            {createElement(GLYPH[classId] ?? FolioFeatIcon)}
          </span>
        }
      />
    </span>
  );
}
