/** Delivery, identity and optional-fallback lock for Compendium item plates. */
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SRD_EQUIPMENT } from "@/data/equipment";
import { SRD_MAGIC_ITEMS } from "@/data/magic-items";
import { ITEM_ART, ITEM_ART_COMPLETE, itemArtUrl } from "@/data/item-art";
import { webpSize } from "@tests/helpers/webp";

const ROOT = process.cwd();
const ART_ROOTS = [
  path.join(ROOT, "assets", "items"),
  path.join(ROOT, "content-pack", "assets", "items"),
].filter(existsSync);
const CORPORA = [
  {
    kind: "equipment" as const,
    dirs: ART_ROOTS.map((root) => path.join(root, "equipment")).filter(existsSync),
    ids: new Set(SRD_EQUIPMENT.map((item) => item.id)),
  },
  {
    kind: "magic" as const,
    dirs: ART_ROOTS.map((root) => path.join(root, "magic")).filter(existsSync),
    ids: new Set(SRD_MAGIC_ITEMS.map((item) => item.id)),
  },
];

describe("canonical item art guard", () => {
  it("maps every public plate to a real typed corpus id with no manifest drift", () => {
    const fileKeys = CORPORA.flatMap(({ kind, dirs, ids }) =>
      dirs.flatMap((dir) =>
        readdirSync(dir)
          .filter((name) => name.endsWith(".webp"))
          .map((name) => {
            const fileStem = path.basename(name, ".webp");
            expect(fileStem.startsWith(`${kind}--`), fileStem).toBe(true);
            const id = fileStem.slice(`${kind}--`.length);
            expect(ids.has(id), `${kind}:${id}`).toBe(true);
            return `${kind}:${id}`;
          })
      )
    ).sort();

    expect(Object.keys(ITEM_ART).sort()).toEqual(fileKeys);
    expect(itemArtUrl("equipment", "missing-item")).toBeNull();
  });

  it("reveals plates as one complete corpus, never as a partial collection", () => {
    const expectedKeys = CORPORA.flatMap(({ kind, ids }) =>
      [...ids].map((id) => `${kind}:${id}`)
    ).sort();
    const actualKeys = Object.keys(ITEM_ART).sort();
    expect(ITEM_ART_COMPLETE).toBe(
      expectedKeys.length === actualKeys.length &&
        expectedKeys.every((key, index) => key === actualKeys[index])
    );

    for (const { kind, ids } of CORPORA) {
      for (const id of ids) {
        expect(Boolean(itemArtUrl(kind, id)), `${kind}:${id}`).toBe(ITEM_ART_COMPLETE);
      }
    }
  });

  it("keeps every plate 4:5, intrinsic-size stable and within the detail budget", () => {
    for (const { dirs } of CORPORA) {
      for (const dir of dirs) {
        for (const name of readdirSync(dir).filter((file) => file.endsWith(".webp"))) {
          const file = path.join(dir, name);
          expect(webpSize(file), name).toEqual({ width: 672, height: 840 });
          expect(statSync(file).size, name).toBeLessThanOrEqual(45_000);
        }
      }
    }
  });
});
