/** Stable glyph vocabulary shared by every top-level realm navigator. */
import { BookOpen, ScrollText, Tent } from "lucide-react";

export const REALM_ICONS = {
  characters: ScrollText,
  campaigns: Tent,
  compendium: BookOpen,
} as const;
