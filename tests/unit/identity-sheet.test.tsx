import { loadSrdCatalogues } from "@/i18n/loaders";
import { registerSrdCatalogues } from "@/i18n/srd-en";
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { createInstance } from "i18next";
import { IdentitySheet } from "@/features/identity/IdentitySheet";
import type { FolioCharacter } from "@/lib/identity/model";
import { mergedUi } from "./__helpers__/ui-merged";
const en = mergedUi("en");

const character: FolioCharacter = {
  schema: 1,
  id: "test",
  ownerUid: "owner",
  name: "Test",
  classId: "warlock",
  speciesId: "human",
  level: 3,
  revision: 0,
  currentAssignment: null,
  portraitPath: null,
  sheet: {
    build: {
      classes: [{ classId: "warlock", level: 3 }],
      abilities: { CHA: 16 },
      skills: { arcana: "expertise" },
      spellSlots: [
        { level: 2, total: 2 },
        { level: 2, total: 2, pactMagic: true },
      ],
      spells: [{ srdId: "acid-splash" }],
    },
    state: { usedSlots: { "2": 0, "pact-2": 1 } },
  },
};
async function mount(value: FolioCharacter = character, locale: "en" | "it" = "en") {
  const i18n = createInstance();
  if (locale === "it") registerSrdCatalogues("it", await loadSrdCatalogues("it"));
  await i18n.init({
    lng: locale,
    defaultNS: "common",
    resources: { [locale]: { common: locale === "en" ? en : mergedUi("it") } },
  });
  render(
    <I18nextProvider i18n={i18n}>
      <IdentitySheet character={value} />
    </I18nextProvider>
  );
}
describe("authorized read-only sheet", () => {
  it("keeps Pact Magic spending separate from the shared slot pool", async () => {
    await mount();
    const rows = within(screen.getByRole("table")).getAllByRole("row");
    if (!rows[1] || !rows[2]) throw new Error("Missing spell slot rows");
    expect(within(rows[1]).getAllByRole("cell")[1]?.textContent).toBe("0");
    expect(within(rows[2]).getAllByRole("cell")[1]?.textContent).toBe("1");
  });
  it("presents proficiency ranks as localized labels", async () => {
    await mount();
    expect(screen.getByText("Expertise")).toBeTruthy();
  });
  it("makes a reference-only spell definition readable without editable store hydration", async () => {
    await mount();
    expect(screen.getByText(/You hurl a bubble of acid/)).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});

describe("preserved authorized sheet details", () => {
  it("keeps per-instance text and range ahead of catalogue defaults", async () => {
    await mount({
      ...character,
      sheet: {
        ...character.sheet,
        build: {
          ...character.sheet.build,
          spells: [
            {
              srdId: "acid-splash",
              range: "125 feet",
              description: "Owner-approved variant description",
            },
          ],
        },
      },
    });
    expect(screen.getByText("125 feet")).toBeTruthy();
    expect(screen.getByText("Owner-approved variant description")).toBeTruthy();
    expect(screen.queryByText(/You hurl a bubble of acid/)).toBeNull();
  });
  it("presents class choices, spell overrides, charges, tracker rolls and content tables", async () => {
    await mount({
      ...character,
      sheet: {
        build: {
          classes: [
            {
              classId: "warlock",
              level: 3,
              fightingStyles: ["Archery technique"],
              invocationChoices: ["Patron invocation"],
              metamagicChoices: ["Subtle technique"],
            },
          ],
          spellcasting: {
            ability: "CHA",
            saveDCOverride: 19,
            slotMaxOverrides: { "pact-2": 4 },
          },
          equipment: [
            {
              custom: true,
              name: "Runic lantern",
              charges: { current: 2, max: 7, recoveryFormula: "1d6" },
              trackers: [{ id: "lantern", label: "Lantern light", total: 7 }],
              contentBlocks: [
                {
                  type: "table",
                  title: "Lantern colors",
                  table: {
                    headers: ["Color", "Effect"],
                    rows: [["Amber", "Reveal hidden runes"]],
                  },
                },
              ],
            },
          ],
        },
        state: {
          trackers: { lantern: { used: 2, rolls: [4, null, 6] } },
          familiar: { monsterId: "owl", dismissed: false },
        },
      },
    });
    for (const value of [
      "Archery technique",
      "Patron invocation",
      "Subtle technique",
      "19",
      "1d6",
      "Lantern light",
      "Reveal hidden runes",
    ])
      expect(screen.getByText(value)).toBeTruthy();
    expect(screen.getByRole("table", { name: "Lantern colors" })).toBeTruthy();
    expect(screen.queryByText(/\{.*"/)).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});

it.each(["en", "it"] as const)(
  "names canonical tool equipment in %s without losing legacy training or authored labels",
  async (locale) => {
    const original = structuredClone(character);
    original.sheet.build.toolProficiencyIds = [
      "dice-set",
      "simple-weapons",
      "Owner's custom kit",
    ];
    const bytes = JSON.stringify(original);
    await mount(original, locale);
    expect(
      screen.getByText(
        locale === "it"
          ? "Dadi, Armi semplici, Owner's custom kit"
          : "Dice Set, Simple weapons, Owner's custom kit"
      )
    ).toBeTruthy();
    expect(screen.queryByText(/dice-set/)).toBeNull();
    expect(JSON.stringify(original)).toBe(bytes);
  }
);
