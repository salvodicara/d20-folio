/**
 * The design-vision checklist (`docs/design/SURFACES.md`) lists every user-facing
 * surface, and the list is taken from the code (`scripts/design/surface-inventory.ts`):
 * a new dialog, menu, picker or route cannot ship without a row, and a removed one
 * cannot linger. It does not judge the look; it keeps the inventory complete.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checklistIds, scanSurfaces } from "@scripts/design/surface-inventory";

const root = join(__dirname, "..", "..");
const checklist = readFileSync(join(root, "docs", "design", "SURFACES.md"), "utf8");
const listed = checklistIds(checklist);
const scanned = scanSurfaces(join(root, "src"));

describe("surface inventory guard", () => {
  it("finds the surfaces it is meant to find", () => {
    const ids = new Set(scanned.map((s) => s.id));
    // One of each kind, so a broken pattern cannot pass silently with an empty scan.
    for (const id of [
      "route:/campaigns/:campaignId",
      "panel:features/character/center/tabs/SpellsTab",
      "tabs:features/compendium/CompendiumPage",
      "dialog:features/character/RestModal",
      "popover:features/character/molecules/HpEditPopover",
      "menu:components/shared/CardOverflowMenu",
      "picker:features/compendium/picker/CompendiumPicker",
      "notice:components/sheet/UndoToasts",
      "empty:features/roster/RosterPage",
      "loading:features/campaigns/CampaignHubPage",
    ]) {
      expect(ids, id).toContain(id);
    }
  });

  it("lists every surface the code renders", () => {
    const missing = scanned.filter((s) => !listed.has(s.id)).map((s) => s.id);
    expect(missing, "add these rows to docs/design/SURFACES.md").toEqual([]);
  });

  it("lists no surface the code no longer renders (hand-written states aside)", () => {
    const ids = new Set(scanned.map((s) => s.id));
    const stale = [...listed.keys()].filter(
      (id) => !id.startsWith("state:") && !ids.has(id)
    );
    expect(stale, "remove these rows from docs/design/SURFACES.md").toEqual([]);
  });

  it("marks every row todo or done", () => {
    const bad = checklist
      .split("\n")
      .filter((line) => /^\|\s*`/.test(line))
      .filter((line) => !/\|\s*(todo|done)\s*\|\s*$/.test(line));
    expect(bad).toEqual([]);
  });
});
