/**
 * The session report's sections, the one way every surface builds them (the classic
 * recap, the new Diario, the new Play rail): a fight nobody ended closes after a rest or
 * an idle hour, a fight nobody started is inferred from the players' blows (attacks read
 * from the catalogue), then the report is built. Read time only, nothing is written.
 * Kept out of the session-log index: it reaches the catalogues and the fight engine.
 */
import { isAttackSource } from "./attack-source";
import { closeForgottenFights } from "./close-forgotten-fights";
import type { SessionEntry } from "./fold";
import { inferFights } from "./infer-fights";
import { buildReport, type ReportSection } from "./report";

export function sessionReportSections(entries: readonly SessionEntry[]): ReportSection[] {
  return buildReport(
    inferFights(closeForgottenFights(entries), { isAttack: isAttackSource })
  );
}
