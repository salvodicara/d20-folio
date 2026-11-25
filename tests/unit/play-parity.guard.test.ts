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
  | { partial: string; missing: string } // a mounted new-UI module covers part; what is not
  | { model: string; pending: string } // the headless model is ready; the control is not
  | { pending: string } // the owner of the new control still to build
  | { na: string }; // not a prompt (a display row): why

/** Component-level classic prompts, by function name. */
const COMPONENTS: Record<string, Answer> = {
  AddDefensePicker: { covered: "src/domains/play/ui/PlayDefenses.tsx" },
  BestiaryFormPicker: { covered: "src/domains/play/ui/PlayFormPicker.tsx" },
  BestiarySummonPicker: { covered: "src/domains/play/ui/PlayCompanions.tsx" },
  ChoiceRePicker: {
    partial: "src/domains/play/ui/PlayRestSummary.tsx",
    missing:
      "re-picking maneuvers, metamagic, invocations or weapon masteries outside a level-up",
  },
  ChoiceResistancePicker: { covered: "src/domains/play/ui/PlayDefenses.tsx" },
  ConcentrationSaveBanner: { covered: "src/domains/play/ui/PlayConcentrationSave.tsx" },
  ConcentrationSavePrompt: { covered: "src/domains/play/ui/PlayConcentrationSave.tsx" },
  DamageTray: { covered: "src/domains/play/ui/PlayTray.tsx" },
  DefenseRow: { na: "a display row of the sheet's defenses" },
  DyingBanner: { covered: "src/domains/play/ui/PlayDown.tsx" },
  FamiliarFormPicker: { covered: "src/domains/play/ui/PlayFamiliarPicker.tsx" },
  HitReactionBanner: { covered: "src/domains/play/ui/PlayHitReaction.tsx" },
  HpEditPopover: { covered: "src/domains/play/ui/PlayHp.tsx" },
  ItemResourceRailRow: { covered: "src/domains/play/ui/PlayLeft.tsx" },
  LogEntryRow: { covered: "src/domains/play/ui/PlayRight.tsx" },
  OffListReactionRow: { covered: "src/domains/play/ui/PlayReactionExtras.tsx" },
  PipRow: { na: "the death-save gems, a display of the track" },
  PromptedBanner: {
    na: "a scroll-into-view wrapper for the tracker's prompts, not a prompt",
  },
  ReadiedSpellRow: { covered: "src/domains/play/ui/PlayReactionExtras.tsx" },
  RollReactionDialog: { covered: "src/domains/play/ui/PlayCentre.tsx" },
  SpeciesChoicesBanner: { covered: "src/domains/play/ui/PlaySpeciesChoices.tsx" },
  SummaryRow: { covered: "src/domains/play/ui/PlayRest.tsx" },
  TransformFormPicker: { covered: "src/domains/play/ui/PlayFormPicker.tsx" },
};

/** Store-level classic prompts (direction's inventory, 2026-11-09). */
const SELECTORS: Record<string, Answer> = {
  applyFirstRollTopUps: { covered: "src/domains/play/sheet-initiative-roll.ts" },
  resolveStartOfTurnRegen: { covered: "src/domains/play/ui/PlayTurnStart.tsx" },
  resolveRound1DamageDoubles: { covered: "src/domains/play/ui/PlayTurnStart.tsx" },
  toggleSurprise: { covered: "src/domains/play/ui/PlayCentre.tsx" },
  // Solo and campaign fights alike (a campaign fight on my turn); the extra-turn offer
  // and the Time Stop count are solo-only on the classic sheet too (the DM's turn
  // order steps an extra turn in a shared fight).
  maintenancePrompts: { covered: "src/domains/play/ui/PlaySoloTurn.tsx" },
  pendingWish: {
    partial: "src/domains/play/ui/PlaySoloTurn.tsx",
    missing: "the duplicate and Wish Stress buttons (the note shows)",
  },
  timeStopTurns: { covered: "src/domains/play/ui/PlaySoloTurn.tsx" },
  extraTurnOffer: { covered: "src/domains/play/ui/PlaySoloTurn.tsx" },
  standUp: { covered: "src/domains/play/ui/PlaySoloTurn.tsx" },
  soloEndTurn: { covered: "src/domains/play/ui/PlaySoloTurn.tsx" },
  concentrationDrop: { covered: "src/domains/play/ui/PlayConcentration.tsx" },
  critAtZero: { covered: "src/domains/play/ui/PlayDown.tsx" },
  deathSaveAdvantage: { covered: "src/domains/play/ui/PlayDown.tsx" },
  heldInspiration: { covered: "src/domains/play/ui/PlayInspiration.tsx" },
  afterHitOptions: { covered: "src/domains/play/ui/PlayAfterHit.tsx" },
  checkEntry: { covered: "src/domains/play/ui/PlayCheck.tsx" },
};

