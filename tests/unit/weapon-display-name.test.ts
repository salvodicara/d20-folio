/**
 * A magic weapon is named by its enchant, the weapon after it (D&D Beyond's way):
 * «Lingua di Fiamme (Spada Lunga)». One formatter, so the inventory, the actions
 * and the tray agree; a plain weapon keeps its own name.
 */
import { describe, expect, it } from "vitest";

import { playInventoryView } from "@/domains/play/play-inventory-view";
import { resolveActions } from "@/lib/smart-tracker";
import { localizeAction } from "@/lib/views/combat-action-view";
import { weaponDisplayName } from "@/lib/views/weapon-display-name";
import { makeCharacterDoc } from "./_helpers";

describe("weaponDisplayName", () => {
  it("puts the enchant first, the weapon in brackets", () => {
    expect(weaponDisplayName("Spada Lunga", "flame-tongue", "it")).toBe(
      "Lingua di Fiamme (Spada Lunga)"
    );
    expect(weaponDisplayName("Longsword", "flame-tongue", "en")).toBe(
      "Flame Tongue (Longsword)"
    );
  });

  it("leaves a plain weapon, or an unknown enchant, as it is", () => {
    expect(weaponDisplayName("Longsword", null, "en")).toBe("Longsword");
    expect(weaponDisplayName("Longsword", "no-such-item", "en")).toBe("Longsword");
  });
});

describe("every surface names the magic weapon the same", () => {
  const doc = makeCharacterDoc({
    classId: "fighter",
    level: 5,
    weapons: [
      {
        srdId: "longsword",
        quantity: 1,
        enchantItemId: "flame-tongue",
        attuned: true,
      },
    ],
  });

  it("the inventory", () => {
    const names = playInventoryView(doc, "it").groups.flatMap((g) =>
      g.items.map((i) => i.name)
    );
    expect(names).toContain("Lingua di Fiamme (Spada Lunga)");
  });

  it("the attack row", () => {
    const row = resolveActions(doc, "combat").find((a) => a.source === "weapon");
    expect(row && localizeAction(row, "it").name).toBe("Lingua di Fiamme (Spada Lunga)");
  });
});
