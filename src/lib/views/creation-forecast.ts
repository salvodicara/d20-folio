/**
 * Consequence forecast for guided creation: "what changes if I choose X".
 *
 * A pure projection over two `CreationPreview`s (research 2026-09-09 §8.4). It
 * carries ids and numbers only, never display text: the screen owner localizes
 * every key. Nothing here touches the draft it forecasts from.
 */
import { ABILITIES } from "../homebrew/model";
import type { OriginFact } from "../homebrew/origin-build";
import { previewCreation, type CreationPreview } from "../character-creation/compose";
import type { CreationDraft } from "../character-creation/model";

export interface ForecastLine {
  key: string;
  before: string | number | null;
  after: string | number | null;
  kind: "number" | "list" | "text";
}
export interface CreationForecast {
  lines: ForecastLine[];
  /** Fact signatures present after but not before (`selectionId|path|benefit`). */
  added: string[];
  /** Fact signatures present before but not after. */
  removed: string[];
}

const signature = (fact: OriginFact) =>
  fact.selectionId + "|" + fact.path + "|" + JSON.stringify(fact.benefit);
const openChoices = (preview: CreationPreview) =>
  preview.composition.activeChoices.filter(
    (c) => c.active && c.selected.length !== c.choice.count
  ).length;

export function forecastCreation(
  before: CreationPreview,
  after: CreationPreview
): CreationForecast {
  const lines: ForecastLine[] = [];
  const line = (
    key: string,
    b: string | number | null,
    a: string | number | null,
    kind: ForecastLine["kind"] = "number"
  ) => {
    if (b !== a) lines.push({ key, before: b, after: a, kind });
  };
  line("maxHp", before.maxHp, after.maxHp);
  line("gold", before.gold, after.gold);
  for (const ability of ABILITIES)
    line("ability." + ability, before.abilities[ability], after.abilities[ability]);
  const validity = (p: CreationPreview) => (p.valid ? "valid" : "invalid");
  line("valid", validity(before), validity(after), "text");
  line("issueCount", before.issues.length, after.issues.length);
  line("activeChoiceCount", openChoices(before), openChoices(after));
  const was = new Set(before.composition.facts.map(signature));
  const now = new Set(after.composition.facts.map(signature));
  return {
    lines,
    added: [...now].filter((s) => !was.has(s)),
    removed: [...was].filter((s) => !now.has(s)),
  };
}

/** Previews the draft as it is and as `mutate` would leave it, without touching it. */
export function speculate(
  draft: CreationDraft,
  mutate: (d: CreationDraft) => CreationDraft
): { before: CreationPreview; after: CreationPreview; forecast: CreationForecast } {
  const before = previewCreation(structuredClone(draft));
  const after = previewCreation(mutate(structuredClone(draft)));
  return { before, after, forecast: forecastCreation(before, after) };
}
