/**
 * The compendium entry's «In breve»: the catalogue's one-line gist for the entry, by
 * the spec it belongs to; none when the catalogue has no gist for it.
 */
import { describe, expect, it, beforeAll } from "vitest";
import { compendiumGist } from "@/domains/compendium/compendium-gist";
import { getSpellById } from "@/data/spells";
import { SRD_MAGIC_ITEMS } from "@/data/magic-items";
import { ensureLocale, ensureSrdKind } from "@/i18n";

beforeAll(async () => {
  await ensureLocale("it");
  await ensureSrdKind("monster");
});

describe("compendiumGist", () => {
  it("a spell reads its gist", () => {
    expect(compendiumGist("spell", getSpellById("fireball"), "it")).toMatch(
      /^Esplosione/
    );
  });

  it("a magic item reads its gist from the magic-item catalogue", () => {
    const bag = SRD_MAGIC_ITEMS.find((m) => m.id === "bag-of-holding");
    expect(compendiumGist("items", { kind: "magic", item: bag }, "it")).toMatch(/225 kg/);
  });

  it("a monster reads its gist", () => {
    expect(compendiumGist("monster", { id: "goblin-warrior" }, "en")).toMatch(
      /skirmisher/
    );
  });

  it("an entry without a gist has none", () => {
    expect(compendiumGist("spell", { id: "no-such-spell" }, "it")).toBeNull();
    expect(compendiumGist("weapon-mastery", { id: "topple" }, "it")).toBeNull();
  });
});
