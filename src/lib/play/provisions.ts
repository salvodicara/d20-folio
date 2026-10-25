/**
 * Dehydration and Malnutrition (SRD 5.2.1 Rules Glossary hazards), counted at each
 * day's end from what the creature drank and ate that day:
 *
 *  - drinking less than half the day's water gains 1 Exhaustion level;
 *  - eating something but less than half the day's food asks a DC 10 Constitution
 *    save, a failure gains 1 level (the app never rolls: the caller resolves the saves
 *    the day ends ask);
 *  - eating nothing for 5 days gains 1 level at the end of the fifth day and each day
 *    after without food;
 *  - those levels can't be removed until the creature drinks (or eats) the full
 *    day's amount: a Long Rest never takes Exhaustion below {@link longRestExhaustionFloor}.
 *
 * `session.provisions` keeps the count of food-less days and the levels each hazard
 * added (`thirst`, `hunger`); it is absent while nothing is owed.
 */
import type { CreatureSize } from "@/data/types";
import type { CharacterDoc, SessionState } from "@/types/character";
import { setExhaustion } from "./vitals";

/** Water (gallons) and food (pounds) a creature of each size needs per day. */
const NEED: Readonly<Record<CreatureSize, number>> = {
  Tiny: 0.25,
  Small: 1,
  Medium: 1,
  Large: 4,
  Huge: 16,
  Gargantuan: 64,
};

/** Days without food before each further day gains a level. */
const FAST_DAYS = 5;
const MAX_EXHAUSTION = 6;

export interface DayIntake {
  waterGallons: number;
  foodPounds: number;
}

type Provisions = NonNullable<SessionState["provisions"]>;

/** What a creature of `size` needs each day. */
export function dailyNeeds(size: CreatureSize): DayIntake {
  return { waterGallons: NEED[size], foodPounds: NEED[size] };
}

function stored(provisions: Provisions): Provisions | undefined {
  const out: Provisions = {};
  if (provisions.daysWithoutFood) out.daysWithoutFood = provisions.daysWithoutFood;
  if (provisions.thirst) out.thirst = provisions.thirst;
  if (provisions.hunger) out.hunger = provisions.hunger;
  return Object.keys(out).length > 0 ? out : undefined;
}

function withProvisions(
  doc: CharacterDoc,
  provisions: Provisions,
  exhaustion: number
): CharacterDoc {
  const session = setExhaustion(doc, exhaustion) ?? doc.session;
  const next = { ...session };
  const kept = stored(provisions);
  if (kept) next.provisions = kept;
  else delete next.provisions;
  return { ...doc, session: next };
}

/**
 * `days` day ends with the same intake each day. Returns the character after them
 * and how many DC 10 Constitution saves the days' scant meals ask
 * ({@link resolveMalnutritionSaves} applies the failures).
 */
export function endDays(
  doc: CharacterDoc,
  days: number,
  intake: DayIntake,
  size: CreatureSize = "Medium"
): { doc: CharacterDoc; malnutritionSaves: number } {
  const need = NEED[size];
  const p: Provisions = { ...(doc.session.provisions ?? {}) };
  let exhaustion = doc.session.exhaustion;
  let saves = 0;
  const gain = (): boolean => {
    if (exhaustion >= MAX_EXHAUSTION) return false;
    exhaustion += 1;
    return true;
  };
  const count = Number.isSafeInteger(days) && days > 0 ? days : 0;
  for (let day = 0; day < count; day += 1) {
    if (intake.waterGallons >= need) p.thirst = 0;
    else if (intake.waterGallons < need / 2 && gain()) p.thirst = (p.thirst ?? 0) + 1;
    if (intake.foodPounds <= 0) {
      p.daysWithoutFood = (p.daysWithoutFood ?? 0) + 1;
      if (p.daysWithoutFood >= FAST_DAYS && gain()) p.hunger = (p.hunger ?? 0) + 1;
      continue;
    }
    p.daysWithoutFood = 0;
    if (intake.foodPounds >= need) p.hunger = 0;
    else if (intake.foodPounds < need / 2) saves += 1;
  }
  return { doc: withProvisions(doc, p, exhaustion), malnutritionSaves: saves };
}

/** `failures` of the day ends' Constitution saves failed: 1 level each, owed to
 *  malnutrition. */
export function resolveMalnutritionSaves(
  doc: CharacterDoc,
  failures: number
): CharacterDoc {
  const room = MAX_EXHAUSTION - doc.session.exhaustion;
  const gained = Math.max(0, Math.min(room, Math.round(failures)));
  if (gained === 0) return doc;
  const p = { ...(doc.session.provisions ?? {}) };
  p.hunger = (p.hunger ?? 0) + gained;
  return withProvisions(doc, p, doc.session.exhaustion + gained);
}

/** The Exhaustion level a Long Rest can't go below: the levels thirst and hunger
 *  added that no full day's water or food has freed yet. */
export function longRestExhaustionFloor(doc: CharacterDoc): number {
  const p = doc.session.provisions;
  const owed = (p?.thirst ?? 0) + (p?.hunger ?? 0);
  return Math.min(doc.session.exhaustion, owed);
}
