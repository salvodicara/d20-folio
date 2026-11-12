/**
 * A spell cast with a higher slot than its own level says so in the session report,
 * in the app's way of naming slot levels: «Ana lancia Palla di Fuoco (slot di 4° livello)»
 * / "(level 4 slot)"; Pact Magic: «(slot di Magia del Patto, 4° livello)» / "(Pact Magic
 * slot, level 4)". A cast at the spell's own level, or a cantrip, says nothing more.
 */
import i18next from "i18next";
import { describe, expect, it } from "vitest";

import en from "@/i18n/en/ui/sessionReport.json";
import it_ from "@/i18n/it/ui/sessionReport.json";
import { combatEventToPlayEvent } from "@/lib/session-log";
import type { PlayEvent } from "@/lib/session-log";
import { localizePlayEvent } from "@/lib/views/session-report-view";
import type { CombatEvent } from "@/types/combat-log";

const fireball = { srd: { kind: "spell", key: "fireball", field: "name" } } as const;
const cast = (
  extra: Partial<Extract<CombatEvent, { kind: "action-use" }>>
): CombatEvent => ({
  kind: "action-use",
  action: fireball,
  effect: "spell-cast",
  slot: "action",
  spellLevel: 3,
  ...extra,
});

async function line(lng: "en" | "it", event: PlayEvent): Promise<string | null> {
  const i18n = i18next.createInstance();
  await i18n.init({
    lng,
    resources: { en: { translation: en }, it: { translation: it_ } },
    interpolation: { escapeValue: false },
  });
  return localizePlayEvent(
    event,
    (k, a) => i18n.t(k, a),
    () => "Ana",
    {
      pc: () => "Ana",
      condition: (id) => id,
      action: () => (lng === "it" ? "Palla di Fuoco" : "Fireball"),
      spell: (ref) => ref,
      locale: lng,
    }
  );
}

describe("an upcast on the cast line", () => {
  it("a higher slot is carried into the session; the spell's own level is not", () => {
    expect(
      combatEventToPlayEvent(cast({ paidSlot: { level: 4 } }), "pc-a")
    ).toMatchObject({
      upcast: { level: 4 },
    });
    expect(
      combatEventToPlayEvent(cast({ paidSlot: { level: 3 } }), "pc-a")
    ).not.toHaveProperty("upcast");
    expect(
      combatEventToPlayEvent(cast({ paidSlot: { level: 5, pactMagic: true } }), "pc-a")
    ).toMatchObject({ upcast: { level: 5, pactMagic: true } });
  });

  it("reads in the app's own slot wording, in both languages", async () => {
    const upcast = (pactMagic?: true): PlayEvent => ({
      kind: "action",
      actor: "pc-a",
      source: fireball,
      slot: "action",
      upcast: { level: 4, ...(pactMagic ? { pactMagic } : {}) },
    });
    expect(await line("it", upcast())).toBe(
      "Ana lancia Palla di Fuoco (slot di 4° livello)"
    );
    expect(await line("en", upcast())).toBe("Ana casts Fireball (level 4 slot)");
    expect(await line("it", upcast(true))).toBe(
      "Ana lancia Palla di Fuoco (slot di Magia del Patto, 4° livello)"
    );
    expect(await line("en", upcast(true))).toBe(
      "Ana casts Fireball (Pact Magic slot, level 4)"
    );
  });
});
