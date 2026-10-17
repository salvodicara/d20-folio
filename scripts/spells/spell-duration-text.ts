/**
 * Edit-time reader of a spell's printed EN duration ("Concentration, up to 10
 * minutes"). The engine never reads prose: the backfill script writes what this
 * returns into the spell data, and the catalogue guard checks the two agree.
 */
import type { SpellDuration } from "../../src/data/types";

const TIMED = /^(concentration, )?(up to )?(\d+) (round|minute|hour|day)s?$/i;

const UNITS = {
  round: "rounds",
  minute: "minutes",
  hour: "hours",
  day: "days",
} as const;

const FIXED: Readonly<Record<string, SpellDuration["kind"]>> = {
  instantaneous: "instantaneous",
  "until dispelled": "until-dispelled",
  "until dispelled or triggered": "until-dispelled-or-triggered",
};

/** The structured duration and the Concentration flag a printed duration states;
 *  anything the clock cannot express is `special`. */
export function parseSpellDurationText(text: string): {
  duration: SpellDuration;
  concentration: boolean;
} {
  const trimmed = text.trim();
  const timed = TIMED.exec(trimmed);
  if (timed) {
    const unit = UNITS[(timed[4] ?? "").toLowerCase() as keyof typeof UNITS];
    return {
      duration: { kind: unit, amount: Number(timed[3]) },
      concentration: timed[1] !== undefined,
    };
  }
  const fixed = FIXED[trimmed.toLowerCase()];
  return {
    duration: { kind: fixed ?? "special" } as SpellDuration,
    concentration: false,
  };
}
