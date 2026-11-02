/**
 * The catalogue writes scaled dice and amounts in one language (edge-case family
 * M11, `@/lib/scalar`). The legacy dialects stay readable only because a player's
 * stored homebrew may still carry them; no catalogue entry (app or pack) may use
 * them again. Each dialect leaves this list as it is retired.
 */
import { describe, expect, it } from "vitest";
import { classFeatures } from "@/data/classes";
import { spells } from "@/data/spells";
import { SRD_FEATS } from "@/data/feats";
import { SRD_RACES } from "@/data/races";
import { SRD_BACKGROUNDS } from "@/data/backgrounds";
import { SRD_MAGIC_ITEMS } from "@/data/magic-items";
import { SRD_INVOCATIONS } from "@/data/invocations";

const CATALOGUE = {
  classFeatures,
  spells,
  feats: SRD_FEATS,
  races: SRD_RACES,
  backgrounds: SRD_BACKGROUNDS,
  magicItems: SRD_MAGIC_ITEMS,
  invocations: SRD_INVOCATIONS,
};

/** Every object with `type: <kind>` anywhere in the catalogue, with its path. */
function grantsOfKind(
  kind: string
): Array<{ path: string; grant: Record<string, unknown> }> {
  const out: Array<{ path: string; grant: Record<string, unknown> }> = [];
  const seen = new Set<object>();
  const walk = (value: unknown, path: string): void => {
    if (typeof value !== "object" || value === null || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      value.forEach((v, i) => walk(v, `${path}[${i}]`));
      return;
    }
    const record = value as Record<string, unknown>;
    if (record.type === kind) out.push({ path, grant: record });
    const id = typeof record.id === "string" ? record.id : undefined;
    for (const [key, child] of Object.entries(record))
      walk(child, id ? `${id}.${key}` : `${path}.${key}`);
  };
  for (const [name, list] of Object.entries(CATALOGUE)) walk(list, name);
  return out;
}

describe("the catalogue uses one language for scaled numbers", () => {
  it("finds the damage riders it checks", () => {
    expect(grantsOfKind("damage-rider").length).toBeGreaterThan(5);
  });

  it("no damage rider uses the legacy `diceByLevel` (use `levelDice`)", () => {
    expect(
      grantsOfKind("damage-rider")
        .filter(({ grant }) => "diceByLevel" in grant)
        .map(({ path }) => path)
    ).toEqual([]);
  });

  it("no amount uses the legacy `castLevelScaling` (use `castScaled`)", () => {
    expect(
      [...grantsOfKind("hp-flat"), ...grantsOfKind("damage-retaliation")]
        .filter(({ grant }) => "castLevelScaling" in grant)
        .map(({ path }) => path)
    ).toEqual([]);
  });
});
