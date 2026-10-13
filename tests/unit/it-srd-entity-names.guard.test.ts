/**
 * Italian SRD names of magic items, invocations, conditions, class features, feats, species
 * traits and monsters are the official IT SRD 5.2.1 names (docs/IT_NAME_REGISTRY.md, tier 1).
 *
 * The fixture is the entity headings of the official Italian SRD 5.2.1 (CC-BY-4.0), extracted
 * from `IT_SRD_CC_v5.2.1.pdf` and keyed by our id. The comparison ignores letter case only: the
 * app titles entity names (`Anello di Protezione`), the SRD prints sentence case. Every word,
 * accent, article and hyphen must match the print. A `variants` row is one of our splits of a
 * single printed heading (`Armatura +1` of `Armatura +1, +2 o +3`, `Iniziato alla Magia
 * (Chierico)` of `Iniziato alla magia`): its name must open with the printed name.
 */
import { describe, expect, it } from "vitest";
import classFeatures from "@/i18n/it/srd/class-features.json";
import conditions from "@/i18n/it/srd/conditions.json";
import feats from "@/i18n/it/srd/feats.json";
import invocations from "@/i18n/it/srd/invocations.json";
import magicItems from "@/i18n/it/srd/magic-items.json";
import monsters from "@/i18n/it/srd/monsters.json";
import races from "@/i18n/it/srd/races.json";
import official from "./__fixtures__/it-srd-5.2.1-entity-names.json";

type Rows = Record<string, { name?: string }>;
const asRows = (json: unknown) => json as Rows;
/** Each kind's named rows; for species, the trait rows (`<species>.traits.<id>`). */
const KINDS: Record<string, { rows: Rows; key: (id: string) => boolean }> = {
  "magic-items": { rows: asRows(magicItems), key: (id) => !id.includes(".") },
  invocations: { rows: asRows(invocations), key: (id) => !id.includes(".") },
  conditions: { rows: asRows(conditions), key: (id) => !id.includes(".") },
  "class-features": { rows: asRows(classFeatures), key: (id) => !id.includes(".") },
  feats: { rows: asRows(feats), key: (id) => !id.includes(".") },
  races: { rows: asRows(races), key: (id) => /^[a-z-]+\.traits\.[a-z-]+$/.test(id) },
  monsters: { rows: asRows(monsters), key: (id) => !id.includes(".") },
};
const printed = official as unknown as Record<string, Record<string, string>>;
const variants = printed.variants ?? {};
const lower = (s: string | undefined) => s?.toLowerCase();

describe.each(Object.keys(KINDS))("Italian SRD %s names", (kind) => {
  const { rows, key } = KINDS[kind] ?? { rows: {}, key: () => false };
  const ours = Object.fromEntries(
    Object.entries(rows)
      .filter(([id, row]) => key(id) && row.name)
      .map(([id, row]) => [id, row.name as string])
  );
  const names = printed[kind] ?? {};

  it("covers exactly our entities, each once", () => {
    const listed = [
      ...Object.keys(names),
      ...Object.keys(variants)
        .filter((k) => k.startsWith(kind + ":"))
        .map((k) => k.slice(kind.length + 1)),
    ];
    expect(listed.sort()).toEqual(Object.keys(ours).sort());
  });

  it.each(Object.keys(names))("%s carries its official Italian name", (id) => {
    expect(lower(ours[id])).toBe(lower(names[id]));
  });

  const split = Object.keys(variants).filter((k) => k.startsWith(kind + ":"));
  it.skipIf(split.length === 0).each(split)("%s opens with its printed heading", (k) => {
    const id = k.slice(kind.length + 1);
    const stem = (variants[k] ?? "").replace(/ \+1, \+2 o \+3$/, "");
    expect(lower(ours[id])?.startsWith(stem.toLowerCase()), `${ours[id]} / ${stem}`).toBe(
      true
    );
  });
});
