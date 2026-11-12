/**
 * An attack with no target in Folio still says what happened: the player's result and,
 * when they typed it, the damage dealt, on the same action line (the D&D Beyond game
 * log's pattern: the sheet posts the hit and the damage, no target needed).
 * «Ana usa Spada lunga — colpito, 9 danni». A miss carries no damage; a skipped tray
 * leaves today's line.
 */
import i18next from "i18next";
import { describe, expect, it } from "vitest";

import en from "@/i18n/en/ui/sessionReport.json";
import it_ from "@/i18n/it/ui/sessionReport.json";
import { combatEventToPlayEvent } from "@/lib/session-log";
import type { PlayEvent } from "@/lib/session-log";
import { localizePlayEvent } from "@/lib/views/session-report-view";

const sword = { custom: "Longsword" } as const;

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
      action: () => (lng === "it" ? "Spada lunga" : "Longsword"),
      spell: (ref) => ref,
      locale: lng,
    }
  );
}

const attack = (extra: Partial<Extract<PlayEvent, { kind: "action" }>>): PlayEvent => ({
  kind: "action",
  actor: "pc-a",
  source: sword,
  slot: "action",
  ...extra,
});

describe("an attack's result and damage with no target", () => {
  it("a hit with its damage, in both languages", async () => {
    expect(await line("it", attack({ outcome: "hit", amount: 9 }))).toBe(
      "Ana usa Spada lunga — colpito, 9 danni"
    );
    expect(await line("en", attack({ outcome: "critical", amount: 18 }))).toBe(
      "Ana uses Longsword — critical, 18 damage"
    );
  });

  it("a miss, or a hit with no number, says the result alone", async () => {
    expect(await line("en", attack({ outcome: "miss" }))).toBe(
      "Ana uses Longsword — miss"
    );
    expect(await line("it", attack({ outcome: "hit" }))).toBe(
      "Ana usa Spada lunga — colpito"
    );
  });

  it("the sheet's use carries the result and the damage into the session", () => {
    expect(
      combatEventToPlayEvent(
        {
          kind: "action-use",
          action: sword,
          effect: "attack",
          slot: "action",
          outcome: "hit",
          amount: 9,
        },
        "pc-a"
      )
    ).toEqual({
      kind: "action",
      actor: "pc-a",
      source: sword,
      slot: "action",
      outcome: "hit",
      amount: 9,
    });
  });
});