/**
 * The campaign screen's classic-only features (the #940 inventory), by the classic file
 * they live in: model ready on the new side, or still pending.
 */
const CAMPAIGN: Record<string, { classic: string; answer: Answer }> = {
  "Invite: share the link, lock joins": {
    classic: "src/features/campaigns/CampaignInvite.tsx",
    answer: {
      model: "src/domains/campaign/campaign-admin.ts",
      pending: "direction: the control on screen",
    },
  },
  "Hand over the DM role, remove a member, delete the campaign": {
    classic: "src/features/campaigns/DmTools.tsx",
    answer: {
      model: "src/domains/campaign/campaign-admin.ts",
      pending: "direction: the control on screen",
    },
  },
  "The DM's party summary": {
    classic: "src/features/campaigns/PartySummary.tsx",
    answer: {
      model: "src/domains/campaign/party-summary-view.ts",
      pending: "direction: the control on screen",
    },
  },
  "Sessions: create, rename, delete": {
    classic: "src/features/campaigns/Sessions.tsx",
    answer: {
      model: "src/domains/chronicle/session-moves.ts",
      pending: "direction: the control on screen",
    },
  },
  "Next session and «Last time»": {
    classic: "src/features/campaigns/LastTime.tsx",
    answer: {
      model: "src/domains/chronicle/session-moves.ts",
      pending: "direction: the control on screen",
    },
  },
  "Rename the campaign": {
    classic: "src/features/campaigns/CampaignHubPage.tsx",
    answer: {
      // The shared store (its rename action is ready) feeds every campaign control.
      pending: "direction: the control on screen",
    },
  },
  "Campaign art": {
    classic: "src/features/campaigns/CampaignArtControl.tsx",
    answer: {
      model: "src/features/campaigns/useCampaignBannerCrop.ts",
      pending: "direction: the control on screen",
    },
  },
  "Attach a character": {
    classic: "src/features/campaigns/Party.tsx",
    answer: {
      model: "src/domains/campaign/attach-character.ts",
      pending: "direction: the control on screen",
    },
  },
  "Hide a creature, reveal its HP, ally or enemy, reorder the turns": {
    classic: "src/features/campaigns/party-encounter.tsx",
    answer: {
      // combat-lifecycle-io's hide/reveal writes are ready; the new Fight tab only honours them.
      pending: "direction: the control on screen",
    },
  },
  "Custom monsters": {
    classic: "src/features/campaigns/encounter-custom-monsters.tsx",
    answer: {
      model: "src/domains/combat/custom-monsters.ts",
      pending: "direction: the control on screen",
    },
  },
  "End-of-fight write-up": {
    classic: "src/features/campaigns/party-chronicle.tsx",
    answer: {
      model: "src/domains/combat/fight-write-up.ts",
      pending: "direction: the control on screen",
    },
  },
  "Chronicle editing, versions, .md download": {
    classic: "src/features/campaigns/Chronicle.tsx",
    answer: {
      model: "src/domains/chronicle/chronicle-editor.ts",
      pending: "direction: the control on screen",
    },
  },
  "A DM-run character in the fight; join or skip a fight": {
    classic: "src/features/campaigns/Party.tsx",
    answer: {
      model: "src/domains/combat/fight-participation.ts",
      pending: "direction: the control on screen",
    },
  },
};

const PROMPT_FUNCTION =
  /^(?:export )?function ([A-Z][A-Za-z]*(?:Banner|Prompt|Picker|Row|Popover|Dialog|Tray))\b/gm;

const PLAY_SCREEN = "src/domains/play/ui/PlayScreen.tsx";
const CAMPAIGN_SCREEN = "src/domains/campaign/ui/CampaignScreen.tsx";

