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
  | { model: string; pending: string } // the headless model is ready; the control is not
  | { pending: string } // the owner of the new control still to build
  | { na: string }; // not a prompt (a display row): why

/** Component-level classic prompts, by function name. */
const COMPONENTS: Record<string, Answer> = {
  AddDefensePicker: {
    model: "src/domains/play/forms-defenses-view.ts",
    pending: "direction: the control on screen",
  },
  BestiaryFormPicker: { covered: "src/domains/play/ui/PlayFormPicker.tsx" },
  BestiarySummonPicker: {
    model: "src/domains/play/forms-defenses-view.ts",
    pending: "direction: the control on screen",
  },
  ChoiceRePicker: { pending: "direction: the grant-bundle re-pick (rest batch)" },
  ChoiceResistancePicker: {
    model: "src/domains/play/reactions-resistance-view.ts",
    pending: "direction: the control on screen",
  },
  ConcentrationSaveBanner: { covered: "src/domains/play/ui/PlayConcentrationSave.tsx" },
  ConcentrationSavePrompt: { covered: "src/domains/play/ui/PlayConcentrationSave.tsx" },
  DamageTray: { covered: "src/domains/play/ui/PlayTray.tsx" },
  DefenseRow: { na: "a display row of the sheet's defenses" },
  DyingBanner: { covered: "src/domains/play/ui/PlayDown.tsx" },
  FamiliarFormPicker: {
    model: "src/domains/play/forms-defenses-view.ts",
    pending: "direction: the control on screen",
  },
  HpEditPopover: { covered: "src/domains/play/ui/PlayHp.tsx" },
  ItemResourceRailRow: { covered: "src/domains/play/ui/PlayLeft.tsx" },
  LogEntryRow: { covered: "src/domains/play/ui/PlayRight.tsx" },
  OffListReactionRow: {
    model: "src/domains/play/reactions-resistance-view.ts",
    pending: "direction: the control on screen",
  },
  PipRow: { na: "the death-save gems, a display of the track" },
  PromptedBanner: { pending: "direction: Wish's follow-up on the turn strip" },
  ReadiedSpellRow: {
    model: "src/domains/play/reactions-resistance-view.ts",
    pending: "direction: the control on screen",
  },
  SpeciesChoicesBanner: { covered: "src/domains/play/ui/PlaySpeciesChoices.tsx" },
  SummaryRow: { covered: "src/domains/play/ui/PlayRest.tsx" },
  TransformFormPicker: { covered: "src/domains/play/ui/PlayFormPicker.tsx" },
};

/** Store-level classic prompts (direction's inventory, 2026-11-09). */
const SELECTORS: Record<string, Answer> = {
  applyFirstRollTopUps: { covered: "src/domains/play/sheet-initiative-roll.ts" },
  resolveStartOfTurnRegen: {
    model: "src/domains/play/turn-start-notes.ts",
    pending: "direction: the control on screen",
  },
  resolveRound1DamageDoubles: {
    model: "src/domains/play/turn-start-notes.ts",
    pending: "direction: the control on screen",
  },
  toggleSurprise: {
    model: "src/domains/play/roll-dialog-state.ts",
    pending: "direction: the control on screen",
  },
  maintenancePrompts: {
    model: "src/domains/play/turn-model.ts",
    pending: "direction: the control on screen",
  },
  pendingWish: {
    model: "src/domains/play/turn-model.ts",
    pending: "direction: the control on screen",
  },
  timeStopTurns: {
    model: "src/domains/play/turn-model.ts",
    pending: "direction: the control on screen",
  },
  extraTurnOffer: {
    model: "src/domains/play/turn-model.ts",
    pending: "direction: the control on screen",
  },
  standUp: {
    model: "src/domains/play/turn-model.ts",
    pending: "direction: the control on screen",
  },
  soloEndTurn: {
    model: "src/domains/play/turn-model.ts",
    pending: "direction: the control on screen",
  },
  concentrationDrop: {
    model: "src/domains/play/concentration-model.ts",
    pending: "direction: the control on screen",
  },
  critAtZero: { covered: "src/domains/play/ui/PlayDown.tsx" },
  deathSaveAdvantage: {
    model: "src/domains/play/roll-dialog-state.ts",
    pending: "direction: the control on screen",
  },
  heldInspiration: { covered: "src/domains/play/ui/PlayInspiration.tsx" },
  afterHitOptions: {
    model: "src/domains/play/after-hit-options.ts",
    pending: "direction: the control on screen",
  },
  checkEntry: {
    model: "src/domains/play/check-entry.ts",
    pending: "direction: the control on screen",
  },
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
    const gone = answers.flatMap((a) => {
      const path = "covered" in a ? a.covered : "model" in a ? a.model : null;
      return path && !existsSync(path) ? [path] : [];
    });
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
