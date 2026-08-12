/** Stable fantasy glyph vocabulary shared by every top-level realm navigator. */
import {
  FolioBookIcon,
  FolioScrollIcon,
  FolioTentIcon,
} from "@/components/shared/folio-icons";

export const REALM_ICONS = {
  characters: FolioScrollIcon,
  campaigns: FolioTentIcon,
  compendium: FolioBookIcon,
} as const;
