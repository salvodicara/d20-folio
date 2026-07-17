/**
 * TAB_DEFS — the cockpit primary tabs as data (id · i18n label · icon · panel),
 * shared by `TabStrip` (icon + label) and `TabBody` (the panel component) so the
 * two relocatable halves stay in lockstep on one ordered source of truth.
 *
 * A pure data module: it only holds component REFERENCES (lucide icons + the tab
 * panels), never renders them, so it stays JSX-free `.ts`.
 */

import type { ComponentType, SVGProps } from "react";
import { Backpack, ScrollText, Sparkles, Star, Swords } from "lucide-react";
import { PlayTab } from "./tabs/PlayTab";
import { SpellsTab } from "./tabs/SpellsTab";
import { InventoryTab } from "./tabs/InventoryTab";
import { FeaturesTab } from "./tabs/FeaturesTab";
import { BioTab } from "./tabs/BioTab";

export interface TabDef {
  id: string;
  /** i18n key for the label. */
  labelKey: string;
  /** EN inline default for `t()` (the per-locale IT lands in the #35 sweep). */
  defaultLabel: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  Panel: ComponentType;
}

export const TAB_DEFS: TabDef[] = [
  {
    // W6 — the internal tab id is now "combat" (the URL/state key `?tab=combat`),
    // refactored from the legacy "play" so id + label + concept all agree; it is the
    // combat / active-play surface (turn economy, actions, attacks). DISTINCT from
    // the play/edit `sheetMode`, which the rename also disambiguates.
    id: "combat",
    labelKey: "character.tabs.combat",
    defaultLabel: "Combat",
    icon: Swords,
    Panel: PlayTab,
  },
  {
    id: "spells",
    labelKey: "character.tabs.spells",
    defaultLabel: "Spells",
    icon: Sparkles,
    Panel: SpellsTab,
  },
  {
    id: "inventory",
    labelKey: "character.tabs.inventory",
    defaultLabel: "Inventory",
    icon: Backpack,
    Panel: InventoryTab,
  },
  {
    id: "features",
    labelKey: "character.tabs.features",
    defaultLabel: "Features",
    icon: Star,
    Panel: FeaturesTab,
  },
  {
    id: "bio",
    labelKey: "character.tabs.bio",
    defaultLabel: "Bio",
    icon: ScrollText,
    Panel: BioTab,
  },
];
