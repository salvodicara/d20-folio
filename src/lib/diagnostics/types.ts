export type DiagnosticsLevel = "debug" | "info" | "warn" | "error";

/** Correlation ids stamped on every breadcrumb and report (design §9). */
export interface DiagnosticsContext {
  sessionId: string;
  buildSha: string;
  appVersion: string;
  uid?: string;
  characterId?: string;
  campaignId?: string;
  encounterId?: string;
  actionId?: string;
}

export interface Breadcrumb {
  /** Epoch ms. */
  t: number;
  level: DiagnosticsLevel;
  /** Dotted event name, e.g. `character.quarantine`. */
  event: string;
  /** Small, JSON-plain, already redacted. */
  data?: Record<string, unknown>;
  characterId?: string;
  campaignId?: string;
  encounterId?: string;
  actionId?: string;
}

/** What is written to `diagnostics/{id}` on an error-level event. */
export interface DiagnosticsReport {
  schema: 1;
  uid: string;
  level: "error";
  event: string;
  message: string;
  createdAtMs: number;
  context: DiagnosticsContext;
  breadcrumbs: Breadcrumb[];
}
