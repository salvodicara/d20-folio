/**
 * The classic hub's typed initiative in the session report. When the DM types a hero's
 * roll on the hero's card, the report gains the line the new UI's «Roll for the
 * missing» writes (`initiative`, `rolledBy: "dm"`): one line per hero per fight. A
 * changed number corrects it, a cleared roll takes it back, and a roll typed after that
 * is a new line (coordinator, 2026-11-12).
 *
 * Each line's id is derived from the fight's epoch, the hero and a generation that
 * moves on with every take-back, so a second record of the same line (a second DM tab)
 * is deduped by the fold. The generations live on this page: after a reload, a typed
 * change re-records the line under the same id (deduped) and corrects it.
 */
import type { PlayEvent, SessionRecorder } from "@/lib/session-log";

export interface DmTypedRoll {
  /** The fight's epoch: a new fight is a new line. */
  epoch: number;
  memberUid: string;
  /** The raw d20 the DM typed; null clears it. */
  roll: number | null;
  /** The hero's initiative bonus, for the line's total. */
  bonus: number;
}

export function createDmInitiativeLines(
  recorder: Pick<SessionRecorder, "record" | "correct" | "retract">
): (typed: DmTypedRoll) => Promise<void> {
  const generations = new Map<string, number>();
  const live = new Set<string>();
  return async ({ epoch, memberUid, roll, bonus }) => {
    const hero = `${String(epoch)}:${memberUid}`;
    const id = `init-dm:${hero}:${String(generations.get(hero) ?? 0)}`;
    if (roll === null) {
      if (!live.has(id)) return;
      live.delete(id);
      generations.set(hero, (generations.get(hero) ?? 0) + 1);
      await recorder.retract(id, { id: `${id}:x` });
      return;
    }
    const event: PlayEvent = {
      kind: "initiative",
      actor: `pc-${memberUid}`,
      roll,
      total: roll + bonus,
      rolledBy: "dm",
    };
    if (live.has(id)) {
      await recorder.correct(id, event);
      return;
    }
    live.add(id);
    await recorder.record(event, { id });
  };
}
