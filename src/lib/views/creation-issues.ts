/**
 * Creation issue presenter: one `OriginDiagnostic` to one player-facing message
 * key (research 2026-09-09 §8.5).
 *
 * Every message under `creationV2.fix.<code>` names the FIELD and the FIX in the
 * second person ("Choose a subclass", never "Required"); unknown codes fall back
 * to `creationV2.fix.default`. The caller supplies the human label of the control
 * as `field` and, when useful, the `count` still owed, then renders `t(key, params)`.
 * The screen owner wires this seam; nothing here touches React or a store.
 */
import i18n from "@/i18n";
import type { OriginDiagnostic } from "../homebrew/origin-build";

export interface CreationIssueMessage {
  path: string;
  code: string;
  severity: OriginDiagnostic["severity"];
  key: string;
  params: Record<string, string | number>;
}

const PREFIX = "creationV2.fix.";
export const CREATION_ISSUE_DEFAULT_KEY = PREFIX + "default";

export function creationIssueKey(code: string, exists: (key: string) => boolean): string {
  const key = PREFIX + code;
  return exists(key) ? key : CREATION_ISSUE_DEFAULT_KEY;
}

export function creationIssueMessage(
  issue: OriginDiagnostic,
  field: string,
  count?: number,
  exists: (key: string) => boolean = (key) => i18n.exists(key)
): CreationIssueMessage {
  return {
    path: issue.path,
    code: issue.code,
    severity: issue.severity,
    key: creationIssueKey(issue.code, exists),
    params: { field, ...(count === undefined ? {} : { count }) },
  };
}
