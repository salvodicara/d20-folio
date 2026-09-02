import { createRing } from "./ring";
import { redactAll } from "./redact";
import type {
  Breadcrumb,
  DiagnosticsContext,
  DiagnosticsLevel,
  DiagnosticsReport,
} from "./types";

export const BREADCRUMB_CAPACITY = 500;
export const REPORT_MAX_BYTES = 32 * 1024;
const MAX_MESSAGE_CHARS = 2000;

let context: DiagnosticsContext = { sessionId: "", buildSha: "", appVersion: "" };
const ring = createRing<Breadcrumb>(BREADCRUMB_CAPACITY);
const listeners = new Set<(report: DiagnosticsReport) => void>();
let clock: () => number = () => Date.now();

export function setDiagnosticsContext(patch: Partial<DiagnosticsContext>): void {
  const next: DiagnosticsContext = { ...context };
  for (const [key, value] of Object.entries(patch) as [
    keyof DiagnosticsContext,
    string | undefined,
  ][]) {
    if (value !== undefined) {
      next[key] = value;
      continue;
    }
    // Static per-key deletes (the no-dynamic-delete lint rule); sessionId,
    // buildSha and appVersion are required and never deleted.
    switch (key) {
      case "uid":
        delete next.uid;
        break;
      case "characterId":
        delete next.characterId;
        break;
      case "campaignId":
        delete next.campaignId;
        break;
      case "encounterId":
        delete next.encounterId;
        break;
      case "actionId":
        delete next.actionId;
        break;
    }
  }
  context = next;
}

export function getDiagnosticsContext(): DiagnosticsContext {
  return { ...context };
}

function redactData(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    out[key] = typeof value === "string" ? redactAll(value) : value;
  }
  return out;
}

function messageFor(event: string, data?: Record<string, unknown>): string {
  const code = data?.code ?? data?.message ?? data?.reason;
  const path = data?.path;
  const head = typeof code === "string" ? code : event;
  const text = typeof path === "string" ? `${head} at ${path}` : head;
  return redactAll(text).slice(0, MAX_MESSAGE_CHARS);
}

/** Record a breadcrumb; an error-level event also fans a report out to the listeners. */
export function diagnosticsLog(
  level: DiagnosticsLevel,
  event: string,
  data?: Record<string, unknown>
): void {
  const crumb: Breadcrumb = { t: clock(), level, event };
  if (data) crumb.data = redactData(data);
  for (const key of ["characterId", "campaignId", "encounterId", "actionId"] as const) {
    if (context[key]) crumb[key] = context[key];
  }
  ring.push(crumb);
  if (level !== "error" || !context.uid || listeners.size === 0) return;
  const report = buildReport({
    uid: context.uid,
    event,
    message: messageFor(event, data),
    context: getDiagnosticsContext(),
    breadcrumbs: ring.snapshot(),
    now: clock(),
  });
  for (const listener of listeners) listener(report);
}

export function onErrorReport(listener: (report: DiagnosticsReport) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function breadcrumbSnapshot(): Breadcrumb[] {
  return ring.snapshot();
}

/** Seed the ring from a persisted snapshot (previous page load), oldest first. */
export function seedBreadcrumbs(crumbs: readonly Breadcrumb[]): void {
  for (const crumb of crumbs) ring.push(crumb);
}

function byteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

export function buildReport(args: {
  uid: string;
  event: string;
  message: string;
  context: DiagnosticsContext;
  breadcrumbs: Breadcrumb[];
  now: number;
}): DiagnosticsReport {
  const report: DiagnosticsReport = {
    schema: 1,
    uid: args.uid,
    level: "error",
    event: args.event,
    message: args.message.slice(0, MAX_MESSAGE_CHARS),
    createdAtMs: args.now,
    context: args.context,
    breadcrumbs: [...args.breadcrumbs],
  };
  while (report.breadcrumbs.length > 0 && byteLength(report) > REPORT_MAX_BYTES) {
    // Drop from the oldest end in chunks so a 500-crumb ring trims in a few passes.
    report.breadcrumbs.splice(0, Math.max(1, Math.floor(report.breadcrumbs.length / 8)));
  }
  return report;
}

/** Tests only. */
export function resetDiagnostics(now: () => number = () => Date.now()): void {
  context = { sessionId: "", buildSha: "", appVersion: "" };
  ring.clear();
  listeners.clear();
  clock = now;
}
