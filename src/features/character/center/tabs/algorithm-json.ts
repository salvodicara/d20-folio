/**
 * algorithm-json — the combat-algorithm import/export codec used by the
 * CombatAlgorithm tab's Import-from-JSON modal.
 *
 * One user-facing JSON vocabulary: each step carries a friendly `icon` field
 * (an alias the parser also accepts for the stored `emoji` field, so an export
 * round-trip with either spelling re-imports), a `title`, and a `steps` list of
 * decision branches (`question?` / `indent?` / `bullets`).
 *
 * ROUND-TRIP CONTRACT: `parseAlgorithmJson(serializeAlgorithmSteps(steps))`
 * yields `steps` identically for id-valued icons (pinned by a regression test) —
 * the import box can therefore show the CURRENT algorithm as an editable
 * template (owner directive: the worked example appears only when the algorithm
 * is empty).
 *
 * ICON IDS ONLY (golden rules 20 + 7): BOTH directions clamp the icon to the
 * `ALGO_ICONS` registry-id vocabulary. Serialize never emits a raw emoji even
 * when a live doc still stores a legacy seed (🎵 → "control"); parse maps a
 * legacy emoji input onto its id and an unknown value onto the default id — a
 * new emoji can never be stored through this surface.
 *
 * Lives beside the tab (not in `src/lib`) because the icon fallback comes from
 * the UI-layer icon registry — the engine never imports the UI (rule 5).
 */

import { resolveAlgoIcon } from "@/components/shared/icon-registry";
import type { CombatAlgorithmStep } from "@/types/character";

/** The distinct failure modes, so the modal can show a friendly why + how-to-fix
 *  message instead of a single generic "invalid" line (item i). */
export type ImportError = "syntax" | "notArray" | "shape";

function isValidSubStep(v: unknown): boolean {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const sub = v as Record<string, unknown>;
  if (!Array.isArray(sub["bullets"])) return false;
  if (!sub["bullets"].every((b: unknown) => typeof b === "string")) return false;
  if ("question" in sub && typeof sub["question"] !== "string") return false;
  if ("indent" in sub && typeof sub["indent"] !== "boolean") return false;
  return true;
}

/** Read the step's icon from EITHER the friendly `icon` alias (the example uses it)
 *  OR the stored `emoji` field (an export round-trip carries it). */
function readIcon(step: Record<string, unknown>): string | undefined {
  if (typeof step["icon"] === "string") return step["icon"];
  if (typeof step["emoji"] === "string") return step["emoji"];
  return undefined;
}

function isValidStep(v: unknown): boolean {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const step = v as Record<string, unknown>;
  if (readIcon(step) === undefined) return false;
  if (typeof step["title"] !== "string") return false;
  if (!Array.isArray(step["steps"])) return false;
  if (!step["steps"].every(isValidSubStep)) return false;
  return true;
}

/** Normalize a validated raw step into the stored `CombatAlgorithmStep` shape:
 *  the friendly `icon` alias maps onto the stored `emoji` field, CLAMPED to a
 *  registry id (legacy emoji → its id; unknown → the default id). */
function normalizeStep(v: unknown): CombatAlgorithmStep {
  const step = v as Record<string, unknown>;
  return {
    emoji: resolveAlgoIcon(readIcon(step) ?? "").id,
    title: step["title"] as string,
    steps: (step["steps"] as Record<string, unknown>[]).map((sub) => ({
      ...(typeof sub["question"] === "string" ? { question: sub["question"] } : {}),
      ...(typeof sub["indent"] === "boolean" ? { indent: sub["indent"] } : {}),
      bullets: sub["bullets"] as string[],
    })),
  };
}

/** Parse + validate, returning the normalized steps OR a typed failure mode so the
 *  modal can explain exactly what went wrong and how to fix it (item i). */
export function parseAlgorithmJson(raw: string): CombatAlgorithmStep[] | ImportError {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return "syntax";
  }
  if (!Array.isArray(parsed)) return "notArray";
  if (!parsed.every(isValidStep)) return "shape";
  return parsed.map(normalizeStep);
}

/**
 * Serialize the stored steps into the SAME user-facing shape the importer
 * accepts: the friendly `icon` alias instead of the internal `emoji` field
 * (NORMALIZED to its registry id so a legacy stored emoji can never surface in
 * the editor), and the optional `question`/`indent` keys emitted only when
 * present. Round-trip safe per the module contract above.
 */
export function serializeAlgorithmSteps(steps: CombatAlgorithmStep[]): string {
  return JSON.stringify(
    steps.map((step) => ({
      icon: resolveAlgoIcon(step.emoji).id,
      title: step.title,
      steps: step.steps.map((sub) => ({
        ...(sub.question !== undefined ? { question: sub.question } : {}),
        ...(sub.indent !== undefined ? { indent: sub.indent } : {}),
        bullets: sub.bullets,
      })),
    })),
    null,
    2
  );
}

/**
 * A PRE-FILLED, realistic example (item i, owner directive): when the character
 * has NO algorithm yet, the import box opens showing a working 2-step algorithm
 * the user edits like a template, instead of a blank box that demands they
 * invent the shape. It uses USER-FACING field names with realistic values (a
 * real Bardic-Inspiration / attack turn) — never an internal type name like
 * "CombatAlgorithmStep".
 */
export const JSON_TEMPLATE = `[
  {
    "icon": "support",
    "title": "Help an ally",
    "steps": [
      {
        "question": "Is an ally about to make an important roll?",
        "bullets": [
          "YES → give them a Bardic Inspiration die (Bonus Action)",
          "NO → move to the next step"
        ]
      }
    ]
  },
  {
    "icon": "melee",
    "title": "Attack",
    "steps": [
      {
        "bullets": [
          "Attack with your Rapier (+8 to hit, 1d8+4 piercing)",
          "If foes are clustered, consider Shatter instead"
        ]
      }
    ]
  }
]`;
