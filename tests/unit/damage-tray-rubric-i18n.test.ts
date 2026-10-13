/**
 * The damage tray names the damage the way each language's SRD writes it: Italian
 * says "danni taglienti" and "danni da fuoco", never "danni da tagliente". Cases come
 * from the damage-type list; the reference is the Italian SRD text itself.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DAMAGE_TYPES } from "@/types/damage";
import itCombat from "@/i18n/it/ui/combat.json";
import enCombat from "@/i18n/en/ui/combat.json";

const srdDir = join(__dirname, "../../src/i18n/it/srd");
const italianSrd = readdirSync(srdDir)
  .filter((file) => file.endsWith(".json"))
  .map((file) => readFileSync(join(srdDir, file), "utf8"))
  .join("\n")
  .toLowerCase();

const phrases = (combat: unknown): Record<string, string> =>
  (combat as { combat: { damageTray: { damageOf?: Record<string, string> } } }).combat
    .damageTray.damageOf ?? {};

describe.each(DAMAGE_TYPES.map((type) => [type]))("%s damage", (type) => {
  it("reads in Italian as the Italian SRD writes it", () => {
    const phrase = phrases(itCombat)[type];
    expect(phrase).toBeTruthy();
    expect(italianSrd).toContain(String(phrase).toLowerCase());
  });

  it("has its English phrase", () => {
    expect(phrases(enCombat)[type]).toMatch(new RegExp(`^${type} damage$`, "i"));
  });
});
