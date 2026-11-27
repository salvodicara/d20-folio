/**
 * A death save the DM ticked reads «by the DM» in the session report (the player's log
 * of the evening), as the DM's initiative roll already does; the hero's own tick reads
 * as before.
 */
import i18next from "i18next";
import { beforeAll, describe, expect, it } from "vitest";

import enReport from "@/i18n/en/ui/sessionReport.json";
import itReport from "@/i18n/it/ui/sessionReport.json";
import { localizePlayEvent } from "@/lib/views/session-report-view";

const names = {
  pc: () => undefined,
  condition: (id: string) => id,
  action: () => "",
  spell: (ref: string) => ref,
  locale: "en" as const,
};

describe("a death save in the session report", () => {
  const inst = i18next.createInstance();
  beforeAll(async () => {
    await inst.init({
      lng: "en",
      resources: { en: { translation: enReport }, it: { translation: itReport } },
      interpolation: { escapeValue: false },
    });
  });
  const line = (lng: "en" | "it", rolledBy?: "dm") =>
    localizePlayEvent(
      {
        kind: "death-save",
        outcome: "success",
        actor: "pc-ana",
        ...(rolledBy ? { rolledBy } : {}),
      },
      inst.getFixedT(lng),
      () => "Ana",
      names
    );

  it("the DM's tick says so, in English and Italian", () => {
    expect(line("en", "dm")).toBe(
      "Ana succeeds on a death saving throw (marked by the DM)"
    );
    expect(line("it", "dm")).toBe(
      "Ana supera un tiro salvezza contro la morte (segnato dal master)"
    );
  });

  it("the hero's own tick reads as before", () => {
    expect(line("en")).toBe("Ana succeeds on a death saving throw");
  });
});
