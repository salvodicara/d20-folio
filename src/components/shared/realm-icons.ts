/** Stable fantasy glyph vocabulary shared by every top-level realm navigator. */
import {
  FolioShellBookIcon,
  FolioShellScrollIcon,
  FolioShellTentIcon,
} from "@/components/shared/folio-shell-icons";

export const REALM_ICONS = {
  characters: FolioShellScrollIcon,
  campaigns: FolioShellTentIcon,
  compendium: FolioShellBookIcon,
} as const;