const IMPORT =
  /(?:import|export)[^"']*?from\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

/** Resolve one import specifier to a source file, or null for a package. */
function resolveImport(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = `src/${spec.slice(2)}`;
  else if (spec.startsWith(".")) base = join(from.replace(/\/[^/]*$/, ""), spec);
  else return null;
  for (const ext of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    const path = `${base}${ext}`;
    if (existsSync(path) && statSync(path).isFile()) return path;
  }
  return null;
}

/** Every source file imported, step by step, from `entry` (the entry included). */
function reachableFrom(entry: string): Set<string> {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const m of readFileSync(file, "utf8").matchAll(IMPORT)) {
      const next = resolveImport(file, m[1] ?? m[2] ?? "");
      if (next && !seen.has(next)) queue.push(next);
    }
  }
  return seen;
}

/** The new-UI controls (src/domains/…/ui) on the screen that import `model` directly. */
function usersOnScreen(model: string, screen: string): string[] {
  return [...reachableFrom(screen)].filter(
    (file) =>
      /^src\/domains\/[^/]+\/ui\//.test(file) &&
      [...readFileSync(file, "utf8").matchAll(IMPORT)].some(
        (m) => resolveImport(file, m[1] ?? m[2] ?? "") === model
      )
  );
}

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
      const path =
        "covered" in a
          ? a.covered
          : "partial" in a
            ? a.partial
            : "model" in a
              ? a.model
              : null;
      return path && !existsSync(path) ? [path] : [];
    });
    expect(gone).toEqual([]);
  });

  // A covering module must be on screen: imported, step by step, from the Play screen.
  it("each covering module is mounted on the Play screen", () => {
    const mounted = reachableFrom(PLAY_SCREEN);
    const answers = [...Object.values(COMPONENTS), ...Object.values(SELECTORS)];
    const offScreen = answers.flatMap((a) =>
      "covered" in a && !mounted.has(a.covered)
        ? [a.covered]
        : "partial" in a && !mounted.has(a.partial)
          ? [a.partial]
          : []
    );
    expect(offScreen).toEqual([]);
  });

  // A «pending» row goes stale when a mounted control starts using its model: the
  // 11-09 rows stayed pending after their controls shipped (re-inventory, #1228).
  it("no pending prompt's model is already used by a control on the Play screen", () => {
    const stale = Object.entries({ ...COMPONENTS, ...SELECTORS }).flatMap(([name, a]) =>
      "model" in a && usersOnScreen(a.model, PLAY_SCREEN).length > 0
        ? [`${name}: ${usersOnScreen(a.model, PLAY_SCREEN).join(", ")}`]
        : []
    );
    expect(
      stale,
      "mark these covered by the control, or say what is still missing"
    ).toEqual([]);
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

describe("Campaign parity: every classic-only feature has an answer", () => {
  it("each classic file still exists (a move updates the table)", () => {
    const gone = Object.values(CAMPAIGN).flatMap(({ classic }) =>
      existsSync(classic) ? [] : [classic]
    );
    expect(gone).toEqual([]);
  });

  it("each model or covering module exists", () => {
    const gone = Object.values(CAMPAIGN).flatMap(({ answer }) => {
      const path =
        "covered" in answer ? answer.covered : "model" in answer ? answer.model : null;
      return path && !existsSync(path) ? [path] : [];
    });
    expect(gone).toEqual([]);
  });

  // No campaign row is covered yet, so this holds trivially until the first one is.
  it("each covering module is mounted on the campaign screen", () => {
    const mounted = reachableFrom(CAMPAIGN_SCREEN);
    const offScreen = Object.values(CAMPAIGN).flatMap(({ answer }) =>
      "covered" in answer && !mounted.has(answer.covered) ? [answer.covered] : []
    );
    expect(offScreen).toEqual([]);
  });

  it("no pending feature's model is already used by a control on the campaign screen", () => {
    const stale = Object.entries(CAMPAIGN).flatMap(([name, { answer }]) =>
      "model" in answer && usersOnScreen(answer.model, CAMPAIGN_SCREEN).length > 0
        ? [`${name}: ${usersOnScreen(answer.model, CAMPAIGN_SCREEN).join(", ")}`]
        : []
    );
    expect(
      stale,
      "mark these covered by the control, or say what is still missing"
    ).toEqual([]);
  });
});
