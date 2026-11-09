/**
 * Play parity guard: every prompt the classic sheet raises has an answer on the new
 * Play screen — the new-UI module that covers it, or «pending (owner)» with who owns
 * the new control. A classic prompt with no entry fails the test, so none can be
 * dropped silently when the new UI ships (release gate, 2026-11-09).
 *
 * The classic prompts are read from the code: every component function in
 * `src/features/character` named like a prompt (…Banner, …Prompt, …Picker, …Row,
 * …Popover, …Dialog, …Tray). Prompts that live in a store selector rather than a
 * component (direction's inventory) are listed by hand below.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

type Answer =
  | { covered: string } // the new-UI module that covers it
  | { pending: string } // the owner of the new control still to build
  | { na: string }; // not a prompt (a display row): why

/** Component-level classic prompts, by function name. */
const COMPONENTS: Record<string, Answer> = {
  AddDefensePicker: { pending: "direction: adding a temporary defense on Play" },
  BestiaryFormPicker: { covered: "src/domains/play/ui/PlayFormPicker.tsx" },
  BestiarySummonPicker: { pending: "direction: a summon's form on Play" },
  ChoiceRePicker: { pending: "direction: the grant-bundle re-pick (rest batch)" },
  ChoiceResistancePicker: {
    pending: "direction: the choice-resistance pick (new control)",
  },
  ConcentrationSaveBanner: { pending: "direction: the Concentration save prompt" },
  ConcentrationSavePrompt: { pending: "direction: the Concentration save prompt" },
  DamageTray: { covered: "src/domains/play/ui/PlayTray.tsx" },
  DefenseRow: { na: "a display row of the sheet's defenses" },
  DyingBanner: { pending: "direction: the 0-HP family (savers, the dead verdict)" },
  FamiliarFormPicker: { pending: "direction: the familiar's form on Play" },
  HpEditPopover: { covered: "src/domains/play/ui/PlayHp.tsx" },
  ItemResourceRailRow: { covered: "src/domains/play/ui/PlayLeft.tsx" },
  LogEntryRow: { covered: "src/domains/play/ui/PlayRight.tsx" },
  OffListReactionRow: {
    pending: "direction: «Mark reaction used» for an off-list reaction",
  },
  PipRow: { na: "the death-save gems, a display of the track" },
  PromptedBanner: { pending: "direction: Wish's follow-up on the turn strip" },
  ReadiedSpellRow: { pending: "direction: releasing a Readied spell" },
  SpeciesChoicesBanner: { covered: "src/domains/play/ui/PlaySpeciesChoices.tsx" },
  SummaryRow: { covered: "src/domains/play/ui/PlayRest.tsx" },
  TransformFormPicker: { covered: "src/domains/play/ui/PlayFormPicker.tsx" },
};

/** Store-level classic prompts (direction's inventory, 2026-11-09). */
const SELECTORS: Record<string, Answer> = {
  applyFirstRollTopUps: { covered: "src/domains/play/sheet-initiative-roll.ts" },
  resolveStartOfTurnRegen: { pending: "direction: a turn-start note with one-tap apply" },
  resolveRound1DamageDoubles: { pending: "direction: the round-1 Death Strike note" },
  toggleSurprise: { pending: "direction: Advantage/Disadvantage on the initiative roll" },
  maintenancePrompts: { pending: "direction: the solo turn strip" },
  pendingWish: { pending: "direction: the solo turn strip" },
  timeStopTurns: { pending: "direction: the solo turn strip" },
  extraTurnOffer: { pending: "direction: the solo turn strip" },
  standUp: { pending: "direction: the solo turn strip" },
  soloEndTurn: { pending: "direction: the solo turn strip (End Turn out of a fight)" },
  concentrationDrop: {
    pending: "direction: «Drop» Concentration (the chip has no popover)",
  },
  critAtZero: { pending: "direction: the crit-at-0 toggle on the HP control" },
  deathSaveAdvantage: { pending: "direction: Advantage on the death save" },
  heldInspiration: { pending: "direction: Heroic Inspiration and a held Bardic die" },
  afterHitOptions: { pending: "direction: Cunning Strike and maneuvers after a hit" },
  checkEntry: { pending: "direction: the Hide / Escape / Search check entry" },
};

const PROMPT_FUNCTION =
  /^(?:export )?function ([A-Z][A-Za-z]*(?:Banner|Prompt|Picker|Row|Popover|Dialog|Tray))\b/gm;

function classicPromptNames(dir: string): Set<string> {
  const names = new Set<string>();
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      for (const n of classicPromptNames(path)) names.add(n);
    } else if (/\.tsx$/.test(entry) && !/\.(test|stories)\.tsx$/.test(entry)) {
      for (const m of readFileSync(path, "utf8").matchAll(PROMPT_FUNCTION)) {
        if (m[1]) names.add(m[1]);
      }
    }
  }
  return names;
}

describe("Play parity: every classic prompt has an answer on the new Play screen", () => {
  it("each classic prompt component is in the table", () => {
    const missing = [...classicPromptNames("src/features/character")].filter(
      (name) => !(name in COMPONENTS)
    );
    expect(
      missing,
      "add each to COMPONENTS: covered by a new-UI module, or pending"
    ).toEqual([]);
  });

  it("each covering module exists", () => {
    const answers = [...Object.values(COMPONENTS), ...Object.values(SELECTORS)];
    const gone = answers.flatMap((a) =>
      "covered" in a && !existsSync(a.covered) ? [a.covered] : []
    );
    expect(gone).toEqual([]);
  });

  it("each store-level prompt still exists in the classic code, or is retired here", () => {
    const classic = ["src/features", "src/stores", "src/lib", "src/app"]
      .map((d) => grepTree(d))
      .join("\n");
    const named = [
      "applyFirstRollTopUps",
      "resolveStartOfTurnRegen",
      "resolveRound1DamageDoubles",
      "toggleSurprise",
      "maintenancePrompts",
      "pendingWish",
      "timeStopTurns",
      "extraTurnOffer",
      "standUp",
    ];
    expect(named.filter((n) => !classic.includes(n))).toEqual([]);
  });
});

function grepTree(dir: string): string {
  let out = "";
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out += grepTree(path);
    else if (/\.tsx?$/.test(entry) && !/\.test\./.test(entry))
      out += readFileSync(path, "utf8");
  }
  return out;
}
