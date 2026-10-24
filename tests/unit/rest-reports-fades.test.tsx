/**
 * A Long Rest that steps a fading D20 Test penalty down (Raise Dead −4 → −3, or
 * ends it) or restores a reduced Hit Point maximum says so: the rest summary shows
 * a row for each, the sheet's log records it through the existing `fading-penalty`
 * and `hp-max-reduction` lines, and the session report reads the new amount. The
 * cases come from the data: every fading penalty, at every amount it can stand at,
 * steps down by its rest rule; a reduction restores the full maximum.
 */
import { render, screen, fireEvent, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import i18next from "i18next";
import type { User } from "firebase/auth";

import i18n from "@/i18n";
import enReport from "@/i18n/en/ui/sessionReport.json";
import itReport from "@/i18n/it/ui/sessionReport.json";
import { RestModal } from "@/features/character/RestModal";
import { ItemResourceCommandProvider } from "@/features/character/center/ItemResourceCommandProvider";
import { effectiveMaxHp } from "@/lib/aggregate-character";
import { MOCK_CHARACTER } from "@/lib/mock";
import {
  FADING_PENALTIES,
  fadingPenaltiesAfterLongRest,
} from "@/lib/play/fading-penalties";
import { longRestFades, sessionAfterLongRestReduction } from "@/lib/play/rests";
import { combatEventToPlayEvent } from "@/lib/session-log";
import { localizePlayEvent } from "@/lib/views/session-report-view";
import { useAuthStore } from "@/stores/authStore";
import { useCharacterStore } from "@/stores/characterStore";
import { useToastStore } from "@/stores/toastStore";
import type { CharacterDoc } from "@/types/character";
import type { CombatEvent } from "@/types/combat-log";

const REDUCTION = 10;

/** Every amount each fading penalty can stand at, from the catalogue of them. */
const PENALTY_CASES = Object.entries(FADING_PENALTIES).flatMap(([id, def]) =>
  Array.from({ length: def.start }, (_, i) => ({ id, amount: def.start - i }))
);

function docWith(
  fadingPenalties: Record<string, number> | undefined,
  hpMaxReduction?: number
): CharacterDoc {
  const doc = structuredClone(MOCK_CHARACTER);
  doc.session.hp = { current: 5, temp: 0 };
  doc.session.fadingPenalties = fadingPenalties;
  doc.session.hpMaxReduction = hpMaxReduction;
  return doc;
}

describe("longRestFades — what a Long Rest fades, read from the rules", () => {
  it.each(PENALTY_CASES)(
    "$id at −$amount steps down by its rest rule",
    ({ id, amount }) => {
      const doc = docWith({ [id]: amount });
      const after = fadingPenaltiesAfterLongRest(doc.session.fadingPenalties)?.[id] ?? 0;
      expect(longRestFades(doc).penalties).toEqual([{ id, before: amount, after }]);
      expect(after).toBe(amount - 1);
    }
  );

  it("a Hit Point maximum reduction restores the full maximum", () => {
    const doc = docWith(undefined, REDUCTION);
    const full = effectiveMaxHp(
      doc.character,
      sessionAfterLongRestReduction(doc.session)
    );
    expect(longRestFades(doc).maxHp).toEqual({ before: full - REDUCTION, after: full });
  });

  it("nothing to fade, nothing to report", () => {
    expect(longRestFades(docWith(undefined))).toEqual({ penalties: [], maxHp: null });
  });
});

function fadeEvents(): CombatEvent[] {
  return (useCharacterStore.getState().character?.session.logEntries ?? [])
    .map((entry) => entry.event)
    .filter(
      (event) => event.kind === "fading-penalty" || event.kind === "hp-max-reduction"
    );
}

async function longRest(): Promise<HTMLElement> {
  render(
    <ItemResourceCommandProvider>
      <RestModal open onClose={() => {}} />
    </ItemResourceCommandProvider>
  );
  fireEvent.click(screen.getByText("Riposo Lungo"));
  fireEvent.click(screen.getByRole("button", { name: "Completa riposo" }));
  await screen.findByText("Riposo Lungo Completato");
  return screen.getAllByRole("dialog").at(-1) as HTMLElement;
}

for (const path of ["legacy", "world"] as const) {
  describe(`a Long Rest reports what faded (${path} rest)`, () => {
    beforeEach(async () => {
      useCharacterStore.setState({
        character: docWith({ "raise-dead": 4, resurrection: 1 }, REDUCTION),
        readonly: false,
        loading: false,
        error: null,
      });
      useAuthStore.setState({
        user: path === "world" ? ({ uid: "test-uid" } as User) : null,
      });
      useToastStore.setState({ toasts: [], timers: {} });
      await i18n.changeLanguage("it");
    });

    it("summarises the penalty step, the penalty end and the restored maximum", async () => {
      const full = effectiveMaxHp(MOCK_CHARACTER.character, MOCK_CHARACTER.session);
      const dialog = await longRest();
      const row = (label: string) =>
        within(dialog).getByText(label).closest(".rest-summary-row") as HTMLElement;
      expect(row("Penalità di Rianimare Morti")).toHaveTextContent("−4 → −3");
      expect(row("Penalità di Resurrezione")).toHaveTextContent("−1 → 0");
      expect(row("PF massimi ripristinati")).toHaveTextContent(
        `${full - REDUCTION} → ${full}`
      );
    });

    it("logs them through the existing fading-penalty and max-HP lines", async () => {
      const full = effectiveMaxHp(MOCK_CHARACTER.character, MOCK_CHARACTER.session);
      await longRest();
      expect(fadeEvents()).toEqual([
        { kind: "fading-penalty", penaltyId: "raise-dead", amount: 3 },
        { kind: "fading-penalty", penaltyId: "resurrection", amount: 0 },
        { kind: "hp-max-reduction", reduction: 0, max: full },
      ]);
    });
  });
}

describe("the session report reads where a fading penalty now stands", () => {
  const names = {
    pc: () => undefined,
    condition: (id: string) => id,
    action: () => "",
    spell: () => "",
    source: (id: string) => (id === "raise-dead" ? "Rianimare Morti" : id),
  };
  for (const [lng, resources, step, end] of [
    [
      "en",
      enReport,
      "Ana's Rianimare Morti: −3 to d20 Tests",
      "Ana's Rianimare Morti ends",
    ],
    [
      "it",
      itReport,
      "Rianimare Morti di Ana: −3 ai tiri d20",
      "Termina Rianimare Morti di Ana",
    ],
  ] as const) {
    it(`a step down reads its amount, an end reads as an end (${lng})`, async () => {
      const t = i18next.createInstance();
      await t.init({
        lng,
        resources: { [lng]: { translation: resources } },
        interpolation: { escapeValue: false },
      });
      const line = (amount: number) =>
        localizePlayEvent(
          combatEventToPlayEvent(
            { kind: "fading-penalty", penaltyId: "raise-dead", amount },
            "pc-ana"
          ) ?? { kind: "note", text: "" },
          (k, a) => t.t(k, a),
          (id) => (id === "pc-ana" ? "Ana" : "?"),
          { ...names, locale: lng }
        );
      expect(line(3)).toBe(step);
      expect(line(0)).toBe(end);
    });
  }
});
