/**
 * A Spell Scroll's reading is paid with that scroll (#652): the cast revalidates the
 * cost by the same key the store spends it by (`spell-scroll#<spell>`, or the copy's
 * `instanceId`), so a scroll in the pack is affordable and a used-up one is not.
 */
import { describe, expect, it } from "vitest";
import { actionPaymentAffordable } from "@/lib/play/cast-payment";
import type { ResolvedAction } from "@/lib/smart-tracker";
import { makeCharacterDoc } from "./_helpers";

const reading = (costEquipment: string) =>
  ({
    id: `use-${costEquipment}`,
    costsSlot: false,
    costEquipment,
  }) as unknown as ResolvedAction;

describe("a scroll pays for its own reading", () => {
  it("by its spell", () => {
    const doc = makeCharacterDoc({
      equipment: [{ srdId: "spell-scroll", quantity: 1, scrollSpell: "healing-word" }],
    });
    expect(actionPaymentAffordable(doc, reading("spell-scroll#healing-word"))).toBe(true);
    expect(actionPaymentAffordable(doc, reading("spell-scroll#fireball"))).toBe(false);
  });

  it("by its copy", () => {
    const doc = makeCharacterDoc({
      equipment: [
        {
          srdId: "spell-scroll",
          quantity: 1,
          scrollSpell: "healing-word",
          instanceId: "s1",
        },
      ],
    });
    expect(actionPaymentAffordable(doc, reading("s1"))).toBe(true);
  });

  it("not once it is used up", () => {
    const doc = makeCharacterDoc({
      equipment: [{ srdId: "spell-scroll", quantity: 0, scrollSpell: "healing-word" }],
    });
    expect(actionPaymentAffordable(doc, reading("spell-scroll#healing-word"))).toBe(
      false
    );
  });

  it("a potion still pays by its id", () => {
    const doc = makeCharacterDoc({
      equipment: [{ srdId: "potion-of-healing", quantity: 2 }],
    });
    expect(actionPaymentAffordable(doc, reading("potion-of-healing"))).toBe(true);
  });
});

describe("a refused use says why", () => {
  it("the scroll is gone", async () => {
    const { paymentShortfall } = await import("@/lib/play/cast-payment");
    const doc = makeCharacterDoc({ equipment: [] });
    const scroll = {
      id: "item-scroll-healing-word",
      costsSlot: false,
      costEquipment: "spell-scroll#healing-word",
    } as unknown as ResolvedAction;
    expect(paymentShortfall(doc, scroll)).toBe("scroll");
    expect(paymentShortfall(doc, reading("potion-of-healing"))).toBe("item");
  });
});
